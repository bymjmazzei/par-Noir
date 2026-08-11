/**
 * Single guard for public aggregator rows: isPublic true requires both
 * publicToken and a usable publicContentRef. Used by POST/PUT metadata routes
 * and every non-route writer that can set isPublic.
 */

import {
  isPublicContentRef,
  publicTokenContainsEmbeddedCiphertext,
} from '@par-noir/aggregator-domain';
import type { Response } from 'express';

export type PublicRowGuardInput = {
  isPublic?: unknown;
  publicToken?: unknown;
  publicContentRef?: unknown;
};

export type PublicRowGuardFailure = {
  error: 'embedded_public_token_forbidden' | 'missing_public_content_ref' | 'missing_public_token';
  error_description: string;
};

/**
 * Returns a failure when the body would create or keep a public row without
 * usable share material. Private rows (isPublic !== true) always pass.
 */
export function validatePublicRowShareFields(
  input: PublicRowGuardInput
): PublicRowGuardFailure | null {
  if (input.isPublic !== true) {
    return null;
  }

  if (publicTokenContainsEmbeddedCiphertext(input.publicToken)) {
    return {
      error: 'embedded_public_token_forbidden',
      error_description:
        'publicToken must not embed shareEncrypted ciphertext; upload envelope to cloud and send publicContentRef + shareKey only',
    };
  }

  if (input.publicToken == null || input.publicToken === '') {
    return {
      error: 'missing_public_token',
      error_description: 'Public metadata requires publicToken with shareKey',
    };
  }

  if (!isPublicContentRef(input.publicContentRef)) {
    return {
      error: 'missing_public_content_ref',
      error_description: 'Public metadata requires publicContentRef with backend, objectId, and publicUrl',
    };
  }

  return null;
}

export function assertPublicRowShareFields(input: PublicRowGuardInput): void {
  const failure = validatePublicRowShareFields(input);
  if (failure) {
    throw new Error(`${failure.error}: ${failure.error_description}`);
  }
}

/**
 * DNS + allowlist check for a publicContentRef being written. Returns true if response was sent.
 */
export async function rejectUnsafePublicContentRefWrite(
  res: Response,
  publicContentRef: unknown
): Promise<boolean> {
  if (publicContentRef == null || publicContentRef === undefined) {
    return false;
  }
  if (typeof publicContentRef !== 'object') {
    res.status(400).json({
      error: 'unsafe_public_url',
      error_description: 'publicContentRef must be an object',
    });
    return true;
  }
  const ref = publicContentRef as { publicUrl?: unknown; backend?: unknown };
  if (typeof ref.publicUrl !== 'string' || typeof ref.backend !== 'string') {
    // Shape errors are handled by validatePublicRowShareFields when isPublic.
    // When setting a partial/malformed ref, still reject unsafe-looking URLs.
    if (typeof ref.publicUrl === 'string') {
      res.status(400).json({
        error: 'unsafe_public_url',
        error_description: 'publicContentRef requires backend and publicUrl',
      });
      return true;
    }
    return false;
  }
  try {
    const { assertSafePublicFetchUrlResolved } = await import('./safePublicFetchUrl');
    await assertSafePublicFetchUrlResolved(ref.publicUrl, ref.backend);
    return false;
  } catch (err) {
    res.status(400).json({
      error: 'unsafe_public_url',
      error_description: err instanceof Error ? err.message : 'publicUrl rejected',
    });
    return true;
  }
}
