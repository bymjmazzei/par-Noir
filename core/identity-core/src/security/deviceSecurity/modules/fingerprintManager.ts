// import { cryptoWorkerManager } from '../../../encryption/cryptoWorkerManager';
import { DeviceFingerprint } from '../types/deviceSecurity';

export class FingerprintManager {
  private deviceFingerprint: DeviceFingerprint | null = null;

  /**
   * Generate device fingerprint
   */
  async generateDeviceFingerprint(): Promise<DeviceFingerprint> {
    const components = {
      userAgent: navigator.userAgent,
      screenResolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency || 0,
      deviceMemory: (navigator as any).deviceMemory || 0,
      maxTouchPoints: navigator.maxTouchPoints || 0,
      canvasFingerprint: await this.generateCanvasFingerprint(),
      webglFingerprint: await this.generateWebGLFingerprint(),
      audioFingerprint: await this.generateAudioFingerprint(),
      fontFingerprint: await this.generateFontFingerprint()
    };

    const fingerprintData = JSON.stringify(components);
    const hash = await this.hashData(fingerprintData);

    const fingerprint: DeviceFingerprint = {
      id: `fp_${Date.now()}_${hash.slice(0, 8)}`,
      components,
      hash,
      timestamp: new Date().toISOString()
    };

    this.deviceFingerprint = fingerprint;
    return fingerprint;
  }

  /**
   * Get current device fingerprint
   */
  getDeviceFingerprint(): DeviceFingerprint | null {
    return this.deviceFingerprint;
  }

  /**
   * Check if fingerprint has changed
   */
  async hasFingerprintChanged(): Promise<boolean> {
    if (!this.deviceFingerprint) {
      return false;
    }

    const currentFingerprint = await this.generateDeviceFingerprint();
    return currentFingerprint.hash !== this.deviceFingerprint.hash;
  }

  /**
   * Update device fingerprint
   */
  async updateDeviceFingerprint(): Promise<DeviceFingerprint> {
    return this.generateDeviceFingerprint();
  }

  /**
   * Generate canvas fingerprint
   */
  private async generateCanvasFingerprint(): Promise<string> {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return 'canvas_not_supported';

      // Draw some text and shapes
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('Identity Protocol', 2, 2);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillRect(100, 5, 80, 20);

      return canvas.toDataURL();
    } catch (error) {
      return 'canvas_error';
    }
  }

  /**
   * Generate WebGL fingerprint
   */
  private async generateWebGLFingerprint(): Promise<string> {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return 'webgl_not_supported';

      const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info');
      if (!debugInfo) return 'webgl_debug_not_supported';

      const vendor = (gl as any).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
      const renderer = (gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);

      return `${vendor}|${renderer}`;
    } catch (error) {
      return 'webgl_error';
    }
  }

  /**
   * Generate audio fingerprint
   */
  private async generateAudioFingerprint(): Promise<string> {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const analyser = audioContext.createAnalyser();
      const gainNode = audioContext.createGain();

      oscillator.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.1);

      const audioData = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(audioData);

      oscillator.stop();
      audioContext.close();

      return Array.from(audioData).slice(0, 10).join(',');
    } catch (error) {
      return 'audio_not_supported';
    }
  }

  /**
   * Generate font fingerprint
   */
  private async generateFontFingerprint(): Promise<string> {
    const fonts = [
      'Arial', 'Verdana', 'Helvetica', 'Times New Roman', 'Courier New',
      'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS',
      'Trebuchet MS', 'Arial Black', 'Impact', 'Lucida Console'
    ];

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const baseFont = 'monospace';
    const baseWidth = ctx.measureText('Identity Protocol').width;
    const availableFonts: string[] = [];

    for (const font of fonts) {
      ctx.font = `12px ${font}`;
      const width = ctx.measureText('Identity Protocol').width;
      if (width !== baseWidth) {
        availableFonts.push(font);
      }
    }

    return availableFonts.join(',');
  }

  /**
   * Hash data using SHA-256
   */
  private async hashData(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Get fingerprint components
   */
  getFingerprintComponents(): DeviceFingerprint['components'] | null {
    return this.deviceFingerprint?.components || null;
  }

  /**
   * Get fingerprint hash
   */
  getFingerprintHash(): string | null {
    return this.deviceFingerprint?.hash || null;
  }

  /**
   * Get fingerprint timestamp
   */
  getFingerprintTimestamp(): string | null {
    return this.deviceFingerprint?.timestamp || null;
  }

  /**
   * Clear device fingerprint
   */
  clearDeviceFingerprint(): void {
    this.deviceFingerprint = null;
  }

  /**
   * Export fingerprint for debugging
   */
  exportFingerprint(): string {
    return JSON.stringify(this.deviceFingerprint, null, 2);
  }

  /**
   * Import fingerprint from string
   */
  importFingerprint(data: string): boolean {
    try {
      const imported = JSON.parse(data);
      if (imported && imported.id && imported.components && imported.hash) {
        this.deviceFingerprint = imported;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}
