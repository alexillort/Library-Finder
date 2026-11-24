'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage, session, shell } = require('electron');
const { fork } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const APP_NAME = 'Library Finder';
const DEFAULT_PORT = 3000;
const MENDELEY_DEVELOPERS = 'https://dev.mendeley.com/myapps.html';

// Portable build: keep config, IndexedDB and cookies next to the .exe.
const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
if (portableDir) app.setPath('userData', path.join(portableDir, 'LibraryFinderData'));

const serverDir = app.isPackaged
  ? path.join(process.resourcesPath, 'server')
  : path.join(__dirname, '..', '.desktop-build', 'server');
const configPath = () => path.join(app.getPath('userData'), 'config.json');
const logPath = () => path.join(app.getPath('userData'), 'server.log');

let mainWindow = null;
let setupWindow = null;
let server = null;
let config = null;
let authFlow = false;
let quitting = false;

// ---------- configuration ----------

function encrypt(value) {
  if (!value) return null;
  if (!safeStorage.isEncryptionAvailable()) throw new Error('El cifrado del sistema no está disponible.');
  return safeStorage.encryptString(value).toString('base64');
}

function decrypt(value) {
  if (!value) return '';
  try { return safeStorage.decryptString(Buffer.from(value, 'base64')); } catch { return null; }
}

function readConfig() {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { return null; }
  const clientSecret = decrypt(raw.clientSecret);
  const sessionSecret = decrypt(raw.sessionSecret);
  return {
    port: validPort(raw.port) ? raw.port : DEFAULT_PORT,
    clientId: typeof raw.clientId === 'string' ? raw.clientId : '',
    clientSecret: clientSecret ?? '',
    sessionSecret: sessionSecret && /^[a-f\d]{64}$/i.test(sessionSecret) ? sessionSecret : '',
    // A secret encrypted by another Windows account or PC can't be read.
    unreadable: clientSecret === null && !!raw.clientSecret,
  };
}

function writeConfig(next) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  const data = {
    port: next.port,
    clientId: next.clientId,
    clientSecret: encrypt(next.clientSecret),
    sessionSecret: encrypt(next.sessionSecret),
  };
  fs.writeFileSync(configPath(), JSON.stringify(data, null, 2), { mode: 0o600 });
}

const validPort = (port) => Number.isInteger(port) && port >= 1024 && port <= 65535;
const appOrigin = () => `http://127.0.0.1:${config.port}`;
const redirectUri = (port) => `http://127.0.0.1:${port}/api/auth/mendeley/callback`;

// ---------- embedded Next.js server ----------

function portFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

function waitForServer(port, child, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const onExit = (code) => reject(new Error(`El servidor se detuvo al iniciar (código ${code}).`));
    child.once('exit', onExit);
    const attempt = () => {
      const request = http.get({ host: '127.0.0.1', port, path: '/api/auth/mendeley/status', timeout: 2000 }, (response) => {
        response.resume();
        if (response.statusCode === 200) { child.off('exit', onExit); resolve(); } else retry();
      });
      request.on('error', retry);
      request.on('timeout', () => request.destroy());
    };
    const retry = () => {
      if (Date.now() > deadline) { child.off('exit', onExit); reject(new Error('El servidor no respondió a tiempo.')); return; }
      setTimeout(attempt, 300);
    };
    attempt();
  });
}

function stopServer() {
  if (!server) return Promise.resolve();
  const child = server;
  server = null;
  return new Promise((resolve) => {
    if (child.exitCode !== null) { resolve(); return; }
    child.once('exit', () => resolve());
    child.kill();
    setTimeout(resolve, 5000);
  });
}

async function startServer() {
  await stopServer();
  if (!fs.existsSync(path.join(serverDir, 'server-runner.cjs'))) {
    throw new Error(`No se encontró el servidor en ${serverDir}. Ejecuta "npm run desktop:prepare".`);
  }
  if (!(await portFree(config.port))) {
    const error = new Error(`El puerto ${config.port} ya está en uso, quizá por "npm run dev" u otra copia de la app.`);
    error.portInUse = true;
    throw error;
  }
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    PORT: String(config.port),
    HOSTNAME: '127.0.0.1',
    SESSION_SECRET: config.sessionSecret,
    MENDELEY_REDIRECT_URI: redirectUri(config.port),
  };
  delete env.MENDELEY_CLIENT_ID;
  delete env.MENDELEY_CLIENT_SECRET;
  if (config.clientId && config.clientSecret) {
    env.MENDELEY_CLIENT_ID = config.clientId;
    env.MENDELEY_CLIENT_SECRET = config.clientSecret;
  }
  const log = fs.createWriteStream(logPath(), { flags: 'w' });
  const child = fork(path.join(serverDir, 'server-runner.cjs'), [], {
    cwd: serverDir,
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on('exit', (code) => {
    if (server === child && !quitting) {
      server = null;
      dialog.showErrorBox(APP_NAME, `El servidor interno se detuvo (código ${code}). Revisa ${logPath()}.`);
    }
  });
  server = child;
  await waitForServer(config.port, child);
}

// ---------- windows ----------

const isAppUrl = (url) => { try { return new URL(url).origin === appOrigin(); } catch { return false; } };
const isHttps = (url) => { try { return new URL(url).protocol === 'https:'; } catch { return false; } };
const openExternal = (url) => { try { if (['http:', 'https:', 'mailto:'].includes(new URL(url).protocol)) shell.openExternal(url); } catch { /* ignore */ } };

function guardNavigation(contents) {
  const guard = (event, url) => {
    if (isAppUrl(url)) {
      authFlow = new URL(url).pathname === '/api/auth/mendeley/start';
      return;
    }
    // Leaving the app is only allowed during the Mendeley sign-in that the app started.
    if (authFlow && isHttps(url)) return;
    event.preventDefault();
    openExternal(url);
  };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', guard);
  contents.on('did-create-window', (child) => guardNavigation(child.webContents));
  contents.setWindowOpenHandler(({ url }) => {
    // Open/preview of PDFs uses blob: URLs created by the app.
    if (url.startsWith(`blob:${appOrigin()}/`)) {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { sandbox: true, contextIsolation: true } } };
    }
    openExternal(url);
    return { action: 'deny' };
  });
}

function createMainWindow() {
  if (mainWindow) { mainWindow.loadURL(appOrigin()); return; }
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  guardNavigation(mainWindow.webContents);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(appOrigin());
}

function openSetup(message = '') {
  if (setupWindow) { setupWindow.focus(); return; }
  setupWindow = new BrowserWindow({
    width: 620,
    height: 720,
    resizable: false,
    minimizable: false,
    title: `${APP_NAME} · Configuración`,
    parent: mainWindow ?? undefined,
    modal: !!mainWindow,
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  setupWindow.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  setupWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  const own = setupWindow;
  setupWindow.on('closed', () => {
    if (setupWindow === own) setupWindow = null;
    if (!mainWindow && !quitting) app.quit();
  });
  setupWindow.loadFile(path.join(__dirname, 'setup.html'), { query: { message } });
}

async function launch() {
  try {
    await startServer();
    createMainWindow();
  } catch (error) {
    if (error.portInUse || !mainWindow) {
      openSetup(error.message);
    } else {
      dialog.showErrorBox(APP_NAME, `${error.message}\n\nRegistro: ${logPath()}`);
    }
  }
}

// ---------- setup IPC ----------

const fromSetup = (event) => setupWindow && event.sender === setupWindow.webContents;

ipcMain.handle('setup:get', (event) => {
  if (!fromSetup(event)) throw new Error('Origen no permitido.');
  return {
    port: config.port,
    clientId: config.clientId,
    hasSecret: !!config.clientSecret,
    defaultPort: DEFAULT_PORT,
    developersUrl: MENDELEY_DEVELOPERS,
    dataDir: app.getPath('userData'),
    portable: !!portableDir,
    version: app.getVersion(),
  };
});

ipcMain.handle('setup:save', async (event, input) => {
  if (!fromSetup(event)) throw new Error('Origen no permitido.');
  const port = Number(input?.port);
  const clientId = typeof input?.clientId === 'string' ? input.clientId.trim() : '';
  const clientSecret = typeof input?.clientSecret === 'string' ? input.clientSecret.trim() : '';
  if (!validPort(port)) return { ok: false, error: 'El puerto debe estar entre 1024 y 65535.' };
  if (clientId.length > 200 || clientSecret.length > 500) return { ok: false, error: 'Valor demasiado largo.' };
  const next = {
    port,
    clientId: input?.demoOnly ? '' : clientId,
    clientSecret: input?.demoOnly ? '' : clientSecret || config.clientSecret,
    sessionSecret: config.sessionSecret || crypto.randomBytes(32).toString('hex'),
  };
  if (!input?.demoOnly && (!next.clientId || !next.clientSecret)) {
    return { ok: false, error: 'Introduce Client ID y Client Secret, o elige "Usar solo Demo".' };
  }
  try {
    writeConfig(next);
  } catch (error) {
    return { ok: false, error: error.message };
  }
  config = { ...next, unreadable: false };
  try {
    await startServer();
  } catch (error) {
    return { ok: false, error: error.message };
  }
  // Create the main window first so closing the setup window doesn't quit the app.
  createMainWindow();
  const done = setupWindow;
  setupWindow = null;
  done?.destroy();
  return { ok: true };
});

// ---------- menu ----------

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Archivo',
      submenu: [
        { label: 'Configurar Mendeley…', click: () => openSetup() },
        { label: 'Abrir carpeta de datos', click: () => shell.openPath(app.getPath('userData')) },
        { label: 'Ver registro del servidor', click: () => shell.openPath(logPath()) },
        { type: 'separator' },
        { role: 'quit', label: 'Salir' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Volver a la biblioteca', accelerator: 'Alt+Home', click: () => { authFlow = false; mainWindow?.loadURL(appOrigin()); } },
        {
          label: 'Mostrar u ocultar barra lateral',
          // The page handles Ctrl+B itself; the menu only shows the shortcut.
          accelerator: 'CmdOrCtrl+B',
          registerAccelerator: false,
          click: () => mainWindow?.webContents.executeJavaScript("window.dispatchEvent(new Event('lf:toggle-sidebar'))").catch(() => {}),
        },
        { type: 'separator' },
        { role: 'reload', label: 'Recargar' },
        { type: 'separator' },
        { role: 'zoomIn', label: 'Acercar' },
        { role: 'zoomOut', label: 'Alejar' },
        { role: 'resetZoom', label: 'Tamaño real' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        { label: 'Mendeley Developers', click: () => openExternal(MENDELEY_DEVELOPERS) },
        {
          label: `Acerca de ${APP_NAME}`,
          click: () => dialog.showMessageBox({
            type: 'info',
            title: APP_NAME,
            message: `${APP_NAME} ${app.getVersion()}`,
            detail: `${portableDir ? 'Versión portable' : 'Versión instalada'}\nDatos: ${app.getPath('userData')}`,
          }),
        },
      ],
    },
  ]));
}

// ---------- lifecycle ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const target = setupWindow ?? mainWindow;
    if (target) { if (target.isMinimized()) target.restore(); target.focus(); }
  });

  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
      callback(permission === 'clipboard-sanitized-write');
    });
    buildMenu();
    const saved = readConfig();
    config = saved ?? { port: DEFAULT_PORT, clientId: '', clientSecret: '', sessionSecret: '', unreadable: false };
    if (!saved) { openSetup(); return; }
    if (saved.unreadable) {
      openSetup('No se pudo descifrar el Client Secret (¿otro equipo o usuario de Windows?). Vuelve a introducirlo.');
      return;
    }
    if (!config.sessionSecret) {
      config.sessionSecret = crypto.randomBytes(32).toString('hex');
      writeConfig(config);
    }
    await launch();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { quitting = true; stopServer(); });
}
