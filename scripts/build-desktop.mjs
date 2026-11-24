// Builds the Windows desktop app.
//   node scripts/build-desktop.mjs --prepare-only   server + app files in .desktop-build/
//   node scripts/build-desktop.mjs portable nsis    also packages into release/
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const stage = join(root, '.desktop-build');
const args = process.argv.slice(2);
const prepareOnly = args.includes('--prepare-only');
const targets = args.filter((arg) => ['portable', 'nsis'].includes(arg));
if (!prepareOnly && targets.length === 0) {
  console.error('Uso: node scripts/build-desktop.mjs [--prepare-only] [portable] [nsis]');
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function step(label) { console.log(`\n▸ ${label}`); }

// 1. Next.js standalone server.
step('Compilando Next.js (standalone)');
rmSync(join(root, '.next-desktop', 'standalone'), { recursive: true, force: true });
const next = spawnSync(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, DESKTOP_BUILD: '1', NEXT_TELEMETRY_DISABLED: '1' },
});
if (next.status !== 0) process.exit(next.status ?? 1);
const standalone = join(root, '.next-desktop', 'standalone');
if (!existsSync(join(standalone, 'server.js'))) throw new Error('Next.js no generó .next-desktop/standalone/server.js');

// 2. Stage the server: standalone output + static assets + public + runner.
step('Preparando .desktop-build/');
rmSync(stage, { recursive: true, force: true });
const serverOut = join(stage, 'server');
cpSync(standalone, serverOut, { recursive: true });
cpSync(join(root, '.next-desktop', 'static'), join(serverOut, '.next-desktop', 'static'), { recursive: true });
cpSync(join(root, 'public'), join(serverOut, 'public'), { recursive: true });
cpSync(join(root, 'desktop', 'server-runner.cjs'), join(serverOut, 'server-runner.cjs'));
// Credentials come from the desktop config at runtime; never ship local env files.
for (const file of readdirSync(serverOut)) {
  if (file.startsWith('.env')) rmSync(join(serverOut, file), { force: true });
}

// 3. Stage the Electron app (its own package.json keeps web dependencies out of app.asar).
const appOut = join(stage, 'app');
mkdirSync(appOut, { recursive: true });
for (const file of ['main.cjs', 'preload.cjs', 'setup.html', 'setup.css', 'setup.js']) {
  cpSync(join(root, 'desktop', file), join(appOut, file));
}
writeFileSync(join(appOut, 'package.json'), JSON.stringify({
  name: pkg.name,
  productName: 'Library Finder',
  version: pkg.version,
  description: 'Explorador de bibliotecas Mendeley con columnas tipo Finder',
  author: 'Library Finder',
  main: 'main.cjs',
  license: 'UNLICENSED',
}, null, 2));

// 4. App icon rendered from the favicon (sharp is already installed by the toolchain).
const iconPath = join(stage, 'icon.png');
try {
  const { default: sharp } = await import('sharp');
  await sharp(join(root, 'public', 'favicon.svg'), { density: 1200 }).resize(512, 512).png().toFile(iconPath);
} catch (error) {
  console.warn(`Sin icono propio (${error.message}); se usará el de Electron.`);
}

if (prepareOnly) {
  console.log('\nListo. Prueba con: npm run desktop:start');
  process.exit(0);
}

// 5. Package with electron-builder.
step(`Empaquetando: ${targets.join(', ')}`);
const { build, Platform, Arch } = await import('electron-builder');
const electronVersion = JSON.parse(readFileSync(join(root, 'node_modules', 'electron', 'package.json'), 'utf8')).version;
const output = join(root, 'release');
rmSync(output, { recursive: true, force: true });
await build({
  targets: Platform.WINDOWS.createTarget(targets, Arch.x64),
  publish: 'never',
  config: {
    appId: 'app.libraryfinder.mendeley',
    productName: 'Library Finder',
    electronVersion,
    npmRebuild: false,
    directories: { app: appOut, output },
    files: ['**/*'],
    asar: true,
    extraResources: [{ from: serverOut, to: 'server', filter: ['**/*'] }],
    win: {
      ...(existsSync(iconPath) ? { icon: iconPath } : {}),
      executableName: 'LibraryFinder',
    },
    portable: { artifactName: 'LibraryFinder-Portable-${version}.${ext}' },
    nsis: {
      artifactName: 'LibraryFinder-Setup-${version}.${ext}',
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: 'Library Finder',
      deleteAppDataOnUninstall: false,
    },
  },
});

// 6. Sanity check: the unpacked app must contain the server and its static assets.
const unpacked = join(output, 'win-unpacked', 'resources', 'server');
for (const required of ['server.js', 'server-runner.cjs', join('.next-desktop', 'static'), 'public']) {
  if (!existsSync(join(unpacked, required))) throw new Error(`Falta ${required} en el paquete (${unpacked}).`);
}
console.log(`\nListo. Ejecutables en ${output}`);
