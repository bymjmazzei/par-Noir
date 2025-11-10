"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DarwinVolumeDriver = void 0;
const fs_1 = require("fs");
const fs_2 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const spawnAsync = (command, args, options = {}) => {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
            }
            else {
                const error = new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`);
                reject(error);
            }
        });
        if (options.input) {
            child.stdin.write(options.input);
        }
        child.stdin.end();
    });
};
const pathExists = async (target) => {
    try {
        await fs_1.promises.access(target);
        return true;
    }
    catch {
        return false;
    }
};
class DarwinVolumeDriver {
    constructor(config) {
        this.platform = 'darwin';
        this.driver = 'hdiutil';
        this.unlockContext = null;
        const bundleName = config.bundleName ?? 'par-noir-secure.sparsebundle';
        const mountDirectory = config.mountRoot ?? path_1.default.join(config.userDataPath, 'Secure Folder');
        this.bundlePath = path_1.default.join(config.userDataPath, bundleName);
        this.mountPoint = mountDirectory;
        this.volumeName = config.volumeName ?? 'par Noir Secure';
    }
    async init() {
        await fs_1.promises.mkdir(path_1.default.dirname(this.bundlePath), { recursive: true });
        await fs_1.promises.mkdir(this.mountPoint, { recursive: true });
    }
    async setUnlockContext(payload) {
        this.unlockContext = payload;
    }
    async clearUnlockContext() {
        this.unlockContext = null;
    }
    async mount() {
        if (!this.unlockContext) {
            throw new Error('Secure volume locked; unlock context required');
        }
        await this.ensureVolumeExists();
        if (await this.isMounted()) {
            return this.getStatus();
        }
        await spawnAsync('hdiutil', [
            'attach',
            this.bundlePath,
            '-stdinpass',
            '-mountpoint',
            this.mountPoint,
            '-nobrowse',
            '-quiet'
        ], { input: `${this.unlockContext.passcode}\n` });
        this.lastMountedAt = new Date().toISOString();
        return this.getStatus();
    }
    async unmount() {
        if (!(await this.isMounted())) {
            return this.getStatus();
        }
        try {
            await spawnAsync('hdiutil', [
                'detach',
                this.mountPoint,
                '-quiet',
                '-force'
            ]);
        }
        catch (error) {
            const err = error;
            if (!/not currently mounted/i.test(err.message)) {
                throw err;
            }
        }
        return this.getStatus();
    }
    async getStatus() {
        const mounted = await this.isMounted();
        const bundleExists = await pathExists(this.bundlePath);
        return {
            mounted,
            mountPoint: mounted ? this.mountPoint : null,
            lastMountedAt: this.lastMountedAt,
            platform: this.platform,
            driver: this.driver,
            bundleExists
        };
    }
    async ensureVolumeExists() {
        if (await pathExists(this.bundlePath)) {
            return;
        }
        if (!this.unlockContext) {
            throw new Error('Unlock context required to create secure volume');
        }
        await spawnAsync('hdiutil', [
            'create',
            '-type', 'SPARSEBUNDLE',
            '-fs', 'APFS',
            '-encryption', 'AES-256',
            '-stdinpass',
            '-size', '512m',
            '-volname', this.volumeName,
            this.bundlePath
        ], { input: `${this.unlockContext.passcode}\n` });
    }
    async isMounted() {
        if (!fs_2.default.existsSync(this.mountPoint)) {
            return false;
        }
        try {
            const entries = await fs_1.promises.readdir(this.mountPoint);
            return entries.length > 0;
        }
        catch {
            return false;
        }
    }
}
exports.DarwinVolumeDriver = DarwinVolumeDriver;
