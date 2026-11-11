// main.cjs
// Electron main process for the Heartwritten writer.
'use strict';

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain, session } = require('electron');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// Packaged builds load the SDK's native runtime from resources/smartspectra.
if (app.isPackaged && !process.env.SMARTSPECTRA_CAPI_PATH) {
  const LIB = { darwin: 'libsmartspectra_capi.dylib', win32: 'smartspectra_capi.dll', linux: 'libsmartspectra_capi.so' }[process.platform];
  if (LIB) process.env.SMARTSPECTRA_CAPI_PATH = path.join(process.resourcesPath, 'smartspectra', LIB);
}

const SIMULATE = process.env.HEARTWRITTEN_SIMULATE === '1';
// Where shared links open. Deploy dist/reader anywhere static and set this.
const READER_URL = process.env.HEARTWRITTEN_READER_URL || readConfig().readerUrl || '';

function readConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'heartwritten.config.json'), 'utf8')); } catch { return {}; }
}

// The key never ships in the repo: it comes from the environment or a local
// file that .gitignore keeps out of git.
function apiKey() {
  if (process.env.SMARTSPECTRA_API_KEY) return process.env.SMARTSPECTRA_API_KEY.trim();
  for (const p of [path.join(ROOT, '.smartspectra-key'), path.join(app.getPath('userData'), 'smartspectra-key')]) {
    try { const k = fs.readFileSync(p, 'utf8').trim(); if (k) return k; } catch { /* not there */ }
  }
  return '';
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 860,
    minWidth: 720,
    backgroundColor: '#e7dcc7',
    title: 'Heartwritten',
    webPreferences: {
      preload: path.join(DIST, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  if (!SIMULATE) {
    const { bindSmartSpectraIpc } = require('@smartspectra/node-sdk/main');
    bindSmartSpectraIpc(mainWindow);
  }
  lockDown(mainWindow);
  mainWindow.loadFile(path.join(DIST, 'writer', 'index.html'));
}

function lockDown(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

// The reader opens in its own window with no preload and no camera.
function openPreview(token) {
  if (!/^v1\.[A-Za-z0-9_-]+$/.test(token)) return false;
  const win = new BrowserWindow({
    width: 900, height: 900, title: 'Your letter, as they will see it', backgroundColor: '#e9dfcc',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(path.join(DIST, 'reader', 'index.html'), { hash: token });
  return true;
}

app.whenReady().then(() => {
  // Camera only, video only, only for the writer page.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const url = (details && details.requestingUrl) || (wc && wc.getURL()) || '';
    const media = (details && details.mediaTypes) || [];
    const ok = permission === 'media' && media.length === 1 && media[0] === 'video'
      && url.startsWith('file://') && url.includes('/dist/writer/')
      && mainWindow && wc === mainWindow.webContents;
    callback(ok);
  });

  ipcMain.handle('hw:config', () => ({ hasKey: !!apiKey(), simulate: SIMULATE, readerUrl: READER_URL }));
  ipcMain.handle('hw:api-key', (e) => (mainWindow && e.sender === mainWindow.webContents ? apiKey() : ''));
  ipcMain.handle('hw:preview', (_e, token) => openPreview(token));

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

