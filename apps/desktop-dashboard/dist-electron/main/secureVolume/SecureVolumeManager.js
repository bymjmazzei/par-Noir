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
class SecureVolumeManager {
    constructor() {
        this.driver = null;
    }
    async init() {
        const userDataPath = electron_1.app.getPath('userData');
        const config = {
            userDataPath,
            mountRoot: path_1.default.join(userDataPath, 'Secure Folder'),
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
        await this.getDriver().setUnlockContext(payload);
    }
    async clearUnlockContext() {
        await this.getDriver().clearUnlockContext();
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
