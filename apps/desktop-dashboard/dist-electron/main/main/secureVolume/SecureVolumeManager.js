"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecureVolumeManager = void 0;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const VeraCryptDarwinDriver_1 = require("./VeraCryptDarwinDriver");
const VeraCryptWindowsDriver_1 = require("./VeraCryptWindowsDriver");
const VeraCryptLinuxDriver_1 = require("./VeraCryptLinuxDriver");
const UnsupportedVolumeDriver_1 = require("./UnsupportedVolumeDriver");
const TokenStorageService_1 = require("./TokenStorageService");
const getAppDirectory = () => {
    if (electron_1.app.isPackaged) {
        return path_1.default.dirname(electron_1.app.getPath('exe'));
    }
    return electron_1.app.getAppPath();
};
class SecureVolumeManager {
    constructor() {
        this.driver = null;
        this.identity = null;
    }
    async init() {
        const userDataPath = electron_1.app.getPath('userData');
        const appPath = getAppDirectory();
        const isDarwin = process.platform === 'darwin';
        const config = {
            userDataPath,
            appPath,
            mountRoot: isDarwin ? '/Volumes' : undefined,
            bundleName: 'par-noir-secure.hc',
            volumeName: 'par Noir Secure'
        };
        switch (process.platform) {
            case 'darwin':
                this.driver = new VeraCryptDarwinDriver_1.VeraCryptDarwinDriver(config);
                break;
            case 'win32':
                this.driver = new VeraCryptWindowsDriver_1.VeraCryptWindowsDriver(config);
                break;
            case 'linux':
                this.driver = new VeraCryptLinuxDriver_1.VeraCryptLinuxDriver(config);
                break;
            default:
                this.driver = new UnsupportedVolumeDriver_1.UnsupportedVolumeDriver(process.platform, config);
                break;
        }
        await this.driver.init();
    }
    async setUnlockContext(payload) {
        this.identity = {
            pnName: payload.pnName,
            publicKey: payload.publicKey,
            pnIdentifier: payload.pnIdentifier
        };
        const persistedToken = await TokenStorageService_1.TokenStorageService.load(this.identity);
        const tokenToUse = (persistedToken ?? payload.authToken)?.trim();
        if (!tokenToUse) {
            throw new Error('Secure volume unlock token missing.');
        }
        const context = {
            pnName: payload.pnName,
            publicKey: payload.publicKey,
            pnIdentifier: payload.pnIdentifier,
            authToken: tokenToUse
        };
        await this.getDriver().setUnlockContext(context);
        if (!persistedToken) {
            await TokenStorageService_1.TokenStorageService.save(this.identity, tokenToUse);
        }
        this.identity = { ...this.identity, authToken: tokenToUse };
    }
    async clearUnlockContext() {
        try {
            await this.getDriver().unmount();
        }
        catch (error) {
            console.warn('[SecureVolumeManager] Failed to unmount during clearUnlockContext', error);
        }
        await this.getDriver().clearUnlockContext();
        this.identity = null;
    }
    async hydrate(identity) {
        const cachedToken = await TokenStorageService_1.TokenStorageService.load(identity);
        if (!cachedToken || !cachedToken.trim()) {
            throw new Error('Cached token unavailable for secure volume');
        }
        this.identity = { ...identity, authToken: cachedToken.trim() };
        await this.getDriver().setUnlockContext({ ...identity, authToken: cachedToken.trim() });
        return this.mount();
    }
    async mount() {
        return this.getDriver().mount();
    }
    async unmount() {
        return this.getDriver().unmount();
    }
    async getStatus() {
        if (!this.driver) {
            return {
                mounted: false,
                mountPoint: null,
                platform: process.platform,
                driver: 'veracrypt',
                bundleExists: false
            };
        }
        return this.getDriver().getStatus();
    }
    getDriver() {
        if (!this.driver) {
            throw new Error('SecureVolumeManager not initialized');
        }
        return this.driver;
    }
}
exports.SecureVolumeManager = SecureVolumeManager;
