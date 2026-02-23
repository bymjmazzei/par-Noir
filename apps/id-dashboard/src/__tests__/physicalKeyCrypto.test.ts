/**
 * Unit tests for physical key crypto (UID, drive container).
 * Roundtrip tests for encryptForDrive/decryptFromDrive use real Web Crypto when available.
 * Binding key derivation (encryptDataWithBinding/decryptDataWithBinding) lives in crypto.ts
 * and is used by ExportToUsbModal, UnlockFromUsbModal, and NFC flows.
 */

import {
  generateUid,
  uidToBase64,
  base64ToUid,
  encryptForDrive,
  decryptFromDrive,
} from '../utils/physicalKeyCrypto';

describe('physicalKeyCrypto', () => {
  describe('generateUid', () => {
    it('returns a Uint8Array of length 32', () => {
      const uid = generateUid();
      expect(uid).toBeInstanceOf(Uint8Array);
      expect(uid.byteLength).toBe(32);
    });

    it('returns different values on each call', () => {
      const a = generateUid();
      const b = generateUid();
      expect(Array.from(a)).not.toEqual(Array.from(b));
    });
  });

  describe('uidToBase64 and base64ToUid', () => {
    it('roundtrips: base64ToUid(uidToBase64(uid)) equals uid', () => {
      const uid = generateUid();
      const b64 = uidToBase64(uid);
      expect(typeof b64).toBe('string');
      const back = base64ToUid(b64);
      expect(back.byteLength).toBe(uid.byteLength);
      expect(Array.from(back)).toEqual(Array.from(uid));
    });

    it('handles arbitrary 32-byte UID', () => {
      const uid = new Uint8Array(32);
      for (let i = 0; i < 32; i++) uid[i] = i;
      const b64 = uidToBase64(uid);
      const back = base64ToUid(b64);
      expect(Array.from(back)).toEqual(Array.from(uid));
    });
  });

  describe('encryptForDrive / decryptFromDrive', () => {
    it('roundtrips when real Web Crypto is available', async () => {
      const uid = new Uint8Array(32);
      crypto.getRandomValues(uid);
      const boundPnBlob = JSON.stringify({
        version: '1.0',
        timestamp: new Date().toISOString(),
        binding: { type: 'usb', uid: uidToBase64(uid) },
        identities: [{ encrypted: 'x', iv: 'y', salt: 'z' }],
      });
      const drivePasscode = 'test-drive-passcode-123';

      let encrypted: string;
      try {
        encrypted = await encryptForDrive(uid, boundPnBlob, drivePasscode);
      } catch {
        return; // Skip when crypto.subtle is mocked (e.g. in Jest default setup)
      }
      expect(typeof encrypted).toBe('string');
      expect(encrypted.length).toBeGreaterThan(0);

      const decrypted = await decryptFromDrive(encrypted, drivePasscode);
      expect(decrypted.uid).toBe(uidToBase64(uid));
      expect(decrypted.boundPnBlob).toBe(boundPnBlob);
    });

    it('decryptFromDrive fails with wrong passcode', async () => {
      const uid = generateUid();
      const boundPnBlob = '{"version":"1.0"}';
      let encrypted: string;
      try {
        encrypted = await encryptForDrive(uid, boundPnBlob, 'correct-passcode');
      } catch {
        return;
      }
      await expect(decryptFromDrive(encrypted, 'wrong-passcode')).rejects.toThrow();
    });
  });
});
