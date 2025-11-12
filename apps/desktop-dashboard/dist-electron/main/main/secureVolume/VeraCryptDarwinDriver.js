"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VeraCryptDarwinDriver = void 0;
const path_1 = __importDefault(require("path"));
const VeraCryptDriver_1 = require("./VeraCryptDriver");
class VeraCryptDarwinDriver extends VeraCryptDriver_1.VeraCryptDriver {
    constructor(config, veracryptPath) {
        super(config, veracryptPath);
        this.platform = 'darwin';
    }
    getDefaultMountRoot(userDataPath) {
        return '/Volumes';
    }
    findVeraCryptBinary() {
        const candidates = [];
        // Check bundled resources first (electron-builder puts extraResources in Contents/Resources/)
        if (this.appPath) {
            const appDir = path_1.default.dirname(this.appPath);
            // For packaged apps: appPath is Contents/MacOS/par Noir Desktop
            // Resources are at Contents/Resources/veracrypt/...
            const resourcesDir = path_1.default.join(appDir, '..', 'Resources');
            candidates.push(
            // Bundled VeraCrypt from extraResources
            path_1.default.join(resourcesDir, 'veracrypt', 'darwin', 'extracted', 'VeraCrypt.app', 'Contents', 'MacOS', 'VeraCrypt'), 
            // Alternative paths for different packaging scenarios
            path_1.default.join(appDir, '..', '..', 'Resources', 'veracrypt', 'darwin', 'extracted', 'VeraCrypt.app', 'Contents', 'MacOS', 'VeraCrypt'), path_1.default.join(appDir, 'veracrypt', 'darwin', 'extracted', 'VeraCrypt.app', 'Contents', 'MacOS', 'VeraCrypt'), path_1.default.join(appDir, 'VeraCrypt.app', 'Contents', 'MacOS', 'VeraCrypt'), path_1.default.join(appDir, 'veracrypt'));
        }
        candidates.push('/Applications/VeraCrypt.app/Contents/MacOS/VeraCrypt', '/usr/local/bin/veracrypt', '/opt/homebrew/bin/veracrypt', 'veracrypt');
        for (const candidate of candidates) {
            if (candidate === 'veracrypt') {
                return candidate;
            }
            try {
                require('fs').accessSync(candidate);
                return candidate;
            }
            catch {
                continue;
            }
        }
        return 'veracrypt';
    }
    async verifyVeraCrypt() {
        try {
            await this.spawnVeraCrypt(['--version']);
            return true;
        }
        catch {
            return false;
        }
    }
    async executeMount() {
        if (!this.unlockContext) {
            throw new Error('Unlock context required');
        }
        await this.spawnVeraCrypt([
            '--mount',
            this.containerPath,
            '--mount-point', this.mountPoint,
            '--password', this.unlockContext.authToken,
            '--non-interactive',
            '--quiet'
        ]);
    }
    async executeUnmount() {
        await this.spawnVeraCrypt([
            '--dismount',
            this.mountPoint,
            '--force',
            '--non-interactive',
            '--quiet'
        ]);
    }
    async isMounted() {
        try {
            const { stdout } = await this.spawnVeraCrypt(['--list']);
            return stdout.includes(this.mountPoint) || stdout.includes(this.containerPath);
        }
        catch {
            const fs = require('fs');
            return fs.existsSync(this.mountPoint);
        }
    }
    async executeCreate() {
        if (!this.unlockContext) {
            throw new Error('Unlock context required');
        }
        await this.spawnVeraCrypt([
            '--create',
            this.containerPath,
            '--size', '512M',
            '--password', this.unlockContext.authToken,
            '--hash', 'sha-512',
            '--encryption', 'AES',
            '--filesystem', 'APFS',
            '--volume-type', 'normal',
            '--non-interactive',
            '--quiet'
        ]);
    }
}
exports.VeraCryptDarwinDriver = VeraCryptDarwinDriver;
