/**
 * A Drive token Google has rejected must reach the client as 409, never 500.
 *
 * The device can recover from 409 by refreshing and retrying. Reported as 500 it
 * looks like a server fault, which is how an expired token stayed invisible while
 * the user was re-prompted for consent on every unlock.
 */

import {
  isGoogleCredentialRejection,
  isGoogleCredentialRejectionError,
  translateGoogleCredentialError
} from '../googleApiRetry';
import { DriveIndexError } from '../pnDriveIndex';
import { respondDriveTokenError } from '../ownerDriveToken';

function fakeRes() {
  const captured: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
      return this;
    }
  };
  return { res, captured };
}

describe('recognising a Google credential rejection', () => {
  it('treats any 401 as a rejected credential', () => {
    expect(isGoogleCredentialRejection(401, 'anything')).toBe(true);
  });

  it('treats an auth-flavoured 403 as a rejected credential', () => {
    expect(isGoogleCredentialRejection(403, '{"error":"invalid_credentials"}')).toBe(true);
  });

  it('does not mistake a quota 403 for a rejected credential', () => {
    // Refreshing the token would not help here, so reporting it as an expired
    // token would send the client into a pointless refresh loop.
    expect(
      isGoogleCredentialRejection(403, '{"reason":"rateLimitExceeded","message":"Quota exceeded"}')
    ).toBe(false);
  });

  it('recognises the googleapis client error shape', () => {
    expect(isGoogleCredentialRejectionError({ code: 401, message: 'Invalid Credentials' })).toBe(
      true
    );
    expect(
      isGoogleCredentialRejectionError({ response: { status: 401 }, message: 'Unauthorized' })
    ).toBe(true);
  });

  it('leaves unrelated failures alone', () => {
    const err = new Error('socket hang up');
    expect(isGoogleCredentialRejectionError(err)).toBe(false);
    expect(translateGoogleCredentialError(err)).toBe(err);
  });
});

describe('mapping to an HTTP response', () => {
  it('turns a credential rejection into 409 cloud_token_expired', () => {
    const translated = translateGoogleCredentialError({
      code: 401,
      message: 'Invalid Credentials'
    });
    expect(translated).toBeInstanceOf(DriveIndexError);
    expect((translated as DriveIndexError).code).toBe('CLOUD_TOKEN_EXPIRED');

    const { res, captured } = fakeRes();
    expect(respondDriveTokenError(res as never, translated)).toBe(true);
    expect(captured.status).toBe(409);
    expect((captured.body as { error: string }).error).toBe('cloud_token_expired');
  });

  it('still maps a missing token to 409 cloud_token_required', () => {
    const { res, captured } = fakeRes();
    const err = new DriveIndexError('no token forwarded', 'CLOUD_TOKEN_REQUIRED');
    expect(respondDriveTokenError(res as never, err)).toBe(true);
    expect(captured.status).toBe(409);
    expect((captured.body as { error: string }).error).toBe('cloud_token_required');
  });

  it('does not claim unrelated errors, so they still surface as 500', () => {
    const { res, captured } = fakeRes();
    expect(respondDriveTokenError(res as never, new Error('boom'))).toBe(false);
    expect(captured.status).toBeUndefined();
  });
});
