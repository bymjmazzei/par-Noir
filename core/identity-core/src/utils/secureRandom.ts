/**
 * Secure Random Number Generator
 * Provides cryptographically secure random number generation
 */

export class SecureRandom {
  /**
   * Generate cryptographically secure random bytes
   */
  static generateBytes(length: number): Uint8Array {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return array;
  }

  /**
   * Generate a cryptographically secure random number between min and max (inclusive)
   */
  static generateNumber(min: number, max: number): number {
    const range = max - min + 1;
    const bytes = this.generateBytes(4);
    const value = new DataView(bytes.buffer).getUint32(0, false);
    return min + (value % range);
  }

  /**
   * Generate a cryptographically secure random BigInt between min and max (inclusive)
   */
  static generateBigInt(min: bigint, max: bigint): bigint {
    const range = max - min + 1n;
    const bytes = this.generateBytes(8);
    const value = new DataView(bytes.buffer).getBigUint64(0, false);
    return min + (value % range);
  }

  /**
   * Generate a cryptographically secure random string of specified length
   */
  static generateString(length: number, charset: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset.charAt(this.generateNumber(0, charset.length - 1));
    }
    return result;
  }

  /**
   * Generate a cryptographically secure UUID v4
   */
  static generateUUID(): string {
    const bytes = this.generateBytes(16);
    
    // Set version (4) and variant bits
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  /**
   * Fill an array with cryptographically secure random values
   */
  static fillArray(array: Uint8Array): void {
    crypto.getRandomValues(array);
  }

  /**
   * Generate a secure random identifier of specified length
   */
  static generateId(length: number = 9): string {
    return this.generateString(length, 'abcdefghijklmnopqrstuvwxyz0123456789');
  }

  /**
   * Generate a success/failure boolean based on probability
   */
  static generateSuccess(probability: number): boolean {
    return this.generateNumber(0, 100) / 100 < probability;
  }

  /**
   * Generate a random statistic within a range
   */
  static generateStatistic(min: number, max: number): number {
    return this.generateNumber(min, max);
  }

  /**
   * Generate a message ID
   */
  static generateMessageId(): string {
    return `msg_${Date.now()}_${this.generateId(12)}`;
  }

  /**
   * Generate an event ID
   */
  static generateEventId(): string {
    return `evt_${Date.now()}_${this.generateId(12)}`;
  }

  /**
   * Generate a transaction ID
   */
  static generateTransactionId(): string {
    return `tx_${Date.now()}_${this.generateId(12)}`;
  }

  /**
   * Generate a span ID
   */
  static generateSpanId(): string {
    return `span_${Date.now()}_${this.generateId(12)}`;
  }

  /**
   * Generate an error ID
   */
  static generateErrorId(): string {
    return `err_${Date.now()}_${this.generateId(12)}`;
  }

  /**
   * Generate an alert ID
   */
  static generateAlertId(): string {
    return `alert_${Date.now()}_${this.generateId(12)}`;
  }

  /**
   * Generate a session ID
   */
  static generateSessionId(): string {
    return `sess_${Date.now()}_${this.generateId(12)}`;
  }

  /**
   * Generate a notification ID
   */
  static generateNotificationId(): string {
    return `notif_${Date.now()}_${this.generateId(12)}`;
  }

  /**
   * Generate a verification code
   */
  static generateVerificationCode(length: number = 6): string {
    return this.generateString(length, '0123456789');
  }

  /**
   * Generate a fingerprint ID
   */
  static generateFingerprintId(): string {
    return `fp_${Date.now()}_${this.generateId(12)}`;
  }

  /**
   * Generate a sync ID
   */
  static generateSyncId(): string {
    return `sync_${Date.now()}_${this.generateId(12)}`;
  }

  /**
   * Generate a proposal ID
   */
  static generateProposalId(): string {
    return `proposal_${Date.now()}_${this.generateId(12)}`;
  }

  /**
   * Generate a security ID
   */
  static generateSecurityId(): string {
    return `security_${Date.now()}_${this.generateId(12)}`;
  }
}
