/**
 * Web-to-PWA Migration Utility
 * Handles seamless migration of identity data from web app to PWA
 */

import { secureStorage } from './localStorage';
import { EncryptedIdentity } from './crypto';

export interface WebIdentityData {
  id: string;
  data: EncryptedIdentity;
  createdAt: string;
  needsMigration: boolean;
  migrationAttempts?: number;
}

export interface MigrationResult {
  success: boolean;
  migratedCount: number;
  errors: string[];
  skippedCount: number;
}

export class MigrationManager {
  private static readonly WEB_IDENTITIES_KEY = 'web-identities';
  private static readonly MIGRATION_STATUS_KEY = 'migration-status';
  private static readonly MAX_MIGRATION_ATTEMPTS = 3;

  /**
   * Detect if running as PWA
   */
  static isPWA(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches || 
           (window.navigator as any).standalone === true;
  }

  /**
   * Store identity in web storage for future migration
   */
  static async storeForMigration(identity: EncryptedIdentity): Promise<void> {
    try {
      const stored = await this.getWebIdentities();
      // Convert EncryptedIdentity to WebIdentityData format
      const webIdentityData: WebIdentityData = {
        id: identity.publicKey || '',
        data: identity,
        createdAt: new Date().toISOString(),
        needsMigration: false
      };
      stored.push(webIdentityData);
      localStorage.setItem(this.WEB_IDENTITIES_KEY, JSON.stringify(stored));
    } catch (error) {
      // Handle storage error silently
    }
  }

  /**
   * Get identities stored in web storage
   */
  static getWebIdentities(): WebIdentityData[] {
    try {
      const data = localStorage.getItem(this.WEB_IDENTITIES_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Check if migration is needed
   */
  static async isMigrationNeeded(): Promise<boolean> {
    if (!this.isPWA()) return false;

    // Check if we have web identities to migrate
    const webIdentities = this.getWebIdentities();
    const pendingMigrations = webIdentities.filter(item => item.needsMigration);

    if (pendingMigrations.length === 0) return false;

    // Check if we already have PWA data
    try {
      const pwaIdentities = await secureStorage.getAllIdentities();
      
      // If PWA has no identities, migration is definitely needed
      if (pwaIdentities.length === 0) return true;

      // Check if any web identities are not in PWA storage
      const pwaIds = new Set(pwaIdentities.map(id => id.id));
      const needsMigration = pendingMigrations.some(webId => !pwaIds.has(webId.id));

      return needsMigration;
    } catch (error) {
      return true; // Assume migration needed if we can't check
    }
  }

  /**
   * Get identities that need migration
   */
  static async getPendingMigrations(): Promise<WebIdentityData[]> {
    if (!this.isPWA()) return [];

    const webIdentities = this.getWebIdentities();
    const pendingMigrations = webIdentities.filter(item => 
      item.needsMigration && 
      (item.migrationAttempts || 0) < this.MAX_MIGRATION_ATTEMPTS
    );

    try {
      // Filter out identities that already exist in PWA
      const pwaIdentities = await secureStorage.getAllIdentities();
      const pwaIds = new Set(pwaIdentities.map(id => id.id));
      
      return pendingMigrations.filter(webId => !pwaIds.has(webId.id));
    } catch (error) {
      return pendingMigrations;
    }
  }

  /**
   * Migrate identities from web storage to PWA storage
   */
  static async migrateIdentities(identities: WebIdentityData[]): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      migratedCount: 0,
      errors: [],
      skippedCount: 0
    };

    if (!this.isPWA()) {
      result.success = false;
      result.errors.push('Migration can only be performed in PWA mode');
      return result;
    }

    for (const webIdentity of identities) {
      try {
        // Validate identity data
        if (!this.validateIdentityData(webIdentity.data)) {
          result.errors.push(`Invalid identity data for ${webIdentity.id}`);
          result.skippedCount++;
          continue;
        }

        // Check if identity already exists in PWA storage
        const existingIdentity = await secureStorage.getIdentity(webIdentity.id);
        if (existingIdentity) {
          this.markAsMigrated(webIdentity.id);
          result.skippedCount++;
          continue;
        }

        // Migrate to PWA storage
        await secureStorage.saveIdentity(webIdentity.data);
        result.migratedCount++;

        // Mark as migrated in web storage
        this.markAsMigrated(webIdentity.id);

      } catch (error) {
        result.errors.push(`Failed to migrate ${webIdentity.id}: ${error}`);
        
        // Increment migration attempts
        this.incrementMigrationAttempts(webIdentity.id);
      }
    }

    // Update overall success status
    result.success = result.errors.length === 0;

    // Store migration status
    this.storeMigrationStatus(result);

    return result;
  }

  /**
   * Validate identity data structure
   */
  private static validateIdentityData(identity: EncryptedIdentity): boolean {
    return !!(
      identity &&
      identity.publicKey &&
      identity.publicKey &&
      identity.encryptedData &&
      identity.iv &&
      identity.salt
    );
  }

  /**
   * Mark identity as migrated
   */
  private static markAsMigrated(identityId: string): void {
    try {
      const webIdentities = this.getWebIdentities();
      const index = webIdentities.findIndex(item => item.id === identityId);
      
      if (index >= 0) {
        webIdentities[index].needsMigration = false;
        localStorage.setItem(this.WEB_IDENTITIES_KEY, JSON.stringify(webIdentities));
      }
    } catch (error) {
      // Handle error silently
    }
  }

  /**
   * Increment migration attempts for failed migrations
   */
  private static incrementMigrationAttempts(identityId: string): void {
    try {
      const webIdentities = this.getWebIdentities();
      const index = webIdentities.findIndex(item => item.id === identityId);
      
      if (index >= 0) {
        webIdentities[index].migrationAttempts = (webIdentities[index].migrationAttempts || 0) + 1;
        localStorage.setItem(this.WEB_IDENTITIES_KEY, JSON.stringify(webIdentities));
      }
    } catch (error) {
      // Handle error silently
    }
  }

  /**
   * Store migration status for tracking
   */
  private static storeMigrationStatus(result: MigrationResult): void {
    try {
      const status = {
        lastMigration: new Date().toISOString(),
        result,
        totalAttempts: this.getMigrationStatus()?.totalAttempts || 0 + 1
      };
      
      localStorage.setItem(this.MIGRATION_STATUS_KEY, JSON.stringify(status));
    } catch (error) {
      // Handle error silently
    }
  }

  /**
   * Get migration status
   */
  static getMigrationStatus(): any {
    try {
      const data = localStorage.getItem(this.MIGRATION_STATUS_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Clear web storage after successful migration
   */
  static clearWebStorage(): void {
    try {
      const webIdentities = this.getWebIdentities();
      const remainingIdentities = webIdentities.filter(item => item.needsMigration);
      
      if (remainingIdentities.length === 0) {
        localStorage.removeItem(this.WEB_IDENTITIES_KEY);
      } else {
        localStorage.setItem(this.WEB_IDENTITIES_KEY, JSON.stringify(remainingIdentities));
      }
    } catch (error) {
      // Handle error silently
    }
  }

  /**
   * Reset migration status (for testing/debugging)
   */
  static resetMigrationStatus(): void {
    localStorage.removeItem(this.MIGRATION_STATUS_KEY);
    
    // Reset all identities to need migration
    const webIdentities = this.getWebIdentities();
    webIdentities.forEach(item => {
      item.needsMigration = true;
      item.migrationAttempts = 0;
    });
    
    if (webIdentities.length > 0) {
      localStorage.setItem(this.WEB_IDENTITIES_KEY, JSON.stringify(webIdentities));
    }
  }

  /**
   * Get migration statistics
   */
  static getMigrationStats(): {
    totalWebIdentities: number;
    pendingMigrations: number;
    completedMigrations: number;
    failedAttempts: number;
  } {
    const webIdentities = this.getWebIdentities();
    
    return {
      totalWebIdentities: webIdentities.length,
      pendingMigrations: webIdentities.filter(item => item.needsMigration).length,
      completedMigrations: webIdentities.filter(item => !item.needsMigration).length,
      failedAttempts: webIdentities.filter(item => 
        (item.migrationAttempts || 0) >= this.MAX_MIGRATION_ATTEMPTS
      ).length
    };
  }
}

export default MigrationManager;