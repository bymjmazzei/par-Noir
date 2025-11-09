import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('parNoirDesktop', {
  platform: process.platform,
  version: process.version
});

