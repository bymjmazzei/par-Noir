// Environment Detection - Detects if running as PWA or WebApp
export class EnvironmentDetector {
  private isPWA: boolean = false;
  private storageMode: 'localStorage' | 'indexedDB' | 'hybrid' = 'hybrid';

  /**
   * Detect if running as PWA or WebApp
   */
  detectEnvironment(mode: 'pwa' | 'webapp' | 'auto'): 'localStorage' | 'indexedDB' | 'hybrid' {
    // Check if running as PWA
    this.isPWA = this.checkPWAMode();
    
    // Determine storage mode
    if (mode === 'pwa' || (mode === 'auto' && this.isPWA)) {
      this.storageMode = 'localStorage';
    } else if (mode === 'webapp') {
      this.storageMode = 'indexedDB';
    } else {
      this.storageMode = 'hybrid';
    }

    return this.storageMode;
  }

  /**
   * Check if running in PWA mode
   */
  private checkPWAMode(): boolean {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://') ||
      window.location.protocol === 'file:'
    );
  }

  /**
   * Get storage mode
   */
  getStorageMode(): string {
    return this.storageMode;
  }

  /**
   * Check if running as PWA
   */
  isPWAMode(): boolean {
    return this.isPWA;
  }
}
