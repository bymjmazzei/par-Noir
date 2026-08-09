/**
 * Single guard for public aggregator rows: isPublic true requires both
 * publicToken and a usable publicContentRef. Used by POST/PUT metadata routes
 * and every non-route writer that can set isPublic.
 */

import {
  isPublicContentRef,
  publicTokenContainsEmbeddedCiphertext,
} from '@par-noir/aggregator-domain';

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
