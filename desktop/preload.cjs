'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  getSetup: () => ipcRenderer.invoke('setup:get'),
  saveSetup: (input) => ipcRenderer.invoke('setup:save', input),
});
