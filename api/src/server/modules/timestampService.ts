/**
 * RFC 3161 timestamps from the TSA in C2PA_TSA_URL (default DigiCert). Only a SHA-256 imprint is
 * sent; the token comes back unchanged so anyone can check it against the TSA's certificate.
 */

import { randomBytes } from 'crypto';
import { buildTimeStampRequest, parseTimeStampResponse, parseTimeStampToken } from '@par-noir/pen-protocol';

const DEFAULT_TSA_URL = 'http://timestamp.digicert.com';
const TSA_TIMEOUT_MS = 10_000;

export function tsaUrl(): string {
  return String(process.env.C2PA_TSA_URL || '').trim() || DEFAULT_TSA_URL;
}

export class TimestampError extends Error {
  constructor(readonly code: 'tsa_unreachable' | 'tsa_rejected' | 'tsa_mismatch') {
    super(code);
  }
}

/** DER TimeStampToken over `imprint` (32-byte SHA-256), checked for imprint and nonce. */
export async function stampImprint(
  imprint: Uint8Array,
  fetchImpl: typeof fetch = fetch
): Promise<{ token: Uint8Array; genTime: string }> {
  const nonce = new Uint8Array(randomBytes(8));
  const body = buildTimeStampRequest(imprint, nonce);
  let res: Response;
  try {
    res = await fetchImpl(tsaUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/timestamp-query' },
      body: Buffer.from(body),
      signal: AbortSignal.timeout(TSA_TIMEOUT_MS)
    });
  } catch {
    throw new TimestampError('tsa_unreachable');
  }
  if (!res.ok) throw new TimestampError('tsa_unreachable');
  let token: Uint8Array;
  let info: ReturnType<typeof parseTimeStampToken>;
  try {
    const reply = parseTimeStampResponse(new Uint8Array(await res.arrayBuffer()));
    if ((reply.status !== 0 && reply.status !== 1) || !reply.token) throw new Error('rejected');
    token = reply.token;
    info = parseTimeStampToken(token);
  } catch {
    throw new TimestampError('tsa_rejected');
  }
  const nonceHex = Buffer.from(nonce).toString('hex').replace(/^0+/, '');
  if (
    info.imprintHex !== Buffer.from(imprint).toString('hex') ||
    (info.nonceHex ?? '').replace(/^0+/, '') !== nonceHex
  ) {
    throw new TimestampError('tsa_mismatch');
  }
  return { token, genTime: info.genTime };
}
