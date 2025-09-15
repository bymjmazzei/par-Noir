interface VersionedIdentity {
  publicKey: string;
  idFile: any;
  nickname: string;
  version: number;
  createdAt: string;
  lastAccessed: string;
  isActive: boolean;
}

interface VersionedStorageData {
  [publicKey: string]: {
    versions: VersionedIdentity[];
    maxVersions: number;
    lastUpdated: string;
  };
}

export class VersionedIdentityStorage {
  private static instance: VersionedIdentityStorage;
  private readonly STORAGE_KEY = 'pwa_versioned_identities';
  private readonly MAX_VERSIONS = 3;

  private constructor() {}

  static getInstance(): VersionedIdentityStorage {
    if (!VersionedIdentityStorage.instance) {
      VersionedIdentityStorage.instance = new VersionedIdentityStorage();
    }
    return VersionedIdentityStorage.instance;
  }

  /**
   * Store a new version of an identity with updated nickname
   */
  async storeIdentityVersion(publicKey: string, idFile: any, nickname: string): Promise<void> {
    try {
      const storageData = this.getStorageData();
      
      if (!storageData[publicKey]) {
        storageData[publicKey] = {
          versions: [],
          maxVersions: this.MAX_VERSIONS,
          lastUpdated: new Date().toISOString()
        };
      }

      const identityGroup = storageData[publicKey];
      
      // Deactivate all previous versions
      identityGroup.versions.forEach(version => {
        version.isActive = false;
      });

      // Create new version
      const newVersion: VersionedIdentity = {
        publicKey,
        idFile,
        nickname: nickname.trim(),
        version: identityGroup.versions.length + 1,
        createdAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        isActive: true
      };

      // Add new version
      identityGroup.versions.push(newVersion);

      // Keep only the latest MAX_VERSIONS
      if (identityGroup.versions.length > this.MAX_VERSIONS) {
        // Remove oldest versions, keeping the latest ones
        identityGroup.versions = identityGroup.versions
          .sort((a, b) => b.version - a.version)
          .slice(0, this.MAX_VERSIONS);
      }

      identityGroup.lastUpdated = new Date().toISOString();
      
      this.saveStorageData(storageData);
      
    } catch (error) {
      // Handle storage error silently
    }
  }

  /**
   * Get the active version of an identity
   */
  getActiveIdentity(publicKey: string): VersionedIdentity | null {
    try {
      const storageData = this.getStorageData();
      const identityGroup = storageData[publicKey];
      
      if (!identityGroup) {
        return null;
      }

      const activeVersion = identityGroup.versions.find(version => version.isActive);
      return activeVersion || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get all versions of an identity
   */
  getAllVersions(publicKey: string): VersionedIdentity[] {
    try {
      const storageData = this.getStorageData();
      const identityGroup = storageData[publicKey];
      
      if (!identityGroup) {
        return [];
      }

      return identityGroup.versions.sort((a, b) => b.version - a.version);
    } catch (error) {
      return [];
    }
  }

  /**
   * Update nickname for an identity (creates new version)
   */
  async updateNickname(publicKey: string, newNickname: string): Promise<void> {
    try {
      const activeIdentity = this.getActiveIdentity(publicKey);
      
      if (!activeIdentity) {
        throw new Error('No active identity found for this public key');
      }

      // Create new version with updated nickname
      await this.storeIdentityVersion(publicKey, activeIdentity.idFile, newNickname);
      
    } catch (error) {
      // Handle storage error silently
    }
  }

  /**
   * Get all active identities for display in selector
   */
  getAllActiveIdentities(): VersionedIdentity[] {
    try {
      const storageData = this.getStorageData();
      const activeIdentities: VersionedIdentity[] = [];
      
      Object.values(storageData).forEach(identityGroup => {
        const activeVersion = identityGroup.versions.find(version => version.isActive);
        if (activeVersion) {
          activeIdentities.push(activeVersion);
        }
      });
      
      return activeIdentities.sort((a, b) => 
        new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime()
      );
    } catch (error) {
      return [];
    }
  }

  /**
   * Update last accessed time for an identity
   */
  updateLastAccessed(publicKey: string): void {
    try {
      const storageData = this.getStorageData();
      const identityGroup = storageData[publicKey];
      
      if (identityGroup) {
        const activeVersion = identityGroup.versions.find(version => version.isActive);
        if (activeVersion) {
          activeVersion.lastAccessed = new Date().toISOString();
          this.saveStorageData(storageData);
        }
      }
    } catch (error) {
      // Handle storage error silently
    }
  }

  /**
   * Remove an identity and all its versions
   */
  removeIdentity(publicKey: string): void {
    try {
      const storageData = this.getStorageData();
      delete storageData[publicKey];
      this.saveStorageData(storageData);
    } catch (error) {
      // Handle storage error silently
    }
  }

  /**
   * Get storage data from localStorage
   */
  private getStorageData(): VersionedStorageData {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      return {};
    }
  }

  /**
   * Save storage data to localStorage
   */
  private saveStorageData(data: VersionedStorageData): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      // Handle storage error silently
    }
  }

  /**
   * Migrate from old localStorage format to new versioned format
   */
  async migrateFromOldFormat(): Promise<void> {
    try {
      const oldStored = localStorage.getItem('pwa_stored_identities');
      if (!oldStored) {
        return; // No old data to migrate
      }

      const oldData = JSON.parse(oldStored);
      
      for (const oldIdentity of oldData) {
        if (oldIdentity.publicKey && oldIdentity.idFile && oldIdentity.nickname) {
          await this.storeIdentityVersion(
            oldIdentity.publicKey,
            oldIdentity.idFile,
            oldIdentity.nickname
          );
        }
      }

      // Remove old format after successful migration
      localStorage.removeItem('pwa_stored_identities');
    } catch (error) {
      // Handle storage error silently
    }
  }
}

export default VersionedIdentityStorage;
