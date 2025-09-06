import { cryptoWorkerManager } from './cryptoWorkerManager';
// Password/Passcode Management
export class PasswordManager {
  /**
   * Hash passcode for verification
   */
  static async hashPasscode(passcode: string, salt: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const passcodeBuffer = encoder.encode(passcode);
      const saltBuffer = encoder.encode(salt);

      const keyMaterial = await cryptoWorkerManager.importKey(
        'raw',
        passcodeBuffer,
        'PBKDF2',
        false,
        ['deriveBits']
      );

      const hashBuffer = await cryptoWorkerManager.deriveBits(
        {
          name: 'PBKDF2',
          salt: saltBuffer,
          iterations: 100000,
          hash: 'SHA-256',
        },
        keyMaterial,
        256
      );

      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      throw new Error(`Failed to hash passcode: ${error}`);
    }
  }

  /**
   * Verify passcode against stored hash
   */
  static async verifyPasscode(passcode: string, storedHash: string, salt: string): Promise<boolean> {
    try {
      const computedHash = await this.hashPasscode(passcode, salt);
      return computedHash === storedHash;
    } catch (error) {
      return false;
    }
  }
}
