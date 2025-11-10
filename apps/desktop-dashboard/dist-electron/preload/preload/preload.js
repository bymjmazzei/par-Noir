"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const ipcChannels_1 = require("../shared/ipcChannels");
const secureVolume = {
    status: async () => electron_1.ipcRenderer.invoke(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.status),
    mount: async () => electron_1.ipcRenderer.invoke(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.mount),
    unmount: async () => electron_1.ipcRenderer.invoke(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.unmount),
    unlock: async (payload) => electron_1.ipcRenderer.invoke(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.unlock, payload),
    lock: async () => electron_1.ipcRenderer.invoke(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.lock)
};
const nativeBridge = {
    openPath: async (target) => electron_1.ipcRenderer.invoke(ipcChannels_1.NATIVE_IPC_CHANNEL.openPath, target)
};
electron_1.contextBridge.exposeInMainWorld('parNoirDesktop', {
    platform: process.platform,
    version: process.version,
    secureVolume,
    native: nativeBridge
});
