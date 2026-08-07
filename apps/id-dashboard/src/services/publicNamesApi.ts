/**
 * Public name directory API client (dashboard).
 */

import { ownerFetch, ownerGet } from './ownerApiService';

export interface PublicNameDto {
  publicName: string;
  pnIdentifier: string;
  proofType: 'dns' | 'youtube';
  proofSubject: string;
  status: 'pending' | 'proven' | 'listed' | 'revoked';
  isVanity: boolean;
  listedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

async function parseError(res: Response): Promise<string> {
  const j = await res.json().catch(() => ({}));
  return (
    (j as { error_description?: string }).error_description ||
    (j as { error?: string }).error ||
    res.statusText
  );
}

export async function fetchMyPublicNames(
  accessToken: string,
  pnIdentifier: string
): Promise<PublicNameDto[]> {
  const res = await ownerGet(accessToken, '/api/public-names/mine', { pnIdentifier });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { names: PublicNameDto[] };
  return data.names || [];
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
  const res = await ownerFetch(accessToken, 'POST', '/api/public-names/dns/start', { domain }, {
    pnIdentifier,
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function verifyDns(
  accessToken: string,
  pnIdentifier: string,
  domain: string
): Promise<PublicNameDto> {
  const res = await ownerFetch(accessToken, 'POST', '/api/public-names/dns/verify', { domain }, {
    pnIdentifier,
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { name: PublicNameDto };
  return data.name;
}

export async function completeYoutube(
  accessToken: string,
  pnIdentifier: string,
  googleAccessToken: string
): Promise<PublicNameDto> {
  const res = await ownerFetch(
    accessToken,
    'POST',
    '/api/public-names/youtube/complete',
    { googleAccessToken },
    { pnIdentifier }
  );
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { name: PublicNameDto };
  return data.name;
}

export async function listPublicName(
  accessToken: string,
  pnIdentifier: string,
  name: string
): Promise<PublicNameDto> {
  const res = await ownerFetch(
    accessToken,
    'POST',
    `/api/public-names/${encodeURIComponent(name)}/list`,
    {},
    { pnIdentifier }
  );
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { name: PublicNameDto };
  return data.name;
}

export async function unlistPublicName(
  accessToken: string,
  pnIdentifier: string,
  name: string
): Promise<PublicNameDto> {
  const res = await ownerFetch(
    accessToken,
    'DELETE',
    `/api/public-names/${encodeURIComponent(name)}/list`,
    undefined,
    { pnIdentifier }
  );
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { name: PublicNameDto };
  return data.name;
}

export async function setVanityPublicName(
  accessToken: string,
  pnIdentifier: string,
  name: string
): Promise<PublicNameDto> {
  const res = await ownerFetch(
    accessToken,
    'POST',
    `/api/public-names/${encodeURIComponent(name)}/vanity`,
    {},
    { pnIdentifier }
  );
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { name: PublicNameDto };
  return data.name;
}

export async function clearVanityPublicName(
  accessToken: string,
  pnIdentifier: string
): Promise<void> {
  const res = await ownerFetch(accessToken, 'DELETE', '/api/public-names/vanity', undefined, {
    pnIdentifier,
  });
  if (!res.ok) throw new Error(await parseError(res));
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
