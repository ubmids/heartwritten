// preload.cjs
// Bundled into dist/preload.cjs. It installs SmartSpectra's own bridge
// (window.__smartspectraBridge) and a tiny Heartwritten bridge. Nothing
// else from Node or Electron reaches the page.
'use strict';

require('@smartspectra/node-sdk/preload');
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('heartwritten', {
  getConfig: () => ipcRenderer.invoke('hw:config'),
  getApiKey: () => ipcRenderer.invoke('hw:api-key'),
  openPreview: (token) => ipcRenderer.invoke('hw:preview', String(token)),
});
