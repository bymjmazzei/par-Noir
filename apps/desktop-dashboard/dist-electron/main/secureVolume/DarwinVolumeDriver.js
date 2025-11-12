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
const crypto_1 = require("crypto");
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
        this.identityKey = null;
        this.bundleRoot = path_1.default.join(config.userDataPath, 'secure-volumes');
        this.mountRoot = config.mountRoot ?? path_1.default.join(config.userDataPath, 'Secure Folder');
        this.allowMountPointCreation = !this.isSystemMountRoot(this.mountRoot);
        this.defaultVolumeName = config.volumeName ?? 'par Noir Secure';
        const defaultDirName = this.sanitiseName(this.defaultVolumeName);
        this.bundlePath = path_1.default.join(this.bundleRoot, `${defaultDirName}.sparsebundle`);
        this.mountPoint = path_1.default.join(this.mountRoot, defaultDirName);
        this.volumeName = this.defaultVolumeName;
    }
    async init() {
        await fs_1.promises.mkdir(this.bundleRoot, { recursive: true });
        if (this.allowMountPointCreation) {
            await fs_1.promises.mkdir(this.mountRoot, { recursive: true });
        }
    }
    async setUnlockContext(payload) {
        const identityKey = this.deriveIdentityKey(payload);
        if (identityKey !== this.identityKey) {
            this.identityKey = identityKey;
            const dirName = this.sanitiseName(identityKey ?? this.defaultVolumeName);
            this.volumeName = identityKey ?? this.defaultVolumeName;
            this.bundlePath = path_1.default.join(this.bundleRoot, `${dirName}.sparsebundle`);
            this.mountPoint = path_1.default.join(this.mountRoot, dirName);
        }
        await fs_1.promises.mkdir(path_1.default.dirname(this.bundlePath), { recursive: true });
        if (this.allowMountPointCreation) {
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
                bundlePath: this.bundlePath,
                mountPoint: this.mountPoint
            });
            return this.getStatus();
        }
        console.log('[SecureVolume] Mounting secure volume', {
            bundlePath: this.bundlePath,
            mountPoint: this.mountPoint
        });
        try {
            await spawnAsync('hdiutil', [
                'attach',
                this.bundlePath,
                '-stdinpass',
                '-mountpoint',
                this.mountPoint,
                '-quiet'
            ], { input: `${this.unlockContext.authToken}\n` });
            console.log('[SecureVolume] Volume mounted successfully', {
                bundlePath: this.bundlePath,
                mountPoint: this.mountPoint
            });
        }
        catch (error) {
            console.error('[SecureVolume] hdiutil attach failed', {
                bundlePath: this.bundlePath,
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
        await fs_1.promises.mkdir(path_1.default.dirname(this.bundlePath), { recursive: true });
        if (this.allowMountPointCreation) {
            await fs_1.promises.mkdir(this.mountPoint, { recursive: true });
        }
        try {
            await spawnAsync('hdiutil', [
                'create',
                '-type', 'SPARSEBUNDLE',
                '-fs', 'APFS',
                '-encryption', 'AES-256',
                '-stdinpass',
                '-size', '512m',
                '-volname', this.volumeName,
                this.bundlePath
            ], { input: `${this.unlockContext.authToken}\n` });
        }
        catch (error) {
            console.error('[SecureVolume] hdiutil create failed', {
                bundlePath: this.bundlePath,
                message: error.message
            });
            throw error;
        }
    }
    async isMounted() {
        try {
            const { stdout } = await spawnAsync('hdiutil', ['info']);
            if (stdout.includes(this.bundlePath)) {
                return true;
            }
        }
        catch (error) {
            console.warn('[SecureVolume] Failed to query hdiutil info', {
                bundlePath: this.bundlePath,
                message: error.message
            });
        }
        return fs_2.default.existsSync(this.mountPoint);
    }
    sanitiseName(name) {
        return name.replace(/[\/:*?"<>|]+/g, '-').trim() || 'par-noir-secure';
    }
    isSystemMountRoot(root) {
        return path_1.default.resolve(root) === '/Volumes';
    }
    deriveIdentityKey(payload) {
        const identifier = this.resolveIdentifier(payload);
        return `par Noir - ${identifier}`;
    }
    resolveIdentifier(payload) {
        const byIdentifier = payload.pnIdentifier?.trim();
        if (byIdentifier) {
            return this.normalisePnIdentifier(byIdentifier);
        }
        const token = payload.authToken?.trim();
        if (token) {
            return this.normalisePnIdentifier(`pn-${token.substring(0, 12)}`);
        }
        if (payload.publicKey?.trim()) {
            return this.normalisePnIdentifier(`pn-${this.shortHash(payload.publicKey.trim())}`);
        }
        if (payload.pnName?.trim()) {
            return this.normalisePnIdentifier(`pn-${this.shortHash(payload.pnName.trim())}`);
        }
        return 'pn-default';
    }
    normalisePnIdentifier(value) {
        const trimmed = value.trim();
        if (!trimmed) {
            return 'pn-default';
        }
        const withoutBrandPrefix = trimmed.replace(/^par\s*noir\s*-\s*/i, '').trim();
        const base = withoutBrandPrefix.replace(/^pn-/i, '').trim();
        const sanitised = base.replace(/[^a-z0-9-]/gi, '').toLowerCase();
        return sanitised ? `pn-${sanitised}` : 'pn-default';
    }
    shortHash(value) {
        return (0, crypto_1.createHash)('sha256').update(value).digest('hex').substring(0, 12);
    }
}
exports.DarwinVolumeDriver = DarwinVolumeDriver;
