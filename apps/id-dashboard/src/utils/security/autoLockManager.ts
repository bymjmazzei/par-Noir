/**
 * Auto-Lock Manager
 * 
 * Automatically locks the session after inactivity to protect against physical access attacks.
 * Clears credentials from memory and requires re-authentication.
 */

import { SecureCredentialManager } from '../secureCredentialManager';

export class AutoLockManager {
  private timeoutId: number | null = null;
  private readonly LOCK_DELAY_MS = 5 * 60 * 1000; // 5 minutes (improved from 15)
  private onLock: () => void;
  private isLocked: boolean = false;

  constructor(onLock: () => void) {
    this.onLock = onLock;
    this.setupListeners();
  }

  /**
   * Setup event listeners for user activity
   */
  private setupListeners(): void {
    // Reset on user activity
    const events: (keyof WindowEventMap)[] = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click',
      'keydown'
    ];

    events.forEach(event => {
      document.addEventListener(event, () => this.reset(), { passive: true });
    });

    // Lock on visibility change (tab switch)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.lock();
      } else {
        this.reset();
      }
    });

    // Lock on window blur
    window.addEventListener('blur', () => {
      this.lock();
    });

    // Lock on page unload
    window.addEventListener('beforeunload', () => {
      this.lock();
    });

    // Start the timer
    this.reset();
  }

  /**
   * Reset the auto-lock timer
   */
  reset(): void {
    if (this.isLocked) {
      return; // Don't reset if already locked
    }

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    
    this.timeoutId = window.setTimeout(() => {
      this.lock();
    }, this.LOCK_DELAY_MS);
  }

  /**
   * Lock the session immediately
   */
  lock(): void {
    if (this.isLocked) {
      return; // Already locked
    }

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // Clear all credentials from memory
    SecureCredentialManager.clearAll();

    this.isLocked = true;
    this.onLock();
  }

  /**
   * Unlock the session (called after re-authentication)
   */
  unlock(): void {
    this.isLocked = false;
    this.reset();
  }

  /**
   * Check if session is locked
   */
  getLocked(): boolean {
    return this.isLocked;
  }

  /**
   * Destroy the auto-lock manager
   */
  destroy(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.lock(); // Lock before destroying
  }

  /**
   * Get remaining time until auto-lock (in milliseconds)
   */
  getRemainingTime(): number {
    // Note: This is approximate since we don't track exact start time
    // For exact tracking, we'd need to store the start timestamp
    return this.LOCK_DELAY_MS;
  }
}

