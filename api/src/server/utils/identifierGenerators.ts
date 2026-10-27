/**
 * Opaque identifier generator for auth challenges.
 * Random material comes from crypto.randomBytes; the base36 encoding is only
 * for readability, not for entropy.
 */

import crypto from 'crypto';

export function generateChallenge(): string {
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(16);
  const random = Array.from(randomBytes).map(b => b.toString(36)).join('');
  return `challenge_${timestamp}_${random}`;
}
