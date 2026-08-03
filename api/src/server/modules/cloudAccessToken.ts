import type { Request } from 'express';

/** Ephemeral Google (or other) access token forwarded by a device under cloud custody. Never logged. */
export const PN_CLOUD_ACCESS_TOKEN_HEADER = 'x-pn-cloud-access-token';

export function extractCloudAccessToken(req: Request | undefined | null): string | undefined {
  if (!req) return undefined;
  const raw = req.headers[PN_CLOUD_ACCESS_TOKEN_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
