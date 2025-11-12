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
        const fs = require('fs');
        // Check bundled resources first (electron-builder puts extraResources in Contents/Resources/)
        if (this.appPath) {
            // appPath is already the directory containing the executable (Contents/MacOS)
            // Resources are at Contents/Resources/veracrypt/...
            const resourcesDir = path_1.default.resolve(this.appPath, '..', 'Resources');
            const bundledPath = path_1.default.resolve(resourcesDir, 'veracrypt', 'darwin', 'extracted', 'VeraCrypt.app', 'Contents', 'MacOS', 'VeraCrypt');
            console.log('[VeraCryptDarwinDriver] Looking for bundled VeraCrypt:', {
                appPath: this.appPath,
                resourcesDir,
                bundledPath,
                resourcesExists: fs.existsSync(resourcesDir),
                bundledExists: fs.existsSync(bundledPath)
            });
            // List contents of Resources directory for debugging
            if (fs.existsSync(resourcesDir)) {
                try {
                    const resourcesContents = fs.readdirSync(resourcesDir);
                    console.log('[VeraCryptDarwinDriver] Resources directory contents:', resourcesContents);
                }
                catch (e) {
                    console.warn('[VeraCryptDarwinDriver] Could not read Resources directory:', e);
                }
            }
            candidates.push(
            // Bundled VeraCrypt from extraResources
            bundledPath, 
            // Alternative paths for different packaging scenarios
            path_1.default.resolve(this.appPath, '..', '..', 'Resources', 'veracrypt', 'darwin', 'extracted', 'VeraCrypt.app', 'Contents', 'MacOS', 'VeraCrypt'), path_1.default.resolve(this.appPath, 'veracrypt', 'darwin', 'extracted', 'VeraCrypt.app', 'Contents', 'MacOS', 'VeraCrypt'), path_1.default.resolve(this.appPath, 'VeraCrypt.app', 'Contents', 'MacOS', 'VeraCrypt'), path_1.default.resolve(this.appPath, 'veracrypt'));
        }
        candidates.push('/Applications/VeraCrypt.app/Contents/MacOS/VeraCrypt', '/usr/local/bin/veracrypt', '/opt/homebrew/bin/veracrypt', 'veracrypt');
        for (const candidate of candidates) {
            if (candidate === 'veracrypt') {
                console.log('[VeraCryptDarwinDriver] Falling back to PATH lookup for veracrypt');
                return candidate;
            }
            try {
                fs.accessSync(candidate);
                console.log('[VeraCryptDarwinDriver] Found VeraCrypt at:', candidate);
                return candidate;
            }
            catch (error) {
                // Continue to next candidate
                continue;
            }
        }
        console.warn('[VeraCryptDarwinDriver] No VeraCrypt binary found, falling back to PATH');
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
