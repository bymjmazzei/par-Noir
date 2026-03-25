/**
 * AES-256-GCM at-rest encryption for feed synthetic credential fields in feed_tokens.
 * Legacy rows used plain base64 encoding; decryptFeedTokenField supports both.
 */

import crypto from 'crypto';

const VERSION_PREFIX = 'enc:v1:';

function getKey32(): Buffer {
  const explicit = process.env.FEED_TOKEN_ENCRYPTION_KEY?.trim();
  if (explicit) {
    if (/^[0-9a-fA-F]{64}$/.test(explicit)) {
      return Buffer.from(explicit, 'hex');
    }
    const fromB64 = Buffer.from(explicit, 'base64');
    if (fromB64.length === 32) {
      return fromB64;
    }
    throw new Error('FEED_TOKEN_ENCRYPTION_KEY must be 64 hex chars or 32-byte base64');
  }

  const oauth = process.env.PN_OAUTH_SECRET?.trim();
  if (oauth) {
    return crypto.createHash('sha256').update(oauth, 'utf8').digest();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Set FEED_TOKEN_ENCRYPTION_KEY or PN_OAUTH_SECRET for feed token encryption');
  }

  return crypto.createHash('sha256').update('feed-token-dev-key', 'utf8').digest();
}

/** Store-safe string: enc:v1: + base64url(iv|tag|ciphertext) */
export function encryptFeedTokenField(plaintext: string): string {
  const key = getKey32();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, tag, enc]);
  return VERSION_PREFIX + combined.toString('base64url');
}

/**
 * Decrypt v1 blob, or return legacy base64-decoded UTF-8 (pre-encryption rows).
 */
export function decryptFeedTokenField(stored: string): string {
  if (stored.startsWith(VERSION_PREFIX)) {
    const raw = Buffer.from(stored.slice(VERSION_PREFIX.length), 'base64url');
    if (raw.length < 12 + 16 + 1) {
      throw new Error('Invalid encrypted feed token field');
    }
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const key = getKey32();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  return Buffer.from(stored, 'base64').toString('utf8');
}
