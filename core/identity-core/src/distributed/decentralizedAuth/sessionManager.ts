// Session Manager - Handles session management functionality
import { AuthSession } from '../types/decentralizedAuth';
import { StorageManager } from './storageManager';

export class SessionManager {
  private sessions: Map<string, AuthSession>;
  private storageManager: StorageManager;

  constructor() {
    this.sessions = new Map();
    this.storageManager = new StorageManager();
  }

  /**
   * Create a new session
   */
  async createSession(did: string, session: AuthSession): Promise<void> {
    this.sessions.set(did, session);
    await this.storageManager.storeSessionSecurely(did, session);
  }

  /**
   * Get session for a DID
   */
  getSession(did: string): AuthSession | null {
    return this.sessions.get(did) || null;
  }

  /**
   * Check if session is valid
   */
  async isSessionValid(did: string): Promise<boolean> {
    try {
      const session = this.sessions.get(did);
      
      if (!session) {
        const storedSession = await this.storageManager.getSessionSecurely(did);
        if (!storedSession) return false;
        
        if (new Date() > new Date(storedSession.expiresAt)) {
          await this.removeSession(did);
          return false;
        }
        
        this.sessions.set(did, storedSession);
        return true;
      }
      
      return new Date() <= new Date(session.expiresAt);
    } catch (error) {
      return false;
    }
  }

  /**
   * Remove session
   */
  async removeSession(did: string): Promise<void> {
    this.sessions.delete(did);
    await this.storageManager.removeSessionSecurely(did);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): Map<string, AuthSession> {
    return new Map(this.sessions);
  }

  /**
   * Clear all sessions
   */
  async clearAllSessions(): Promise<void> {
    const dids = Array.from(this.sessions.keys());
    for (const did of dids) {
      await this.removeSession(did);
    }
  }
}
