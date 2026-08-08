/**
 * Single source of truth for owner Google Drive access tokens under device cloud custody.
 * Prefer X-PN-Cloud-Access-Token; fall back to server-held secrets when present; else CLOUD_TOKEN_REQUIRED.
 */

import type { Request, Response } from 'express';
import { extractCloudAccessToken } from './cloudAccessToken';
import type { GoogleDriveToken } from './googleOAuth2Helper';
import { DriveIndexError } from './pnDriveIndex';
import { requireOwnerDriveContext, type OwnerDriveContext } from './ownerDriveContext';

export type ResolvedOwnerDriveToken = {
  token: GoogleDriveToken;
  accountId: string | undefined;
};

type AccountLike = {
  access_token?: string;
  accessToken?: string;
  refresh_token?: string;
  refreshToken?: string;
  expires_at?: number;
  expires_in?: number;
  backendId?: string;
  keyPrefix?: string;
  accountId?: string;
  id?: string;
} | null | undefined;

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
    accessToken = String(account?.access_token || account?.accessToken || '').trim();
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
      expires_at: account?.expires_at,
      expires_in: account?.expires_in
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
