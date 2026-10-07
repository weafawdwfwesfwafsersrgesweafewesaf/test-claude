// Pont sécurisé entre le processus principal et les fenêtres de fond d'écran.
const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = ['load', 'props', 'settings', 'playback', 'mouse', 'unload'];

contextBridge.exposeInMainWorld('wpAPI', {
  platform: process.platform,
  on(channel, cb) {
    if (!CHANNELS.includes(channel)) return;
    ipcRenderer.on('wp:' + channel, (_e, data) => cb(data));
  },
  ready: () => ipcRenderer.send('wp:ready'),
  log: (msg) => ipcRenderer.send('wp:log', String(msg))
});
