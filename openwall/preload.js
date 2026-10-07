// Pont sécurisé entre l'interface et le processus principal.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = (name) => (...args) => ipcRenderer.invoke('ow:' + name, ...args);

contextBridge.exposeInMainWorld('ow', {
  platform: process.platform,
  getState: call('getState'),
  openFiles: call('openFiles'),
  importPaths: call('importPaths'),
  addWeb: call('addWeb'),
  updateItem: call('updateItem'),
  previewProps: call('previewProps'),
  saveThumbnail: call('saveThumbnail'),
  removeItem: call('removeItem'),
  duplicateItem: call('duplicateItem'),
  subscribe: call('subscribe'),
  apply: call('apply'),
  clearWallpaper: call('clearWallpaper'),
  restore: call('restore'),
  setSettings: call('setSettings'),
  togglePause: call('togglePause'),
  playlistNext: call('playlistNext'),
  showInFolder: call('showInFolder'),
  openData: call('openData'),
  openExternal: call('openExternal'),
  win: call('win'),
  siteScan: call('siteScan'),
  siteDownload: call('siteDownload'),
  siteCancel: call('siteCancel'),
  siteJob: call('siteJob'),
  addScene: call('addScene'),
  catalogSources: call('catalogSources'),
  catalog: call('catalog'),
  catalogDownload: call('catalogDownload'),
  onCatalogDl: (cb) => ipcRenderer.on('ow:catalogDl', (_e, d) => cb(d)),
  onSiteScan: (cb) => ipcRenderer.on('ow:siteScan', (_e, p) => cb(p)),
  onSiteJob: (cb) => ipcRenderer.on('ow:siteJob', (_e, j) => cb(j)),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return null;
    }
  },
  onState: (cb) => ipcRenderer.on('ow:state', (_e, s) => cb(s)),
  onNavigate: (cb) => ipcRenderer.on('ow:navigate', (_e, p) => cb(p)),
  onMaximized: (cb) => ipcRenderer.on('ow:maximized', (_e, m) => cb(m))
});
