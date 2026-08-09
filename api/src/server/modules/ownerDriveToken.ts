/**
 * Single source of truth for owner Google Drive access tokens under device cloud custody.
 * Prefer X-PN-Cloud-Access-Token; fall back to server-held secrets when present; else CLOUD_TOKEN_REQUIRED.
 */

import type { Request, Response } from 'express';
import { extractCloudAccessToken } from './cloudAccessToken';
import type { GoogleDriveToken } from './googleOAuth2Helper';
import { DriveIndexError } from './pnDriveIndex';
import { requireOwnerDriveContext, type OwnerDriveContext } from './ownerDriveContext';
import { hashIdentifier, safeLogger } from '../../utils/logger';

export type ResolvedOwnerDriveToken = {
  token: GoogleDriveToken;
  accountId: string | undefined;
};

type AccountLike = {
  access_token?: string;
  accessToken?: string;
  refresh_token?: string;
  refreshToken?: string;
  /** Absolute ms epoch. A stored account carries no relative lifetime by design. */
  expires_at?: number;
  backendId?: string;
  keyPrefix?: string;
  accountId?: string;
  id?: string;
} | null | undefined;

/** Skew matching the device-side resolver, so both sides agree on "fresh". */
const TOKEN_SKEW_MS = 60_000;

/**
 * A stored access token is only usable while we can prove it is still live.
 *
 * The copy on the credentials record was captured when Drive was connected and
 * Google kills it about an hour later. Using it because a request arrived
 * without the forwarded header means guaranteed 401s from Google, reported to
 * the user as an unexplained failure.
 */
function storedTokenStillLive(account: AccountLike): boolean {
  const expiresAt = account?.expires_at;
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return false;
  const absolute = expiresAt < 1e12 ? expiresAt * 1000 : expiresAt;
  return absolute - TOKEN_SKEW_MS > Date.now();
}

function accountIdFrom(account: AccountLike, fallback?: string): string | undefined {
  if (fallback) return fallback;
  if (!account) return undefined;
  return account.backendId || account.keyPrefix || account.accountId || account.id;
}

/**
 * Resolve a usable GoogleDriveToken for the calling owner.
 * 1) Forwarded X-PN-Cloud-Access-Token
 * 2) Non-empty shell access token (legacy / non-custody)
 * 3) googleDriveProxyService.getAccessToken when server still holds refresh secrets
 * 4) throws DriveIndexError CLOUD_TOKEN_REQUIRED
 */
export async function resolveOwnerDriveToken(
  req: Request,
  pnIdentifier: string,
  opts?: {
    accountId?: string;
    account?: AccountLike;
  }
): Promise<ResolvedOwnerDriveToken> {
  const account = opts?.account;
  const accountId = accountIdFrom(account, opts?.accountId);

  let accessToken = extractCloudAccessToken(req) || '';
  if (!accessToken) {
    const stored = String(account?.access_token || account?.accessToken || '').trim();
    if (stored && storedTokenStillLive(account)) {
      accessToken = stored;
    } else if (stored) {
      safeLogger.warn('[DriveToken] Ignoring stored access token that cannot be proven live', {
        reason: account?.expires_at ? 'stored_token_expired' : 'stored_token_expiry_unknown',
        pnIdHash: hashIdentifier(pnIdentifier)
      });
    }
  }
  if (!accessToken) {
    try {
      const { googleDriveProxyService } = await import('./googleDriveProxy');
      accessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId, [
        pnIdentifier
      ]);
    } catch {
      throw new DriveIndexError(
        'Google Drive access token required. Forward X-PN-Cloud-Access-Token after unlocking with cloud credentials.',
        'CLOUD_TOKEN_REQUIRED'
      );
    }
  }
  if (!accessToken?.trim()) {
    throw new DriveIndexError(
      'Google Drive access token required. Forward X-PN-Cloud-Access-Token after unlocking with cloud credentials.',
      'CLOUD_TOKEN_REQUIRED'
    );
  }

  return {
    token: {
      access_token: accessToken.trim(),
      refresh_token: account?.refresh_token || account?.refreshToken,
      expires_at: account?.expires_at
    },
    accountId
  };
}

/** requireOwnerDriveContext with cloud token extracted from the request. */
export async function requireOwnerDriveContextFromReq(
  req: Request,
  pnIdentifier: string,
  accountId?: string
): Promise<OwnerDriveContext> {
  return requireOwnerDriveContext(pnIdentifier, accountId, {
    accessToken: extractCloudAccessToken(req)
  });
}

/** Map DriveIndexError / CLOUD_TOKEN_REQUIRED to HTTP response. Returns true if handled. */
export function respondDriveTokenError(res: Response, error: unknown): boolean {
  if (error instanceof DriveIndexError) {
    if (error.code === 'CLOUD_TOKEN_REQUIRED') {
      res.status(409).json({
        error: 'cloud_token_required',
        error_description: error.message
      });
      return true;
    }
    if (error.code === 'CLOUD_TOKEN_EXPIRED') {
      // The device forwarded a token Google no longer accepts. Recoverable:
      // refresh and retry. Reported as 409 rather than 500 so the client can
      // tell "your token aged out" from "the server is broken".
      res.status(409).json({
        error: 'cloud_token_expired',
        error_description:
          'Google rejected the forwarded Drive access token. Refresh it and retry.'
      });
      return true;
    }
    if (
      error.code === 'DRIVE_NOT_INITIALIZED' ||
      error.code === 'DRIVE_INDEX_INCOMPLETE' ||
      error.code === 'DRIVE_LAYOUT_INCOMPLETE' ||
      error.code === 'DRIVE_INDEX_STALE'
    ) {
      res.status(409).json({
        error: 'drive_not_initialized',
        error_description: error.message
      });
      return true;
    }
  }
  const msg = error instanceof Error ? error.message : String(error || '');
  if (/cloud_token_required|CLOUD_TOKEN_REQUIRED|X-PN-Cloud-Access-Token|access token required/i.test(msg)) {
    res.status(409).json({
      error: 'cloud_token_required',
      error_description: msg || 'Google Drive access token required'
    });
    return true;
  }
  return false;
}

export { DriveIndexError, extractCloudAccessToken };
