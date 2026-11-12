/**
 * Handle registry API client (dashboard): claims, proofs, rename, move, transfer, receipts.
 */

import { ensureDriveChildFolder, upsertDriveChildFile } from '@par-noir/device-cloud-credentials';
import { bytesToBase64, base64ToBytes } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Sign } from '@par-noir/pqc-crypto/ml-dsa';
import {
  buildHandleSigningKeyStatement,
  buildHandleTransferStatement,
  canonicalHandleSigningKeyBytes,
  canonicalHandleTransferBytes
} from '@par-noir/standard-data-points';
import { ownerFetch, ownerGet } from './ownerApiService';
import { sessionDriveFor } from './sessionDrive';
import { readShellSigningKeys } from './shellKeys';

export type HandleProofType = 'claim' | 'dns' | 'youtube';
export type PublicNameStatus =
  | 'pending'
  | 'proven'
  | 'listed'
  | 'revoked'
  | 'superseded'
  | 'disputed'
  | 'expired'
  | 'released';

export interface PublicNameDto {
  publicName: string;
  pnIdentifier: string;
  proofType: HandleProofType;
  proofSubject: string;
  status: PublicNameStatus;
  isVanity: boolean;
  feedId: string | null;
  strength: number;
  priorityAt: string | null;
  releasedUntil: string | null;
  listedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type HandleNoticeDto =
  | { kind: 'superseded'; handle: string; fallback: string | null }
  | { kind: 'disputed'; handle: string }
  | { kind: 'expiring'; handle: string; expiresAt: string }
  | { kind: 'expired'; handle: string }
  | { kind: 'transfer_incoming'; transferId: string; handle: string };

export interface PendingTransferDto {
  id: string;
  publicName: string;
  direction: 'incoming' | 'outgoing';
  createdAt: string;
}

export interface MyPublicNames {
  names: PublicNameDto[];
  notices: HandleNoticeDto[];
  transfers: PendingTransferDto[];
}

export interface ProtectedNameDetails {
  display?: string;
  source?: string;
  requiredDomains?: string[];
  requiredYoutubeChannelIds?: string[];
}

export interface HandleAvailability {
  name: string;
  available: boolean;
  reason?: 'invalid' | 'taken' | 'yours' | 'protected' | 'released';
  protected?: ProtectedNameDetails;
}

export interface OwnFeedDto {
  feedId: string;
  feedName: string;
  tier: 'personal' | 'feed';
}

export interface ReproofChallengeDto {
  proofType: 'dns' | 'youtube';
  token?: string;
  dnsName?: string;
  wellKnownUrl?: string;
}

/** API error with the registry's code (e.g. name_protected) and any details. */
export class PublicNameApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PublicNameApiError';
  }
}

async function apiError(res: Response): Promise<PublicNameApiError> {
  const j = (await res.json().catch(() => ({}))) as {
    error?: string;
    error_description?: string;
    details?: Record<string, unknown>;
  };
  return new PublicNameApiError(j.error_description || j.error || res.statusText, j.error || '', j.details);
}

async function send<T>(
  accessToken: string,
  pnIdentifier: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res =
    method === 'GET'
      ? await ownerGet(accessToken, path, { pnIdentifier })
      : await ownerFetch(accessToken, method, path, body, { pnIdentifier });
  if (!res.ok) throw await apiError(res);
  return (await res.json()) as T;
}

const enc = encodeURIComponent;

export async function fetchMyPublicNames(accessToken: string, pnIdentifier: string): Promise<MyPublicNames> {
  const data = await send<Partial<MyPublicNames>>(accessToken, pnIdentifier, 'GET', '/api/public-names/mine');
  return { names: data.names || [], notices: data.notices || [], transfers: data.transfers || [] };
}

/** Feeds this pN can put a handle on; the personal feed first. */
export async function fetchMyFeeds(accessToken: string, pnIdentifier: string): Promise<OwnFeedDto[]> {
  const data = await send<{ feedTokens?: Array<{ feedId: string; feedName?: string; tier?: string }> }>(
    accessToken,
    pnIdentifier,
    'GET',
    '/api/feeds/tokens'
  );
  return (data.feedTokens || [])
    .map((f) => ({
      feedId: f.feedId,
      feedName: f.feedName || (f.tier === 'personal' ? 'Personal feed' : 'Feed'),
      tier: f.tier === 'personal' ? ('personal' as const) : ('feed' as const)
    }))
    .sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'personal' ? -1 : 1));
}

export function checkHandleAvailability(
  accessToken: string,
  pnIdentifier: string,
  name: string
): Promise<HandleAvailability> {
  return send(accessToken, pnIdentifier, 'GET', `/api/public-names/available/${enc(name)}`);
}

const registeredSigningKeys = new Set<string>();

/**
 * Handle receipts name the key that signs this pN's content. The root key from this unlock
 * registers itself once; claims, proofs and accepted transfers need it.
 */
export async function ensureHandleSigningKey(accessToken: string, pnIdentifier: string): Promise<void> {
  if (registeredSigningKeys.has(pnIdentifier)) return;
  const keys = readShellSigningKeys(pnIdentifier);
  if (!keys) throw new Error('Unlock again in par Noir Unlock to sign for your handle.');
  const current = await send<{ signingKey: string | null }>(
    accessToken,
    pnIdentifier,
    'GET',
    '/api/public-names/signing-key'
  );
  if (current.signingKey !== keys.mlDsaPublicKey) {
    const statement = buildHandleSigningKeyStatement({
      pnIdentifier,
      signingKey: keys.mlDsaPublicKey,
      nonce: transferNonce()
    });
    const rootSignature = bytesToBase64(
      mlDsa65Sign(canonicalHandleSigningKeyBytes(statement), base64ToBytes(keys.mlDsaSecretKey))
    );
    await send(accessToken, pnIdentifier, 'PUT', '/api/public-names/signing-key', {
      statement,
      rootPublicKey: keys.mlDsaPublicKey,
      rootSignature
    });
  }
  registeredSigningKeys.add(pnIdentifier);
}

export async function claimHandle(
  accessToken: string,
  pnIdentifier: string,
  name: string,
  feedId: string | null
): Promise<PublicNameDto> {
  await ensureHandleSigningKey(accessToken, pnIdentifier);
  const data = await send<{ name: PublicNameDto }>(accessToken, pnIdentifier, 'POST', '/api/public-names/claim', {
    name,
    ...(feedId ? { feedId } : {})
  });
  return data.name;
}

export async function startDnsVerification(
  accessToken: string,
  pnIdentifier: string,
  domain: string
): Promise<{
  token: string;
  domain: string;
  dnsName: string;
  wellKnownUrl: string;
  candidateName: string;
}> {
  return send(accessToken, pnIdentifier, 'POST', '/api/public-names/dns/start', { domain });
}

export async function verifyDns(accessToken: string, pnIdentifier: string, domain: string): Promise<PublicNameDto> {
  await ensureHandleSigningKey(accessToken, pnIdentifier);
  const data = await send<{ name: PublicNameDto }>(accessToken, pnIdentifier, 'POST', '/api/public-names/dns/verify', {
    domain
  });
  return data.name;
}

export async function completeYoutube(
  accessToken: string,
  pnIdentifier: string,
  googleAccessToken: string
): Promise<PublicNameDto> {
  await ensureHandleSigningKey(accessToken, pnIdentifier);
  const data = await send<{ name: PublicNameDto }>(
    accessToken,
    pnIdentifier,
    'POST',
    '/api/public-names/youtube/complete',
    { googleAccessToken }
  );
  return data.name;
}

/** List a proven name. `disputed` means a holder exists and a dispute was opened instead. */
export async function listPublicName(
  accessToken: string,
  pnIdentifier: string,
  name: string,
  feedId?: string | null
): Promise<{ name: PublicNameDto; disputed?: boolean }> {
  await ensureHandleSigningKey(accessToken, pnIdentifier);
  return send(accessToken, pnIdentifier, 'POST', `/api/public-names/${enc(name)}/list`, feedId ? { feedId } : {});
}

export async function unlistPublicName(
  accessToken: string,
  pnIdentifier: string,
  name: string
): Promise<PublicNameDto> {
  const data = await send<{ name: PublicNameDto }>(
    accessToken,
    pnIdentifier,
    'DELETE',
    `/api/public-names/${enc(name)}/list`
  );
  return data.name;
}

export async function renameHandle(
  accessToken: string,
  pnIdentifier: string,
  name: string,
  newName: string
): Promise<PublicNameDto> {
  const data = await send<{ name: PublicNameDto }>(
    accessToken,
    pnIdentifier,
    'POST',
    `/api/public-names/${enc(name)}/rename`,
    { newName }
  );
  return data.name;
}

export async function moveHandle(
  accessToken: string,
  pnIdentifier: string,
  name: string,
  feedId: string
): Promise<PublicNameDto> {
  const data = await send<{ name: PublicNameDto }>(
    accessToken,
    pnIdentifier,
    'PUT',
    `/api/public-names/${enc(name)}/feed`,
    { feedId }
  );
  return data.name;
}

function transferNonce(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The root key from this unlock signs the transfer; the recipient still has to accept. */
export async function sendHandle(
  accessToken: string,
  pnIdentifier: string,
  name: string,
  toPnIdentifier: string
): Promise<{ id: string; publicName: string }> {
  const keys = readShellSigningKeys(pnIdentifier);
  if (!keys) throw new Error('Unlock again in par Noir Unlock to sign this transfer.');
  const to = toPnIdentifier.trim();
  const statement = buildHandleTransferStatement({
    name,
    rootPublicKey: keys.mlDsaPublicKey,
    toPnIdentifier: to.startsWith('pn-') ? to : `pn-${to}`,
    nonce: transferNonce()
  });
  const signature = bytesToBase64(
    mlDsa65Sign(canonicalHandleTransferBytes(statement), base64ToBytes(keys.mlDsaSecretKey))
  );
  return send(accessToken, pnIdentifier, 'POST', '/api/public-names/transfers', { statement, signature });
}

export async function acceptHandleTransfer(
  accessToken: string,
  pnIdentifier: string,
  transferId: string,
  opts: { feedId?: string | null; googleAccessToken?: string | null } = {}
): Promise<
  | { status: 'completed'; name: PublicNameDto }
  | { status: 'reproof_required'; challenge: ReproofChallengeDto }
> {
  await ensureHandleSigningKey(accessToken, pnIdentifier);
  return send(accessToken, pnIdentifier, 'POST', `/api/public-names/transfers/${enc(transferId)}/accept`, {
    ...(opts.feedId ? { feedId: opts.feedId } : {}),
    ...(opts.googleAccessToken ? { googleAccessToken: opts.googleAccessToken } : {})
  });
}

export async function cancelHandleTransfer(
  accessToken: string,
  pnIdentifier: string,
  transferId: string
): Promise<void> {
  await send(accessToken, pnIdentifier, 'DELETE', `/api/public-names/transfers/${enc(transferId)}`);
}

export async function setVanityPublicName(
  accessToken: string,
  pnIdentifier: string,
  name: string
): Promise<PublicNameDto> {
  const data = await send<{ name: PublicNameDto }>(
    accessToken,
    pnIdentifier,
    'POST',
    `/api/public-names/${enc(name)}/vanity`,
    {}
  );
  return data.name;
}

export async function clearVanityPublicName(accessToken: string, pnIdentifier: string): Promise<void> {
  await send(accessToken, pnIdentifier, 'DELETE', '/api/public-names/vanity');
}

/**
 * Copy each handle's registry-signed receipt chain to the pN folder under `names/`.
 * The device writes Drive; the API never does.
 */
export async function syncHandleReceiptsToDrive(accessToken: string, pnIdentifier: string): Promise<void> {
  const data = await send<{
    registryPublicKey: string | null;
    handles?: Array<{ handle: string; chain: unknown[] }>;
  }>(accessToken, pnIdentifier, 'GET', '/api/public-names/receipts/mine');
  const handles = (data.handles || []).filter((h) => h.chain.length > 0);
  if (!handles.length) return;
  const drive = await sessionDriveFor(pnIdentifier, accessToken);
  const folderId = await ensureDriveChildFolder(drive.accessToken, drive.index.pnFolderId, 'names');
  for (const h of handles) {
    await upsertDriveChildFile(
      drive.accessToken,
      folderId,
      `${h.handle}.json`,
      JSON.stringify({ handle: h.handle, registryPublicKey: data.registryPublicKey, chain: h.chain }, null, 2)
    );
  }
}

/** Short label for a handle's proof level. */
export function proofLevelLabel(proofType: HandleProofType): string {
  if (proofType === 'dns') return 'Domain';
  if (proofType === 'youtube') return 'YouTube';
  return 'Claimed';
}

/** Browse app origin for vanity URL display. */
export function browseAppOrigin(): string {
  const fromEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env
    ?.VITE_BROWSER_ORIGIN;
  if (fromEnv && fromEnv.trim()) return fromEnv.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.hostname.includes('localhost')) {
    return 'http://localhost:5174';
  }
  return 'https://browse.parnoir.com';
}

/** Messaging app origin for universal connect links and optional vanity profile URLs. */
export function messagingAppOrigin(): string {
  const fromEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env
    ?.VITE_MESSAGING_ORIGIN;
  if (fromEnv && fromEnv.trim()) return fromEnv.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.hostname.includes('localhost')) {
    return 'http://localhost:5175';
  }
  return 'https://messaging.parnoir.com';
}
