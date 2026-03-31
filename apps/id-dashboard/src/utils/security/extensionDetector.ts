/**
 * Browser Extension Detector
 * 
 * Detects potentially suspicious browser extensions and warns users.
 * Note: Cannot directly detect extensions, but can detect suspicious behavior patterns.
 */

export interface ExtensionWarning {
  type: 'suspicious-script' | 'modified-dom' | 'external-resource' | 'unknown';
  severity: 'low' | 'medium' | 'high';
  message: string;
  recommendation: string;
}

export class ExtensionDetector {
  private static warnings: ExtensionWarning[] = [];
  private static isMonitoring: boolean = false;
  private static monitorIntervalId: ReturnType<typeof setInterval> | null = null;

  /**
   * Start monitoring for suspicious extension behavior
   */
  static startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.checkForSuspiciousActivity();

    if (this.monitorIntervalId !== null) {
      clearInterval(this.monitorIntervalId);
      this.monitorIntervalId = null;
    }
    this.monitorIntervalId = setInterval(() => {
      this.checkForSuspiciousActivity();
    }, 30000);
  }

  /**
   * Stop monitoring
   */
  static stopMonitoring(): void {
    this.isMonitoring = false;
    if (this.monitorIntervalId !== null) {
      clearInterval(this.monitorIntervalId);
      this.monitorIntervalId = null;
    }
  }

  /**
   * Check for suspicious activity patterns
   */
  private static checkForSuspiciousActivity(): void {
    this.warnings = [];

    // Check for external scripts injected into page
    const suspiciousScripts = this.detectSuspiciousScripts();
    if (suspiciousScripts.length > 0) {
      this.warnings.push({
        type: 'suspicious-script',
        severity: 'high',
        message: `Detected ${suspiciousScripts.length} external script(s) that may be from browser extensions`,
        recommendation: 'Review your installed browser extensions and remove any that you don\'t trust. Extensions can access your data and credentials.'
      });
    }

    // Check for modified DOM elements
    const modifiedElements = this.detectModifiedDOM();
    if (modifiedElements.length > 0) {
      this.warnings.push({
        type: 'modified-dom',
        severity: 'medium',
        message: 'Detected unexpected DOM modifications that may indicate extension activity',
        recommendation: 'Some browser extensions modify web pages. Ensure you trust all installed extensions.'
      });
    }

    // Check for external resources
    const externalResources = this.detectExternalResources();
    if (externalResources.length > 0) {
      this.warnings.push({
        type: 'external-resource',
        severity: 'low',
        message: `Detected ${externalResources.length} external resource(s) loaded`,
        recommendation: 'External resources may be loaded by extensions. Verify they are from trusted sources.'
      });
    }
  }

  /**
   * Detect suspicious scripts
   */
  private static detectSuspiciousScripts(): string[] {
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    const suspicious: string[] = [];

    scripts.forEach(script => {
      const src = script.getAttribute('src');
      if (!src) return;

      // Check if script is from external domain (not same origin)
      try {
        const scriptUrl = new URL(src, window.location.href);
        const currentOrigin = window.location.origin;

        // Allow known safe sources
        const safeSources = [
          'fonts.googleapis.com',
          'fonts.gstatic.com',
          'apis.google.com',
          'accounts.google.com',
          'www.googleapis.com',
          'oauth2.googleapis.com'
        ];

        const isSafeSource = safeSources.some(safe => scriptUrl.hostname.includes(safe));

        if (scriptUrl.origin !== currentOrigin && !isSafeSource && !src.startsWith('blob:') && !src.startsWith('data:')) {
          suspicious.push(src);
        }
      } catch (e) {
        // Invalid URL, skip
      }
    });

    return suspicious;
  }

  /**
   * Detect modified DOM elements
   */
  private static detectModifiedDOM(): string[] {
    // Check for elements with suspicious attributes or data attributes
    const suspiciousElements: string[] = [];
    
    // Check for elements with extension-related data attributes
    const elementsWithExtensionAttrs = document.querySelectorAll('[data-extension], [data-chrome-extension], [data-firefox-extension]');
    elementsWithExtensionAttrs.forEach((el, index) => {
      suspiciousElements.push(`element-${index}`);
    });

    return suspiciousElements;
  }

  /**
   * Detect external resources
   */
  private static detectExternalResources(): string[] {
    const external: string[] = [];
    const currentOrigin = window.location.origin;

    // Check images
    const images = Array.from(document.querySelectorAll('img[src]'));
    images.forEach(img => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('data:') && !src.startsWith('blob:')) {
        try {
          const imgUrl = new URL(src, window.location.href);
          if (imgUrl.origin !== currentOrigin) {
            external.push(src);
          }
        } catch (e) {
          // Invalid URL
        }
      }
    });

    return external;
  }

  /**
   * Get current warnings
   */
  static getWarnings(): ExtensionWarning[] {
    return [...this.warnings];
  }

  /**
   * Check if any warnings exist
   */
  static hasWarnings(): boolean {
    return this.warnings.length > 0;
  }

  /**
   * Get warning message for display
   */
  static getWarningMessage(): string | null {
    if (this.warnings.length === 0) {
      return null;
    }

    const highSeverityWarnings = this.warnings.filter(w => w.severity === 'high');
    if (highSeverityWarnings.length > 0) {
      return highSeverityWarnings[0].message;
    }

    return this.warnings[0].message;
  }

  /**
   * Get recommendations for all warnings
   */
  static getRecommendations(): string[] {
    return this.warnings.map(w => w.recommendation);
  }
}

