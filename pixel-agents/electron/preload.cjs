const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'pixelAgentsDesktop',
  Object.freeze({
    isElectron: true,
    platform: process.platform,
    versions: Object.freeze({
      chrome: process.versions.chrome,
      electron: process.versions.electron,
      node: process.versions.node,
    }),
  }),
);

contextBridge.exposeInMainWorld('acquireVsCodeApi', () =>
  Object.freeze({
    postMessage(message) {
      ipcRenderer.send('pixel-agents:renderer-message', message);
    },
  }),
);

ipcRenderer.on('pixel-agents:host-message', (_event, message) => {
  window.dispatchEvent(new MessageEvent('message', { data: message }));
});
