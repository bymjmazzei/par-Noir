"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VeraCryptDriver = exports.spawnAsync = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const spawnAsync = (command, args, options = {}) => {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(command, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: options.cwd
        });
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
exports.spawnAsync = spawnAsync;
const pathExists = async (target) => {
    try {
        await fs_1.promises.access(target);
        return true;
    }
    catch {
        return false;
    }
};
class VeraCryptDriver {
    constructor(config, veracryptPath) {
        this.driver = 'veracrypt';
        this.unlockContext = null;
        this.identityKey = null;
        this.containerRoot = path_1.default.join(config.userDataPath, 'secure-volumes');
        this.mountRoot = config.mountRoot ?? this.getDefaultMountRoot(config.userDataPath);
        this.defaultVolumeName = config.volumeName ?? 'par Noir Secure';
        this.appPath = config.appPath;
        this.veracryptPath = veracryptPath ?? this.findVeraCryptBinary();
        const defaultDirName = this.sanitiseName(this.defaultVolumeName);
        this.containerPath = path_1.default.join(this.containerRoot, `${defaultDirName}.hc`);
        this.mountPoint = path_1.default.join(this.mountRoot, defaultDirName);
        this.volumeName = this.defaultVolumeName;
    }
    async init() {
        await fs_1.promises.mkdir(this.containerRoot, { recursive: true });
        await fs_1.promises.mkdir(this.mountRoot, { recursive: true });
        if (!(await this.verifyVeraCrypt())) {
            const portableHint = this.appPath
                ? `\n\nPortable VeraCrypt should be placed next to the app at: ${path_1.default.dirname(this.appPath)}/veracrypt`
                : '';
            throw new Error(`VeraCrypt not found at ${this.veracryptPath}. Please install VeraCrypt or place a portable version next to the app.${portableHint}\n\n` +
                `Visit https://www.veracrypt.fr/en/Downloads.html for downloads.`);
        }
    }
    async setUnlockContext(payload) {
        const identityKey = this.deriveIdentityKey(payload);
        if (identityKey !== this.identityKey) {
            this.identityKey = identityKey;
            const dirName = this.sanitiseName(identityKey ?? this.defaultVolumeName);
            this.volumeName = identityKey ?? this.defaultVolumeName;
            this.containerPath = path_1.default.join(this.containerRoot, `${dirName}.hc`);
            this.mountPoint = path_1.default.join(this.mountRoot, dirName);
        }
        await fs_1.promises.mkdir(path_1.default.dirname(this.containerPath), { recursive: true });
        // Don't create mount point if it's a system mount root (e.g., /Volumes on macOS)
        // VeraCrypt will create it automatically when mounting
        if (!this.isSystemMountRoot(this.mountRoot)) {
            await fs_1.promises.mkdir(this.mountPoint, { recursive: true });
        }
        this.unlockContext = { ...payload, authToken: payload.authToken.trim() };
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
            console.log('[SecureVolume] Volume already mounted', {
                containerPath: this.containerPath,
                mountPoint: this.mountPoint
            });
            return this.getStatus();
        }
        console.log('[SecureVolume] Mounting secure volume', {
            containerPath: this.containerPath,
            mountPoint: this.mountPoint
        });
        try {
            await this.executeMount();
            console.log('[SecureVolume] Volume mounted successfully', {
                containerPath: this.containerPath,
                mountPoint: this.mountPoint
            });
        }
        catch (error) {
            console.error('[SecureVolume] VeraCrypt mount failed', {
                containerPath: this.containerPath,
                mountPoint: this.mountPoint,
                message: error.message
            });
            throw error;
        }
        this.lastMountedAt = new Date().toISOString();
        return this.getStatus();
    }
    async unmount() {
        if (!(await this.isMounted())) {
            return this.getStatus();
        }
        try {
            await this.executeUnmount();
        }
        catch (error) {
            const err = error;
            if (!/not mounted|not found/i.test(err.message)) {
                throw err;
            }
        }
        return this.getStatus();
    }
    async getStatus() {
        const mounted = await this.isMounted();
        const containerExists = await pathExists(this.containerPath);
        return {
            mounted,
            mountPoint: mounted ? this.mountPoint : null,
            lastMountedAt: this.lastMountedAt,
            platform: this.platform,
            driver: this.driver,
            bundleExists: containerExists
        };
    }
    async ensureVolumeExists() {
        if (await pathExists(this.containerPath)) {
            return;
        }
        if (!this.unlockContext) {
            throw new Error('Unlock context required to create secure volume');
        }
        await fs_1.promises.mkdir(path_1.default.dirname(this.containerPath), { recursive: true });
        // Don't create mount point if it's a system mount root (e.g., /Volumes on macOS)
        // VeraCrypt will create it automatically when mounting
        if (!this.isSystemMountRoot(this.mountRoot)) {
            await fs_1.promises.mkdir(this.mountPoint, { recursive: true });
        }
        try {
            await this.executeCreate();
        }
        catch (error) {
            console.error('[SecureVolume] VeraCrypt create failed', {
                containerPath: this.containerPath,
                message: error.message
            });
            throw error;
        }
    }
    isSystemMountRoot(mountRoot) {
        // System mount roots that don't allow directory creation
        return mountRoot === '/Volumes' || mountRoot === '/mnt' || mountRoot.startsWith('/Volumes/');
    }
    sanitiseName(name) {
        return name.replace(/[\/:*?"<>|]+/g, '-').trim() || 'par-noir-secure';
    }
    deriveIdentityKey(payload) {
        const identifier = this.resolveIdentifier(payload);
        return `par Noir - ${identifier}`;
    }
    resolveIdentifier(payload) {
        // If pnIdentifier is provided, use it directly (must match Google Drive folder name)
        const byIdentifier = payload.pnIdentifier?.trim();
        if (byIdentifier) {
            // Ensure it has the pn- prefix, but don't normalize further to preserve exact match
            const trimmed = byIdentifier.trim();
            if (trimmed.startsWith('pn-')) {
                return trimmed; // Use as-is to match Google Drive exactly
            }
            return `pn-${trimmed}`;
        }
        // Fallback: derive identifier using same method as Google Drive
        const token = payload.authToken?.trim();
        if (token) {
            return `pn-${token.substring(0, 12).toLowerCase()}`;
        }
        if (payload.publicKey?.trim()) {
            return `pn-${this.shortHash(payload.publicKey.trim())}`;
        }
        if (payload.pnName?.trim()) {
            return `pn-${this.shortHash(payload.pnName.trim())}`;
        }
        return 'pn-default';
    }
    shortHash(value) {
        const { createHash } = require('crypto');
        return createHash('sha256').update(value).digest('hex').substring(0, 12);
    }
    async spawnVeraCrypt(args, input) {
        return (0, exports.spawnAsync)(this.veracryptPath, args, { input, cwd: undefined });
    }
}
exports.VeraCryptDriver = VeraCryptDriver;
