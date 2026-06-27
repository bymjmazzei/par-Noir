/**
 * Physical USB / NFC unlock for oauth-authorize.html (matches id-dashboard crypto + physicalKeyCrypto).
 * Exposes window.ParNoirOAuthPhysical — no bundler required.
 */
(function (global) {
  'use strict';

  var PBKDF2_ITERATIONS = 600000;
  var SALT_LENGTH = 16;
  var IV_LENGTH = 12;

  function base64ToArrayBuffer(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    for (var i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  async function deriveDriveKey(passcode, salt) {
    var encoder = new TextEncoder();
    var keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(passcode),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-512' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function decryptFromDrive(encryptedBase64, drivePasscode) {
    var combined = new Uint8Array(base64ToArrayBuffer(encryptedBase64));
    var salt = combined.slice(0, SALT_LENGTH);
    var iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    var ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);
    var key = await deriveDriveKey(drivePasscode, salt);
    var decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ciphertext);
    var json = new TextDecoder().decode(decrypted);
    return JSON.parse(json);
  }

  async function decryptUidFromDrive(encryptedBase64, drivePasscode) {
    var combined = new Uint8Array(base64ToArrayBuffer(encryptedBase64));
    var salt = combined.slice(0, SALT_LENGTH);
    var iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    var ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);
    var key = await deriveDriveKey(drivePasscode, salt);
    var decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  }

  async function deriveKeyWithBinding(pnName, passcode, saltB64, uid) {
    var keyMaterialStr = uid ? pnName + ':' + passcode + ':' + uid : pnName + ':' + passcode;
    var encoder = new TextEncoder();
    var keyMaterialBuffer = encoder.encode(keyMaterialStr);
    var saltBuffer = base64ToArrayBuffer(saltB64);
    var keyMaterialKey = await crypto.subtle.importKey(
      'raw',
      keyMaterialBuffer,
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 1000000,
        hash: 'SHA-512',
      },
      keyMaterialKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function decryptWithBinding(identityRow, pnName, passcode, uid) {
    var enc = identityRow.encrypted ?? identityRow.encryptedData;
    var iv = base64ToArrayBuffer(identityRow.iv);
    var data = base64ToArrayBuffer(enc);
    var key = await deriveKeyWithBinding(pnName, passcode, identityRow.salt, uid);
    var decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, data);
    return new TextDecoder().decode(decryptedBuffer);
  }

  /**
   * @returns {{ encryptedIdentity: object, publicKey: string, did: string, decryptedIdentity: object }}
   */
  async function unlockBoundIdentity(boundPnBlobJson, uid, pnName, passcode) {
    var pnData = typeof boundPnBlobJson === 'string' ? JSON.parse(boundPnBlobJson) : boundPnBlobJson;
    var binding = pnData.binding;
    var identities = pnData.identities;
    if (!binding || (binding.type !== 'usb' && binding.type !== 'nfc') || !identities || !identities.length) {
      throw new Error('Invalid key-bound pN file format');
    }
    var identityToUnlock = identities[0];
    var plaintext = await decryptWithBinding(identityToUnlock, pnName, passcode, uid);
    var identity = JSON.parse(plaintext);
    var publicKey = identityToUnlock.publicKey || identity.publicKey;
    if (!publicKey) throw new Error('Invalid pN file: missing public key');
    var did = identity.id;
    if (!did) throw new Error('Identity file does not contain a DID');
    var encVal = identityToUnlock.encrypted ?? identityToUnlock.encryptedData;
    var encryptedIdentity = Object.assign({}, identityToUnlock, {
      encryptedData: encVal,
      publicKey: publicKey,
    });
    return { encryptedIdentity: encryptedIdentity, publicKey: publicKey, did: did, decryptedIdentity: identity };
  }

  async function unlockFromUsbKeyAndPayload(keyFileText, drivePasscode, payloadFileTextOrNull, pnName, passcode) {
    var uid;
    var boundPnBlob;
    try {
      var container = await decryptFromDrive(keyFileText, drivePasscode);
      uid = container.uid;
      boundPnBlob = container.boundPnBlob;
    } catch (e1) {
      try {
        uid = await decryptUidFromDrive(keyFileText, drivePasscode);
        if (!payloadFileTextOrNull) {
          throw new Error('Select the payload file (parnoir-payload.enc) after the key file.');
        }
        boundPnBlob = payloadFileTextOrNull;
      } catch (e2) {
        throw new Error(e2.message || e1.message || 'Invalid key file or drive passcode');
      }
    }
    return unlockBoundIdentity(boundPnBlob, uid, pnName, passcode);
  }

  var PARNOIR_MIME_TYPE = 'application/x-parnoir-identity';

  async function readNfcIdentity() {
    if (typeof NDEFReader === 'undefined') {
      throw new Error('NFC is not supported in this browser. Use Chrome on Android or unlock with a file/USB.');
    }
    var NDEFReader = global.NDEFReader;
    var ndef = new NDEFReader();
    return new Promise(function (resolve, reject) {
      var timeoutId;
      var onReading = function (evt) {
        clearTimeout(timeoutId);
        ndef.removeEventListener('reading', onReading);
        ndef.removeEventListener('error', onErrorHandler);
        try {
          var message = evt.message;
          var serialNumber = evt.serialNumber || '';
          if (!message || !message.records || !message.records.length) {
            reject(new Error('No records on NFC tag'));
            return;
          }
          for (var i = 0; i < message.records.length; i++) {
            var record = message.records[i];
            if (
              record.recordType === 'mime' &&
              record.mediaType === PARNOIR_MIME_TYPE &&
              record.data
            ) {
              var boundPnBlob = new TextDecoder().decode(record.data);
              resolve({ boundPnBlob: boundPnBlob, uid: serialNumber });
              return;
            }
          }
          reject(new Error('pN identity not found on this card'));
        } catch (err) {
          reject(err);
        }
      };
      var onErrorHandler = function (e) {
        clearTimeout(timeoutId);
        ndef.removeEventListener('reading', onReading);
        ndef.removeEventListener('error', onErrorHandler);
        reject(e.error || new Error('NFC read failed'));
      };
      ndef.addEventListener('reading', onReading);
      ndef.addEventListener('error', onErrorHandler);
      timeoutId = setTimeout(function () {
        ndef.removeEventListener('reading', onReading);
        ndef.removeEventListener('error', onErrorHandler);
        reject(new Error('Timeout: tap your NFC card'));
      }, 60000);
      ndef.scan().catch(function (err) {
        clearTimeout(timeoutId);
        ndef.removeEventListener('reading', onReading);
        ndef.removeEventListener('error', onErrorHandler);
        reject(err);
      });
    });
  }

  /**
   * Decrypt a standard pN identity file (file upload mode).
   * Key derivation matches id-dashboard IdentityCrypto: PBKDF2 on "pnName:passcode".
   * @returns {{ encryptedIdentity: object, publicKey: string, did: string, decryptedIdentity: object }}
   */
  async function decryptIdentityFile(identityRow, pnName, passcode) {
    var enc = identityRow.encryptedData ?? identityRow.encrypted;
    if (!enc || !identityRow.iv || !identityRow.salt) {
      throw new Error('Invalid identity file: missing encrypted data');
    }
    var plaintext = await decryptWithBinding(identityRow, pnName, passcode, undefined);
    var identity = JSON.parse(plaintext);
    var publicKey = identityRow.publicKey || identity.publicKey;
    if (!publicKey) throw new Error('Invalid pN file: missing public key');
    if (identity.username !== pnName) {
      throw new Error('Authentication failed: pN name does not match identity file');
    }
    var did = identity.id;
    if (!did) throw new Error('Identity file does not contain a DID');
    var encryptedIdentity = Object.assign({}, identityRow, {
      encryptedData: enc,
      publicKey: publicKey,
    });
    return { encryptedIdentity: encryptedIdentity, publicKey: publicKey, did: did, decryptedIdentity: identity };
  }

  global.ParNoirOAuthPhysical = {
    decryptFromDrive: decryptFromDrive,
    decryptUidFromDrive: decryptUidFromDrive,
    decryptIdentityFile: decryptIdentityFile,
    unlockBoundIdentity: unlockBoundIdentity,
    unlockFromUsbKeyAndPayload: unlockFromUsbKeyAndPayload,
    readNfcIdentity: readNfcIdentity,
    hasNfc: function () {
      return typeof global.NDEFReader !== 'undefined';
    },
  };
})(typeof window !== 'undefined' ? window : global);
