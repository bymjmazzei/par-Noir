/**
 * Owner custody for one approved hour: decrypt the owner from the vault, prove the unlock to
 * the API with ML-DSA, unseal the cloud vault and load the Drive index. Read-only: a missing
 * Drive layout is an error here, never something Unlock creates for an agent.
 */

import {
  clearSessionCloudCredentials,
  getSessionDriveIndex,
  hydrateCloudCredentialsFromVault,
  resolveFreshDriveToken,
  type DeviceDriveLayout,
} from '@par-noir/device-cloud-credentials';
import { PEN_APP_CLIENT_ID } from '@par-noir/standard-data-points';
import {
  decryptIdentityFileLocal,
  extractMlDsaSecretKeyB64,
  parseIdentityFileJson,
} from '../consentUnlock/decryptIdentityLocal';
import { mintAccessTokenWithUnlockProof } from '../oauthUnlockProofMint';
import { AgentCustodyError } from './errors';

/** First-party read client the owner token is minted for; reads only the owner's own cloud. */
const OWNER_READ_CLIENT_ID = PEN_APP_CLIENT_ID;
const OWNER_READ_REDIRECT_URI = 'https://pen.parnoir.com/oauth-callback.html';
const OWNER_READ_SCOPE = ['openid', 'cloud:read'];

export type OwnerVaultEntry = {
  identityId: string;
  publicKey: string;
  key1: string;
  key2: string;
  encryptedIdentityJson?: string;
};

export type OwnerCustody = {
  ownerPnIdentifier: string;
  /** Private-file packages are keyed from the owner's DID and public key. */
  fileOwner: { id: string; publicKey: string };
  mlKemSecretKey: string;
  credentials: unknown;
  layout: DeviceDriveLayout;
};

async function readStoredLayout(apiEndpoint: string, ownerToken: string, pn: string): Promise<DeviceDriveLayout | null> {
  const res = await fetch(`${apiEndpoint}/api/storage/credentials/${encodeURIComponent(pn)}`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { credentials?: { pnDriveIndex?: DeviceDriveLayout } } | null;
  return body?.credentials?.pnDriveIndex ?? null;
}

export async function openOwnerCustody(opts: { apiEndpoint: string; owner: OwnerVaultEntry }): Promise<OwnerCustody> {
  const apiEndpoint = opts.apiEndpoint.replace(/\/$/, '');
  const { owner } = opts;

  let mlDsaSecretKeyB64: string | null = null;
  let mlKemSecretKey: string | null = null;
  let publicKey = owner.publicKey;
  let did = owner.identityId;
  try {
    const row = parseIdentityFileJson(JSON.parse(owner.encryptedIdentityJson || ''));
    const unlocked = await decryptIdentityFileLocal(row, owner.key1, owner.key2);
    publicKey = unlocked.publicKey;
    did = unlocked.did;
    mlDsaSecretKeyB64 = extractMlDsaSecretKeyB64(unlocked.decryptedIdentity);
    const d = unlocked.decryptedIdentity;
    mlKemSecretKey = d.pqcSecrets?.mlKemSecretKey || d.mlKemSecretKey || null;
  } catch {
    throw new AgentCustodyError('unavailable');
  }
  if (!mlDsaSecretKeyB64 || !mlKemSecretKey) throw new AgentCustodyError('unavailable');

  let ownerToken: string;
  let ownerPnIdentifier: string;
  try {
    const minted = await mintAccessTokenWithUnlockProof({
      apiEndpoint,
      clientId: OWNER_READ_CLIENT_ID,
      redirectUri: OWNER_READ_REDIRECT_URI,
      publicKey,
      mlDsaSecretKeyB64,
      scope: OWNER_READ_SCOPE,
    });
    ownerToken = minted.accessToken;
    ownerPnIdentifier = minted.pnIdentifier;
  } catch {
    throw new AgentCustodyError('unavailable');
  }

  const hydrated = await hydrateCloudCredentialsFromVault({
    apiEndpoint,
    authToken: ownerToken,
    pnIdentifier: ownerPnIdentifier,
    mlKemSecretKey,
  });
  if (hydrated.status !== 'ready') throw new AgentCustodyError('unavailable');

  const layout =
    getSessionDriveIndex(ownerPnIdentifier) ??
    (await readStoredLayout(apiEndpoint, ownerToken, ownerPnIdentifier).catch(() => null));
  if (!layout?.pnFolderId) {
    clearSessionCloudCredentials(ownerPnIdentifier);
    throw new AgentCustodyError('unavailable');
  }

  return {
    ownerPnIdentifier,
    fileOwner: { id: did, publicKey },
    mlKemSecretKey,
    credentials: hydrated.credentials,
    layout,
  };
}

/** Fresh Drive token from the unsealed envelope, refreshing through the one shared resolver. */
export async function ownerDriveToken(custody: OwnerCustody, apiEndpoint: string): Promise<string> {
  const resolved = await resolveFreshDriveToken({
    envelope: custody.credentials,
    apiEndpoint,
    path: 'agent-custody',
  });
  if (!resolved.token) throw new AgentCustodyError('unavailable');
  return resolved.token;
}

export function wipeOwnerCustody(custody: OwnerCustody): void {
  clearSessionCloudCredentials(custody.ownerPnIdentifier);
  const mutable = custody as { mlKemSecretKey: string; credentials: unknown };
  mutable.mlKemSecretKey = '';
  mutable.credentials = null;
}
