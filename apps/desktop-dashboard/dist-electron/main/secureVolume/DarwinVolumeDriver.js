"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DarwinVolumeDriver = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const VeraCryptDriver_1 = require("./VeraCryptDriver");
const pathExists = async (target) => {
    try {
        await fs_1.promises.access(target);
        return true;
    }
    catch {
        return false;
    }
};
/**
 * macOS-specific volume driver using hdiutil (built-in, no dependencies)
 * This uses macOS's native disk image encryption, which doesn't require FUSE
 */
class DarwinVolumeDriver {
    constructor(config) {
        this.platform = 'darwin';
        this.driver = 'hdiutil';
        this.unlockContext = null;
        this.identityKey = null;
        this.containerRoot = path_1.default.join(config.userDataPath, 'secure-volumes');
        this.mountRoot = config.mountRoot ?? '/Volumes';
        this.defaultVolumeName = config.volumeName ?? 'par Noir Secure';
        const defaultDirName = this.sanitiseName(this.defaultVolumeName);
        this.containerPath = path_1.default.join(this.containerRoot, `${defaultDirName}.sparsebundle`);
        this.mountPoint = path_1.default.join(this.mountRoot, defaultDirName);
        this.volumeName = this.defaultVolumeName;
    }
    async init() {
        await fs_1.promises.mkdir(this.containerRoot, { recursive: true });
        // Don't create /Volumes - it's a system directory
        if (!this.isSystemMountRoot(this.mountRoot)) {
            await fs_1.promises.mkdir(this.mountRoot, { recursive: true });
        }
    }
    async setUnlockContext(payload) {
        const identityKey = this.deriveIdentityKey(payload);
        if (identityKey !== this.identityKey) {
            this.identityKey = identityKey;
            const dirName = this.sanitiseName(identityKey ?? this.defaultVolumeName);
            this.volumeName = identityKey ?? this.defaultVolumeName;
            this.containerPath = path_1.default.join(this.containerRoot, `${dirName}.sparsebundle`);
            this.mountPoint = path_1.default.join(this.mountRoot, dirName);
        }
        await fs_1.promises.mkdir(path_1.default.dirname(this.containerPath), { recursive: true });
        // Don't create mount point if it's a system mount root
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
            console.error('[SecureVolume] hdiutil mount failed', {
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
        console.log('[SecureVolume] Dismounting secure volume', {
            mountPoint: this.mountPoint
        });
        try {
            await this.executeUnmount();
            console.log('[SecureVolume] Volume dismounted successfully.');
        }
        catch (error) {
            const err = error;
            if (!/not currently mounted/i.test(err.message) && !/no volume mounted/i.test(err.message)) {
                console.warn(`[SecureVolume] hdiutil dismount failed: ${err.message}`);
                throw err;
            }
            console.log('[SecureVolume] Volume was already dismounted or not found, ignoring error.');
        }
        return this.getStatus();
    }
    async getStatus() {
        const mounted = await this.isMounted();
        const bundleExists = await pathExists(this.containerPath);
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
        if (await pathExists(this.containerPath)) {
            console.log(`[SecureVolume] Sparse bundle already exists: ${this.containerPath}`);
            return;
        }
        if (!this.unlockContext) {
            throw new Error('Unlock context required to create secure volume');
        }
        console.log(`[SecureVolume] Creating new sparse bundle: ${this.containerPath}`);
        await fs_1.promises.mkdir(path_1.default.dirname(this.containerPath), { recursive: true });
        try {
            await this.executeCreate();
            console.log(`[SecureVolume] Sparse bundle created successfully.`);
        }
        catch (error) {
            console.error('[SecureVolume] hdiutil create failed', {
                containerPath: this.containerPath,
                message: error.message
            });
            throw error;
        }
    }
    sanitiseName(name) {
        return name.replace(/[\/:*?"<>|]+/g, '-').trim() || 'par-noir-secure';
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
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(value).digest('hex').substring(0, 12);
    }
    isSystemMountRoot(mountRoot) {
        return mountRoot === '/Volumes' || mountRoot === '/mnt' || mountRoot.startsWith('/Volumes/');
    }
    async executeMount() {
        if (!this.unlockContext) {
            throw new Error('Unlock context required');
        }
        // hdiutil attach with password from stdin
        // Note: We don't use -nobrowse so the volume appears in Finder
        await (0, VeraCryptDriver_1.spawnAsync)('hdiutil', [
            'attach',
            this.containerPath,
            '-mountpoint', this.mountPoint,
            '-stdinpass'
        ], { input: this.unlockContext.authToken });
    }
    async executeUnmount() {
        await (0, VeraCryptDriver_1.spawnAsync)('hdiutil', [
            'detach',
            this.mountPoint,
            '-force'
        ]);
    }
    async isMounted() {
        try {
            const { stdout } = await (0, VeraCryptDriver_1.spawnAsync)('hdiutil', ['info', '-plist']);
            // Check if our mount point or container path is in the output
            return stdout.includes(this.mountPoint) || stdout.includes(this.containerPath);
        }
        catch {
            // Fallback: check if mount point exists
            return await pathExists(this.mountPoint);
        }
    }
    async executeCreate() {
        if (!this.unlockContext) {
            throw new Error('Unlock context required');
        }
        // Create encrypted sparse bundle using hdiutil
        // Size: 512MB, encryption: AES-256, filesystem: APFS
        await (0, VeraCryptDriver_1.spawnAsync)('hdiutil', [
            'create',
            '-size', '512m',
            '-type', 'SPARSEBUNDLE',
            '-fs', 'APFS',
            '-encryption', 'AES-256',
            '-stdinpass',
            this.containerPath
        ], { input: this.unlockContext.authToken });
    }
}
exports.DarwinVolumeDriver = DarwinVolumeDriver;
