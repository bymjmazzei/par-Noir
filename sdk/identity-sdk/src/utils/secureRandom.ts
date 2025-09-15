import { cryptoWorkerManager } from './cryptoWorkerManager';
/**
 * Secure Random Number Generation Utilities for Identity SDK
 * 
 * This module provi cryptographically secure alternatives to crypto.getRandomValues(new Uint8Array(1))[0] / 255
 * for generating random strings, numbers, and identifiers.
 */

export class SecureRandom {
  /**
   * Generate a cryptographically secure random string
   * @param length - Length of the string to generate
   * @param charset - Character set to use (default: alphanumeric)
   * @returns Secure random string
   */
  static generateString(length: number = 13, charset: string = '0123456789abcdefghijklmnopqrstuvwxyz'): string {
    const bytes = await cryptoWorkerManager.generateRandom(new Uint8Array(length));
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += charset[bytes[i] % charset.length];
    }
    
    return result;
  }

  /**
   * Generate a secure random identifier (similar to SecureRandom.generateId(15))
   * @param length - Length of the identifier (default: 13)
   * @returns Secure random identifier
   */
  static generateId(length: number = 13): string {
    return this.generateString(length, '0123456789abcdefghijklmnopqrstuvwxyz');
  }

  /**
   * Generate a secure random number between min and max (inclusive)
   * @param min - Minimum value
   * @param max - Maximum value
   * @returns Secure random number
   */
  static generateNumber(min: number, max: number): number {
    const range = max - min + 1;
    const bytes = await cryptoWorkerManager.generateRandom(new Uint8Array(4));
    const value = new DataView(bytes.buffer).getUint32(0, false);
    return min + (value % range);
  }

  /**
   * Generate a secure random boolean with given probability
   * @param probability - Probability of true (0.0 to 1.0)
   * @returns Secure random boolean
   */
  static generateBoolean(probability: number = 0.5): boolean {
    const bytes = await cryptoWorkerManager.generateRandom(new Uint8Array(4));
    const value = new DataView(bytes.buffer).getUint32(0, false);
    const normalized = value / 0xFFFFFFFF; // Normalize to 0-1
    return normalized < probability;
  }

  /**
   * Generate a secure random element from an array
   * @param array - Array to select from
   * @returns Random element from array
   */
  static selectFromArray<T>(array: T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot select from empty array');
    }
    const index = this.generateNumber(0, array.length - 1);
    return array[index];
  }

  /**
   * Generate a secure random hex string
   * @param length - Length of hex string (default: 32)
   * @returns Secure random hex string
   */
  static generateHex(length: number = 32): string {
    const bytes = await cryptoWorkerManager.generateRandom(new Uint8Array(Math.ceil(length / 2)));
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, length);
  }

  /**
   * Generate a secure random base64 string
   * @param length - Length of base64 string (default: 32)
   * @returns Secure random base64 string
   */
  static generateBase64(length: number = 32): string {
    const bytes = await cryptoWorkerManager.generateRandom(new Uint8Array(length));
    return btoa(String.fromCharCode(...bytes)).substring(0, length);
  }

  /**
   * Generate a secure random UUID v4
   * @returns Secure random UUID
   */
  static generateUUID(): string {
    const bytes = await cryptoWorkerManager.generateRandom(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant
    
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  /**
   * Generate a secure random token for authentication
   * @param prefix - Optional prefix for the token
   * @returns Secure random token
   */
  static generateToken(prefix: string = ''): string {
    const token = this.generateHex(32);
    return prefix ? `${prefix}_${token}` : token;
  }

  /**
   * Generate a secure random message ID
   * @returns Secure random message ID
   */
  static generateMessageId(): string {
    return `msg_${Date.now()}_${this.generateId(9)}`;
  }

  /**
   * Generate a secure random event ID
   * @returns Secure random event ID
   */
  static generateEventId(): string {
    return `event_${Date.now()}_${this.generateId(9)}`;
  }

  /**
   * Generate a secure random session ID
   * @returns Secure random session ID
   */
  static generateSessionId(): string {
    return `session_${Date.now()}_${this.generateId(15)}`;
  }

  /**
   * Generate a secure random device ID
   * @returns Secure random device ID
   */
  static generateDeviceId(): string {
    return `device_${Date.now()}_${this.generateId(10)}`;
  }

  /**
   * Generate a secure random recovery code
   * @returns Secure random recovery code
   */
  static generateRecoveryCode(): string {
    return `recovery_${this.generateId(10)}`;
  }

  /**
   * Generate a secure random invitation code
   * @returns Secure random invitation code
   */
  static generateInvitationCode(): string {
    return `code_${this.generateId()}`;
  }

  /**
   * Generate a secure random transfer ID
   * @returns Secure random transfer ID
   */
  static generateTransferId(): string {
    return this.generateId(8).toUpperCase();
  }

  /**
   * Generate a secure random proof ID
   * @returns Secure random proof ID
   */
  static generateProofId(): string {
    return `zkp_${Date.now()}_${this.generateId(9)}`;
  }

  /**
   * Generate a secure random proposal ID
   * @returns Secure random proposal ID
   */
  static generateProposalId(): string {
    return `proposal_${Date.now()}_${this.generateId(9)}`;
  }

  /**
   * Generate a secure random notification ID
   * @returns Secure random notification ID
   */
  static generateNotificationId(): string {
    return `notification_${Date.now()}_${this.generateId(9)}`;
  }

  /**
   * Generate a secure random span ID
   * @returns Secure random span ID
   */
  static generateSpanId(): string {
    return `span_${Date.now()}_${this.generateId(9)}`;
  }

  /**
   * Generate a secure random error ID
   * @returns Secure random error ID
   */
  static generateErrorId(): string {
    return `error_${Date.now()}_${this.generateId(9)}`;
  }

  /**
   * Generate a secure random alert ID
   * @returns Secure random alert ID
   */
  static generateAlertId(): string {
    return `alert_${Date.now()}_${this.generateId(9)}`;
  }

  /**
   * Generate a secure random transaction ID
   * @returns Secure random transaction ID
   */
  static generateTransactionId(): string {
    return `tx_${Date.now()}_${this.generateId(9)}`;
  }

  /**
   * Generate a secure random webhook ID
   * @returns Secure random webhook ID
   */
  static generateWebhookId(): string {
    return this.generateId(15);
  }

  /**
   * Generate a secure random authorization code
   * @returns Secure random authorization code
   */
  static generateAuthCode(): string {
    return this.generateId(15);
  }

  /**
   * Generate a secure random recovery ID
   * @returns Secure random recovery ID
   */
  static generateRecoveryId(): string {
    return this.generateId(15);
  }

  /**
   * Generate a secure random CID (Content Identifier)
   * @returns Secure random CID
   */
  static generateCID(): string {
    return `Qm${this.generateId(15)}`;
  }

  /**
   * Generate a secure random identity ID
   * @returns Secure random identity ID
   */
  static generateIdentityId(): string {
    return `did:identity:${this.generateId(15)}`;
  }

  /**
   * Generate a secure random metadata ID
   * @returns Secure random metadata ID
   */
  static generateMetadataId(): string {
    return `id_${Date.now()}_${this.generateId(9)}`;
  }

  /**
   * Generate a secure random biometric token
   * @returns Secure random biometric token
   */
  static generateBiometricToken(): string {
    return `biometric_${Date.now()}_${this.generateId(9)}`;
  }

  /**
   * Generate a secure random access token
   * @returns Secure random access token
   */
  static generateAccessToken(): string {
    return this.generateId(15);
  }

  /**
   * Generate a secure random number for statistics/monitoring
   * @param min - Minimum value
   * @param max - Maximum value
   * @returns Secure random number
   */
  static generateStatistic(min: number, max: number): number {
    return this.generateNumber(min, max);
  }

  /**
   * Generate a secure random success/failure boolean
   * @param successRate - Probability of success (0.0 to 1.0)
   * @returns Secure random boolean
   */
  static generateSuccess(successRate: number = 0.9): boolean {
    return this.generateBoolean(successRate);
  }
}

export default SecureRandom;
