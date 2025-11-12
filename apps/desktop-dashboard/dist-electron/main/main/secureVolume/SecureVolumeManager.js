"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecureVolumeManager = void 0;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const DarwinVolumeDriver_1 = require("./DarwinVolumeDriver");
const UnsupportedVolumeDriver_1 = require("./UnsupportedVolumeDriver");
const KeychainService_1 = require("./KeychainService");
class SecureVolumeManager {
    constructor() {
        this.driver = null;
        this.identity = null;
    }
    async init() {
        const userDataPath = electron_1.app.getPath('userData');
        const isDarwin = process.platform === 'darwin';
        const config = {
            userDataPath,
            mountRoot: isDarwin ? '/Volumes' : path_1.default.join(userDataPath, 'Secure Folder'),
            bundleName: 'par-noir-secure.sparsebundle',
            volumeName: 'par Noir Secure'
        };
        switch (process.platform) {
            case 'darwin':
                this.driver = new DarwinVolumeDriver_1.DarwinVolumeDriver(config);
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
        const persistedToken = await KeychainService_1.KeychainService.load(this.identity);
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
            await KeychainService_1.KeychainService.save(this.identity, tokenToUse);
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
        const cachedToken = await KeychainService_1.KeychainService.load(identity);
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
