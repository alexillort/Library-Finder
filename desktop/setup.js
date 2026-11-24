'use strict';
const $ = (id) => document.getElementById(id);
const redirectFor = (port) => `http://127.0.0.1:${port}/api/auth/mendeley/callback`;

function showError(text) {
  $('error').textContent = text;
  $('error').hidden = !text;
}

function updateRedirect() {
  const port = Number($('port').value);
  $('redirect').textContent = Number.isInteger(port) && port >= 1024 && port <= 65535 ? redirectFor(port) : 'Puerto no válido';
}

async function submit(demoOnly) {
  showError('');
  for (const id of ['save', 'demo']) $(id).disabled = true;
  try {
    const result = await window.desktop.saveSetup({
      port: Number($('port').value),
      clientId: $('clientId').value,
      clientSecret: $('clientSecret').value,
      demoOnly,
    });
    if (!result.ok) showError(result.error);
  } catch (error) {
    showError(error.message);
  } finally {
    for (const id of ['save', 'demo']) $(id).disabled = false;
  }
}

async function init() {
  const message = new URLSearchParams(location.search).get('message');
  if (message) { $('message').textContent = message; $('message').hidden = false; }
  const setup = await window.desktop.getSetup();
  $('edition').textContent = `${setup.portable ? 'Portable' : 'Instalada'} · versión ${setup.version}`;
  $('port').value = String(setup.port);
  $('clientId').value = setup.clientId;
  $('secretHint').textContent = setup.hasSecret ? 'Ya hay un secreto guardado. Déjalo vacío para conservarlo.' : '';
  $('dataDir').textContent = `Datos de la app: ${setup.dataDir}`;
  $('developers').addEventListener('click', (event) => { event.preventDefault(); window.open(setup.developersUrl); });
  updateRedirect();
}

$('port').addEventListener('input', updateRedirect);
$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('redirect').textContent);
  $('copy').textContent = 'Copiado';
  setTimeout(() => { $('copy').textContent = 'Copiar'; }, 1500);
});
$('form').addEventListener('submit', (event) => { event.preventDefault(); submit(false); });
$('demo').addEventListener('click', () => submit(true));
init().catch((error) => showError(error.message));
