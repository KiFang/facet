/**
 * Facet OS desktop — главный процесс Electron.
 * Окно с редактором (собранный dist/ через протокол app://) + локальный сервер клуба (local-server.cjs).
 */
'use strict';

const { app, BrowserWindow, ipcMain, net, protocol, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { LocalServer } = require('./local-server.cjs');

const DIST = path.join(__dirname, '..', 'dist');
const OS = { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform] || process.platform;
const PB_EXE = process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase';
const PB_BINARY = app.isPackaged
  ? path.join(process.resourcesPath, 'pocketbase', PB_EXE)
  : path.join(__dirname, 'bin', `${OS}-${process.arch}`, PB_EXE);

// Отдельная папка данных для автотестов (FACET_USER_DATA) — чтобы не трогать настоящую.
if (process.env.FACET_USER_DATA) app.setPath('userData', process.env.FACET_USER_DATA);

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let server = null;
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'Facet OS',
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Внешние ссылки (Google Fonts docs, PocketBase, портал) — в системном браузере.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://') && !url.startsWith(process.env.FACET_DEV_URL || '\0')) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });

  void win.loadURL(process.env.FACET_DEV_URL || 'app://facet/index.html');
}

function registerIpc() {
  const handle = (channel, fn) =>
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return { ok: true, value: await fn(...args) };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    });

  handle('local:info', () => server.info());
  handle('local:apply', (bundle) => server.apply(bundle));
  handle('local:start', () => server.start());
  handle('local:stop', async () => {
    await server.stop();
    return server.info();
  });
  handle('local:rollback', () => server.rollback());
  handle('local:setLan', (lan) => server.setLan(lan));
  handle('local:openUrl', (url) => {
    if (!/^http:\/\/[0-9.]+:\d+\//.test(url)) throw new Error('Недопустимый адрес');
    return shell.openExternal(url);
  });
  handle('local:openFolder', () => shell.openPath(server.baseDir));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.handle('app', (request) => {
      const { pathname } = new URL(request.url);
      let file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
      if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
      return net.fetch(pathToFileURL(file).toString());
    });

    server = new LocalServer({ baseDir: path.join(app.getPath('userData'), 'club'), pbBinary: PB_BINARY });
    registerIpc();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  // Сервер клуба живёт, пока открыто приложение: при выходе корректно останавливаем PocketBase.
  let quitting = false;
  app.on('before-quit', (event) => {
    if (quitting || !server || !server.proc) return;
    event.preventDefault();
    quitting = true;
    void server.stop().finally(() => app.quit());
  });
}
