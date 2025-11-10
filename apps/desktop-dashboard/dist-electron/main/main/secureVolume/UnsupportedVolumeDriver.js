"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnsupportedVolumeDriver = void 0;
class UnsupportedVolumeDriver {
    constructor(platform, _config) {
        this.driver = 'unsupported';
        this.platform = platform;
    }
    async init() {
        // no-op
    }
    async setUnlockContext(_payload) {
        // no-op
    }
    async clearUnlockContext() {
        // no-op
    }
    async mount() {
        throw new Error('Secure folder is not supported on this platform yet.');
    }
    async unmount() {
        return this.getStatus();
    }
    async getStatus() {
        return {
            mounted: false,
            mountPoint: null,
            platform: this.platform,
            driver: this.driver,
            bundleExists: false
        };
    }
}
exports.UnsupportedVolumeDriver = UnsupportedVolumeDriver;
