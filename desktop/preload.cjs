'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/** Результат IPC: { ok, value } | { ok: false, error } → значение или исключение в редакторе. */
const call = async (channel, ...args) => {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (!res.ok) throw new Error(res.error);
  return res.value;
};

contextBridge.exposeInMainWorld('facetDesktop', {
  platform: process.platform,
  localServer: {
    info: () => call('local:info'),
    apply: (bundle) => call('local:apply', bundle),
    start: () => call('local:start'),
    stop: () => call('local:stop'),
    rollback: () => call('local:rollback'),
    setLan: (lan) => call('local:setLan', lan),
    openUrl: (url) => call('local:openUrl', url),
    openFolder: () => call('local:openFolder'),
  },
});
