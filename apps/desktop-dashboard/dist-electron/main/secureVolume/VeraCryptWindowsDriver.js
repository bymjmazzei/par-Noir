"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VeraCryptWindowsDriver = void 0;
const path_1 = __importDefault(require("path"));
const VeraCryptDriver_1 = require("./VeraCryptDriver");
class VeraCryptWindowsDriver extends VeraCryptDriver_1.VeraCryptDriver {
    constructor(config, veracryptPath) {
        super(config, veracryptPath);
        this.platform = 'win32';
        this.mountPoint = this.getDefaultMountRoot(config.userDataPath);
    }
    getDefaultMountRoot(userDataPath) {
        return 'Z:';
    }
    findVeraCryptBinary() {
        const candidates = [];
        // Check bundled resources first
        if (this.appPath) {
            const appDir = path_1.default.dirname(this.appPath);
            const resourcesDir = path_1.default.join(appDir, 'resources', 'veracrypt', 'win32', 'extracted');
            candidates.push(path_1.default.join(resourcesDir, 'VeraCrypt.exe'), path_1.default.join(appDir, 'veracrypt', 'VeraCrypt.exe'), path_1.default.join(appDir, 'VeraCrypt.exe'), path_1.default.join(appDir, 'veracrypt.exe'));
        }
        candidates.push('C:\\Program Files\\VeraCrypt\\VeraCrypt.exe', 'C:\\Program Files (x86)\\VeraCrypt\\VeraCrypt.exe', 'veracrypt.exe', 'veracrypt');
        for (const candidate of candidates) {
            if (candidate === 'veracrypt.exe' || candidate === 'veracrypt') {
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
        return 'veracrypt.exe';
    }
    async verifyVeraCrypt() {
        try {
            await this.spawnVeraCrypt(['/version']);
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
            '/volume',
            this.containerPath,
            '/letter', this.mountPoint,
            '/password', this.unlockContext.authToken,
            '/quit',
            '/silent'
        ]);
    }
    async executeUnmount() {
        await this.spawnVeraCrypt([
            '/dismount',
            this.mountPoint,
            '/force',
            '/quit',
            '/silent'
        ]);
    }
    async isMounted() {
        try {
            const { stdout } = await this.spawnVeraCrypt(['/list']);
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
            '/create',
            this.containerPath,
            '/size', '512M',
            '/password', this.unlockContext.authToken,
            '/hash', 'sha-512',
            '/encryption', 'AES',
            '/filesystem', 'NTFS',
            '/quick',
            '/format',
            '/quit',
            '/silent'
        ]);
    }
}
exports.VeraCryptWindowsDriver = VeraCryptWindowsDriver;
