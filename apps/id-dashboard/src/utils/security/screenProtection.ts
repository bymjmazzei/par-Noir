/**
 * Screen Protection Utility
 * 
 * Blurs sensitive content when tab is not active or window loses focus.
 * Protects against shoulder surfing and screen capture attacks.
 */

export class ScreenProtection {
  private static overlay: HTMLDivElement | null = null;
  private static isEnabled: boolean = false;

  /**
   * Enable screen protection
   * Blurs content when tab is hidden or window loses focus
   */
  static enable(): void {
    if (this.isEnabled) {
      return; // Already enabled
    }

    this.isEnabled = true;

    // Handle visibility change (tab switch)
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    // Handle window blur (window loses focus)
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('focus', this.handleWindowFocus);

    // Initial check
    if (document.hidden) {
      this.showOverlay();
    }
  }

  /**
   * Disable screen protection
   */
  static disable(): void {
    if (!this.isEnabled) {
      return;
    }

    this.isEnabled = false;

    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('focus', this.handleWindowFocus);

    this.hideOverlay();
  }

  /**
   * Handle visibility change (tab switch)
   */
  private static handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.showOverlay();
    } else {
      this.hideOverlay();
    }
  };

  /**
   * Handle window blur (window loses focus)
   */
  private static handleWindowBlur = (): void => {
    this.showOverlay();
  };

  /**
   * Handle window focus (window gains focus)
   */
  private static handleWindowFocus = (): void => {
    if (!document.hidden) {
      this.hideOverlay();
    }
  };

  /**
   * Show blur overlay
   */
  private static showOverlay(): void {
    if (this.overlay) {
      return; // Already showing
    }

    const overlay = document.createElement('div');
    overlay.id = 'screen-protection-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.95);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    `;

    // Add message
    const message = document.createElement('div');
    message.style.cssText = `
      color: white;
      font-size: 18px;
      font-weight: 500;
      text-align: center;
      padding: 20px;
    `;
    message.textContent = 'Screen Protected';
    overlay.appendChild(message);

    document.body.appendChild(overlay);
    this.overlay = overlay;
  }

  /**
   * Hide blur overlay
   */
  private static hideOverlay(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  /**
   * Check if screen protection is enabled
   */
  static isProtectionEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Manually show overlay (for testing or manual triggers)
   */
  static show(): void {
    this.showOverlay();
  }

  /**
   * Manually hide overlay
   */
  static hide(): void {
    this.hideOverlay();
  }
}

