/**
 * Session Data Migration Utility
 * 
 * Removes pnName and passcode from existing sessions in IndexedDB.
 * These credentials are part of 2FA and should never be persisted.
 * 
 * Run this migration on app startup to clean up any existing vulnerable data.
 */

import { SecureStorage } from './storage';

interface LegacyStoredSession {
  id: string;
  accessToken: string;
  expiresAt: string;
  createdAt: string;
  pnName?: string;
  publicKey?: string;
  authToken?: string; // Will be removed - derived from credentials
  passcode?: string;
}

export class SessionDataMigration {
  private static readonly MIGRATION_VERSION = '1.0.0';
  private static readonly MIGRATION_KEY = 'session_data_migration_v1';

  /**
   * Check if migration has already been run
   * SECURITY: Always return false to ensure cleanup runs on every app load
   * This ensures any new sessions with credentials are cleaned immediately
   */
  static hasRun(): boolean {
    // Always return false to ensure cleanup runs every time
    // This is safe because the cleanup is idempotent
    return false;
  }

  /**
   * Mark migration as complete
   */
  private static markComplete(): void {
    try {
      localStorage.setItem(this.MIGRATION_KEY, this.MIGRATION_VERSION);
    } catch (e) {
      console.warn('Failed to mark migration as complete:', e);
    }
  }

  /**
   * Remove pnName, passcode, and authToken from a session object
   * SECURITY: authToken is derived from credentials and should not be stored
   */
  private static sanitizeSession(session: any): any {
    const sanitized = { ...session };
    // CRITICAL: Remove 2FA credentials
    delete sanitized.pnName;
    delete sanitized.passcode;
    // SECURITY: Remove authToken - it's derived from pnName+passcode+publicKey
    // Storing it would be equivalent to storing a hash of credentials
    delete sanitized.authToken;
    // Note: accessToken is kept as it's a JWT needed for API calls
    // It should be short-lived and expire quickly
    return sanitized;
  }

  /**
   * Run the migration to clean existing session data
   */
  static async runMigration(): Promise<{ cleaned: number; errors: number }> {
    // SECURITY: Always run cleanup to ensure no credentials are stored
    // Don't check hasRun() - we need to clean on every app load
    // This ensures any new sessions with credentials are cleaned immediately

    let cleaned = 0;
    let errors = 0;

    try {
      const storage = new SecureStorage();
      
      // Wait for storage to initialize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Access IndexedDB directly to clean sessions
      const dbName = 'IdentityProtocolDB';
      const dbVersion = 1;
      
      return new Promise((resolve) => {
        const request = indexedDB.open(dbName, dbVersion);
        
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          
          if (!db.objectStoreNames.contains('sessions')) {
            console.log('[SessionDataMigration] No sessions store found');
            db.close();
            this.markComplete();
            resolve({ cleaned: 0, errors: 0 });
            return;
          }

          const transaction = db.transaction(['sessions'], 'readwrite');
          const store = transaction.objectStore('sessions');
          const getAllRequest = store.getAll();

          getAllRequest.onsuccess = () => {
            const sessions = getAllRequest.result as LegacyStoredSession[];
            let processed = 0;
            let hasChanges = false;

            if (sessions.length === 0) {
              console.log('[SessionDataMigration] No sessions to clean');
              db.close();
              this.markComplete();
              resolve({ cleaned: 0, errors: 0 });
              return;
            }

            sessions.forEach((session) => {
              // Check if session has credentials that need to be removed
              // Also check for authToken as it's derived from credentials
              if (session.pnName || session.passcode || session.authToken) {
                hasChanges = true;
                const sanitized = this.sanitizeSession(session);
                
                try {
                  const putRequest = store.put(sanitized);
                  putRequest.onsuccess = () => {
                    cleaned++;
                    processed++;
                    if (processed === sessions.length) {
                      db.close();
                      if (hasChanges) {
                        console.log(`[SessionDataMigration] Cleaned ${cleaned} sessions`);
                      }
                      this.markComplete();
                      resolve({ cleaned, errors });
                    }
                  };
                  putRequest.onerror = () => {
                    errors++;
                    processed++;
                    if (processed === sessions.length) {
                      db.close();
                      this.markComplete();
                      resolve({ cleaned, errors });
                    }
                  };
                } catch (e) {
                  errors++;
                  processed++;
                  if (processed === sessions.length) {
                    db.close();
                    this.markComplete();
                    resolve({ cleaned, errors });
                  }
                }
              } else {
                processed++;
                if (processed === sessions.length) {
                  db.close();
                  if (hasChanges) {
                    console.log(`[SessionDataMigration] Cleaned ${cleaned} sessions`);
                  }
                  this.markComplete();
                  resolve({ cleaned, errors });
                }
              }
            });
          };

          getAllRequest.onerror = () => {
            console.error('[SessionDataMigration] Failed to read sessions');
            db.close();
            this.markComplete();
            resolve({ cleaned, errors: 1 });
          };
        };

        request.onerror = () => {
          console.error('[SessionDataMigration] Failed to open database');
          this.markComplete();
          resolve({ cleaned, errors: 1 });
        };
      });
    } catch (error) {
      console.error('[SessionDataMigration] Migration error:', error);
      errors++;
      this.markComplete(); // Mark as complete even on error to prevent retry loops
      return { cleaned, errors };
    }
  }

  /**
   * Force re-run migration (for testing or manual cleanup)
   */
  static async forceRun(): Promise<{ cleaned: number; errors: number }> {
    try {
      localStorage.removeItem(this.MIGRATION_KEY);
    } catch (e) {
      // Ignore
    }
    return this.runMigration();
  }

  /**
   * Clean up a specific session immediately
   * SECURITY: Called right after session storage to ensure credentials are removed
   */
  static async cleanupSession(sessionId: string): Promise<boolean> {
    const dbName = 'IdentityProtocolDB';
    const dbVersion = 1;
    
    return new Promise((resolve) => {
      const request = indexedDB.open(dbName, dbVersion);
      
      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains('sessions')) {
          db.close();
          resolve(false);
          return;
        }

        const transaction = db.transaction(['sessions'], 'readwrite');
        const store = transaction.objectStore('sessions');
        const getRequest = store.get(sessionId);

        getRequest.onsuccess = () => {
          const session = getRequest.result as LegacyStoredSession;
          
          if (!session) {
            db.close();
            resolve(false);
            return;
          }

          // SECURITY: Always sanitize the session to ensure clean object
          // Create a completely clean object with only allowed fields
          const cleanSession: any = {
            id: session.id,
            accessToken: session.accessToken,
            expiresAt: session.expiresAt,
            createdAt: session.createdAt,
            publicKey: session.publicKey,
            // Explicitly exclude: pnName, passcode, authToken
          };
          
          // Check if session had credentials that need to be removed
          const hadCredentials = !!(session.pnName || session.passcode || session.authToken);
          
          if (hadCredentials || JSON.stringify(cleanSession) !== JSON.stringify(session)) {
            const putRequest = store.put(cleanSession);
            
            putRequest.onsuccess = () => {
              db.close();
              if (hadCredentials) {
                console.log(`[SessionDataMigration] Cleaned session ${sessionId} - removed credentials`);
              }
              resolve(true);
            };
            
            putRequest.onerror = () => {
              db.close();
              console.warn(`[SessionDataMigration] Failed to clean session ${sessionId}`);
              resolve(false);
            };
          } else {
            db.close();
            resolve(false);
          }
        };

        getRequest.onerror = () => {
          db.close();
          resolve(false);
        };
      };

      request.onerror = () => {
        resolve(false);
      };
    });
  }
}

