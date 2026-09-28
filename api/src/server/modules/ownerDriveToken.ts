/**
 * Single source of truth for owner Google Drive access tokens.
 * X-PN-Cloud-Access-Token only. A missing forwarded token throws CLOUD_TOKEN_REQUIRED.
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

function accountIdFrom(account: AccountLike, fallback?: string): string | undefined {
  if (fallback) return fallback;
  if (!account) return undefined;
  return account.backendId || account.keyPrefix || account.accountId || account.id;
}

function throwCloudTokenRequired(pnIdentifier: string, reason: string): never {
  safeLogger.warn('[DriveToken] Cloud access token required', {
    reason,
    pnIdHash: hashIdentifier(pnIdentifier),
  });
  throw new DriveIndexError(
    'Google Drive access token required. Forward X-PN-Cloud-Access-Token after unlocking with cloud credentials.',
    'CLOUD_TOKEN_REQUIRED'
  );
}

/**
 * Resolve a usable GoogleDriveToken for the calling owner.
 * Forwarded X-PN-Cloud-Access-Token only. The custody flag does not change this.
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
  const accessToken = (extractCloudAccessToken(req) || '').trim();
  if (!accessToken) {
    throwCloudTokenRequired(pnIdentifier, 'cloud_token_required');
  }
  return {
    token: {
      access_token: accessToken,
    },
    accountId,
  };
}

/** requireOwnerDriveContext with cloud token extracted from the request. */
export async function requireOwnerDriveContextFromReq(
  req: Request,
  pnIdentifier: string,
  accountId?: string
): Promise<OwnerDriveContext> {
  return requireOwnerDriveContext(pnIdentifier, accountId, {
    accessToken: extractCloudAccessToken(req),
  });
}

/** Map DriveIndexError / CLOUD_TOKEN_REQUIRED to HTTP response. Returns true if handled. */
export function respondDriveTokenError(res: Response, error: unknown): boolean {
  if (error instanceof DriveIndexError) {
    if (error.code === 'CLOUD_TOKEN_REQUIRED') {
      res.status(409).json({
        error: 'cloud_token_required',
        error_description: error.message,
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
          'Google rejected the forwarded Drive access token. Refresh it and retry.',
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
        error_description: error.message,
      });
      return true;
    }
  }
  const msg = error instanceof Error ? error.message : String(error || '');
  if (/cloud_token_required|CLOUD_TOKEN_REQUIRED|X-PN-Cloud-Access-Token|access token required/i.test(msg)) {
    res.status(409).json({
      error: 'cloud_token_required',
      error_description: msg || 'Google Drive access token required',
    });
    return true;
  }
  return false;
}

export { DriveIndexError, extractCloudAccessToken };
