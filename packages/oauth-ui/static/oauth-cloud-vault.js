/**
 * Standalone cloud-vault unseal for OAuth unlock pages.
 *
 * The unlock page needs the owner's Drive access token before any pN token
 * exists, so it cannot call the Bearer-gated cloud-vault endpoint. The API hands
 * back the sealed envelope from /oauth/authorize/authenticate instead, and this
 * script opens it with factors the page already holds.
 *
 * Must stay byte-compatible with packages/device-cloud-credentials/src/seal.ts
 * (PBKDF2-SHA256, 100k iterations, AES-GCM) and cloudVault.ts session ids.
 *
 * The unsealed token is returned to the caller and never stored. Do not persist
 * it to localStorage or sessionStorage: cloud tokens must not survive lock.
 */
(function (global) {
  'use strict';

  var MLKEM_SESSION_ID = 'pn-cloud-creds-v1-mlkem';
  var LEGACY_SESSION_ID = 'pn-cloud-creds-v1';

  function base64ToBytes(b64) {
    var binary = atob(b64);
    var out = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }

  function deriveKey(sessionId, pnName, passcode, saltBytes) {
    var encoder = new TextEncoder();
    return crypto.subtle
      .importKey(
        'raw',
        encoder.encode(sessionId + '::' + pnName + '::' + passcode),
        'PBKDF2',
        false,
        ['deriveKey']
      )
      .then(function (keyMaterial) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
          keyMaterial,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
      });
  }

  function isSealedEnvelopeShape(value) {
    return (
      !!value &&
      typeof value === 'object' &&
      typeof value.encryptedData === 'string' &&
      value.encryptedData.length > 0 &&
      typeof value.iv === 'string' &&
      value.iv.length > 0 &&
      typeof value.salt === 'string' &&
      value.salt.length > 0
    );
  }

  function unsealWith(envelope, sessionId, pnName, passcode) {
    if (envelope.expiresAt) {
      var exp = Date.parse(envelope.expiresAt);
      if (!isNaN(exp) && Date.now() > exp) {
        return Promise.reject(new Error('Sealed cloud credentials expired'));
      }
    }
    var salt = base64ToBytes(envelope.salt);
    var iv = base64ToBytes(envelope.iv);
    return deriveKey(sessionId, pnName, passcode, salt)
      .then(function (key) {
        return crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv },
          key,
          base64ToBytes(envelope.encryptedData)
        );
      })
      .then(function (decrypted) {
        return JSON.parse(new TextDecoder().decode(decrypted));
      });
  }

  /** ML-KEM first, then legacy pn name + passcode. Mirrors unsealCloudVaultWithAnyFactor. */
  function unsealWithAnyFactor(envelope, factors) {
    if (!isSealedEnvelopeShape(envelope)) {
      return Promise.reject(new Error('Not a sealed envelope'));
    }
    var attempt = Promise.reject(new Error('No cloud vault unseal factors'));

    if (factors && factors.mlKemSecretKey) {
      attempt = attempt.catch(function () {
        return unsealWith(envelope, MLKEM_SESSION_ID, 'mlkem', factors.mlKemSecretKey);
      });
    }
    if (factors && factors.pnName && factors.passcode) {
      attempt = attempt.catch(function () {
        return unsealWith(
          envelope,
          LEGACY_SESSION_ID,
          String(factors.pnName).trim(),
          factors.passcode
        );
      });
    }
    return attempt;
  }

  /** First usable Google access token in the envelope. Mirrors googleTokenFromEnvelope. */
  function googleTokenFromEnvelope(envelope) {
    if (!envelope) return null;
    var accounts = envelope.googleDriveAccounts;
    if (!Array.isArray(accounts) || !accounts.length) {
      accounts = envelope.googleDrive ? [envelope.googleDrive] : [];
    }
    for (var i = 0; i < accounts.length; i++) {
      var acct = accounts[i] || {};
      var tok = acct.access_token || acct.accessToken || '';
      if (typeof tok === 'string' && tok.trim()) return tok.trim();
    }
    return null;
  }

  /**
   * Resolve a Drive access token from a sealed vault.
   * Resolves to null rather than throwing: a missing token means consent is shown,
   * which is a degraded but correct outcome.
   */
  function accessTokenFromSealedVault(envelope, factors) {
    if (!envelope) return Promise.resolve(null);
    return unsealWithAnyFactor(envelope, factors)
      .then(function (credentials) {
        return googleTokenFromEnvelope(credentials);
      })
      .catch(function () {
        // Never log the reason with identity material attached.
        return null;
      });
  }

  global.ParNoirCloudVault = {
    accessTokenFromSealedVault: accessTokenFromSealedVault,
    unsealWithAnyFactor: unsealWithAnyFactor,
    googleTokenFromEnvelope: googleTokenFromEnvelope,
    isSealedEnvelopeShape: isSealedEnvelopeShape
  };
})(typeof window !== 'undefined' ? window : this);
