"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
const ipcChannels_1 = require("../shared/ipcChannels");
const resolveAsset = (relativePath) => {
    if (process.env.VITE_DEV_SERVER_URL) {
        return new URL(relativePath, process.env.VITE_DEV_SERVER_URL).toString();
    }
    const distPath = path_1.default.resolve(__dirname, '../../dist', relativePath);
    return (0, url_1.pathToFileURL)(distPath).toString();
};
const secureVolume = {
    status: async () => electron_1.ipcRenderer.invoke(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.status),
    mount: async () => electron_1.ipcRenderer.invoke(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.mount),
    unmount: async () => electron_1.ipcRenderer.invoke(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.unmount),
    unlock: async (payload) => electron_1.ipcRenderer.invoke(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.unlock, payload),
    lock: async () => electron_1.ipcRenderer.invoke(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.lock),
    hydrate: async (identity) => electron_1.ipcRenderer.invoke(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.hydrate, identity)
};
console.log('[preload] secureVolume API exposed', Object.keys(secureVolume));
const nativeBridge = {
    openPath: async (target) => electron_1.ipcRenderer.invoke(ipcChannels_1.NATIVE_IPC_CHANNEL.openPath, target)
};
electron_1.contextBridge.exposeInMainWorld('parNoirDesktop', {
    platform: process.platform,
    version: process.version,
    secureVolume,
    native: nativeBridge,
    assets: {
        resolve: resolveAsset
    }
});
