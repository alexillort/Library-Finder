'use strict';
// Starts the Next.js standalone server inside Electron's Node runtime and stops
// it when the desktop app goes away (the IPC channel closes with the parent).
const path = require('node:path');
const { pathToFileURL } = require('node:url');

process.on('disconnect', () => process.exit(0));
process.chdir(__dirname);
import(pathToFileURL(path.join(__dirname, 'server.js')).href).catch((error) => {
  console.error(error);
  process.exit(1);
});
