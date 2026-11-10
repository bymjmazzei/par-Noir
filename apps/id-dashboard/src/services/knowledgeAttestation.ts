/**
 * Attestations as Pen Knowledge claim docs: the form maps to a knowledge.claim template, every
 * claim gets an ML-DSA-bound ZK envelope, and the doc is signed and sealed exactly like Pen.
 */

import {
  grantedDataPointIds,
  heldProofsFor,
  listDeviceKnowledgeClaims,
  readKnowledgeClaimSource,
  writeKnowledgeClaimDoc,
  type DeviceKnowledgeClaim,
} from '@par-noir/device-cloud-credentials';
import { KNOWLEDGE_CLAIM_TEMPLATE_IDS, requireTemplate, type PenTemplate } from '@par-noir/pen-protocol';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import type { EncryptedIdentity } from '../types/crypto';
import { STANDARD_DATA_POINTS } from '../types/StandardDataPointsRegistry';
import { ZKPGenerator } from '../utils/ZKPGenerator';
import { loadMlDsaKeypairForZk, type MlDsaKeypair } from '../utils/zkPqcSigning';
import { resolveIdentityMlKemSecret } from './resolveIdentityMlKem';
import { ownerFetch, ownerGet } from './ownerApiService';
import { sessionDriveFor } from './sessionDrive';
import { readShellMlKem } from './shellKeys';

export type VerificationLevel = 'basic' | 'enhanced' | 'verified';

export type AttestationKeys = {
  pnIdentifier: string;
  signing: MlDsaKeypair;
  mlKemSecretKey: string;
};

const ONE_YEAR_DAYS = 365;

function trimPart(s?: string): string {
  return (s || '').trim();
}

export function knowledgeTemplateFor(dataPointId: string): PenTemplate {
  if (dataPointId === 'name_attestation') return requireTemplate(KNOWLEDGE_CLAIM_TEMPLATE_IDS.name);
  if (dataPointId === 'age_attestation') return requireTemplate(KNOWLEDGE_CLAIM_TEMPLATE_IDS.age);
  return requireTemplate(KNOWLEDGE_CLAIM_TEMPLATE_IDS.single);
}

export function buildNameDerivedPayloads(fields: Record<string, string | undefined>): Record<string, Record<string, unknown>> {
  const prefix = trimPart(fields.prefix);
  const first = trimPart(fields.firstName);
  const middle = trimPart(fields.middleName);
  const last = trimPart(fields.lastName);
  const suffix = trimPart(fields.suffix);
  const nickname = trimPart(fields.nickname);
  const lastInitial = last ? `${last.charAt(0).toUpperCase()}.` : '';
  const out: Record<string, Record<string, unknown>> = {
    full_name: { fullName: [prefix, first, middle, last, suffix].filter(Boolean).join(' ') },
    first_last: { firstLast: [first, last].filter(Boolean).join(' ') },
    first_last_initial: { firstLastInitial: [first, lastInitial].filter(Boolean).join(' ') },
    first_name: { firstName: first },
    last_name: { lastName: last },
    identity_attestation: { firstName: first, middleName: middle, lastName: last },
  };
  if (middle) out.middle_name = { middleName: middle };
  if (suffix) out.suffix = { suffix };
  if (nickname) out.nickname = { nickname };
  return out;
}

export function ageFromDob(dateOfBirth: string): number {
  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age -= 1;
  return age;
}

export function buildAgeDerivedPayloads(dateOfBirth: string): Record<string, Record<string, unknown>> {
  const age = ageFromDob(dateOfBirth);
  return { over_18: { over18: age >= 18 }, over_21: { over21: age >= 21 } };
}

/** The raw answers kept in the sealed `source` section: only the template's input fields. */
export function knowledgeSourceFor(template: PenTemplate, userData: Record<string, unknown>): Record<string, string> {
  const fields = template.knowledgeForm?.inputFields.length
    ? template.knowledgeForm.inputFields
    : Object.keys(userData);
  const out: Record<string, string> = {};
  for (const field of fields) {
    const value = userData[field];
    if (value === undefined || value === null || typeof value === 'object') continue;
    out[field] = String(value);
  }
  return out;
}

/** Ordered (dataPointId, ZK payload) pairs for one form submission; the source data point leads. */
export function knowledgeClaimPayloads(
  template: PenTemplate,
  sourceDataPointId: string,
  userData: Record<string, unknown>
): Array<[string, Record<string, unknown>]> {
  const derived =
    template.id === KNOWLEDGE_CLAIM_TEMPLATE_IDS.name
      ? buildNameDerivedPayloads(userData as Record<string, string>)
      : template.id === KNOWLEDGE_CLAIM_TEMPLATE_IDS.age
        ? buildAgeDerivedPayloads(String(userData.dateOfBirth || ''))
        : {};
  const out: Array<[string, Record<string, unknown>]> = [[sourceDataPointId, knowledgeSourceFor(template, userData)]];
  for (const id of template.knowledgeForm?.derivedDataPointIds || []) {
    if (derived[id]) out.push([id, derived[id]]);
  }
  return out;
}

/**
 * Keys for attesting: the unlock app hands over both pairs; a key-file unlock decrypts them with
 * Key 1/Key 2 instead.
 */
export async function resolveAttestationKeys(opts: {
  identityId: string;
  publicKey?: string | null;
  encryptedIdentity?: EncryptedIdentity | null;
}): Promise<AttestationKeys> {
  const { deriveCanonicalPnIdentifier } = await import('@par-noir/pqc-crypto/oauth-unlock-proof');
  const publicKey = opts.publicKey || opts.encryptedIdentity?.publicKey || '';
  const pnIdentifier = deriveCanonicalPnIdentifier(publicKey);
  const ids = [opts.identityId, publicKey, pnIdentifier];
  const signing = await loadMlDsaKeypairForZk(opts.identityId, opts.encryptedIdentity, ids);
  let mlKemSecretKey = ids.map((id) => readShellMlKem(id)).find(Boolean) || null;
  if (!mlKemSecretKey) {
    const creds = SecureCredentialManager.getCredentials(opts.identityId);
    if (creds?.key1 && creds.key2) {
      mlKemSecretKey = await resolveIdentityMlKemSecret({
        identityId: opts.identityId,
        publicKey,
        key1: creds.key1,
        key2: creds.key2,
      });
    }
  }
  if (!mlKemSecretKey) throw new Error('Encryption key unavailable — unlock again with the unlock app.');
  return { pnIdentifier, signing, mlKemSecretKey };
}

async function knowledgeTarget(pnIdentifier: string, authToken: string) {
  const drive = await sessionDriveFor(pnIdentifier, authToken);
  const groupsSheetId = drive.index.sheetIds.groups;
  if (!drive.index.pnFolderId || !groupsSheetId) throw new Error('DRIVE_NOT_INITIALIZED');
  return { accessToken: drive.accessToken, pnFolderId: drive.index.pnFolderId, groupsSheetId };
}

/** Mint every claim the template defines for this form and write one Knowledge doc. */
export async function attestFromTemplate(params: {
  keys: AttestationKeys;
  authToken: string;
  dataPointId: string;
  userData: Record<string, unknown>;
  verificationLevel?: VerificationLevel;
  provider?: string;
  expirationDays?: number;
}): Promise<string[]> {
  const template = knowledgeTemplateFor(params.dataPointId);
  const level = params.verificationLevel || 'basic';
  const provider = params.provider || (level === 'verified' ? 'stripe_identity' : 'user_attested');
  const claims = [];
  for (const [dataPointId, payload] of knowledgeClaimPayloads(template, params.dataPointId, params.userData)) {
    const proof = await ZKPGenerator.generateZKP({
      dataPointId,
      userData: payload,
      verificationLevel: level,
      expirationDays: params.expirationDays ?? ONE_YEAR_DAYS,
      signingKeys: params.keys.signing,
    });
    claims.push({
      dataPointId,
      proofRef: proof.proof,
      proofType: proof.proofType,
      verificationLevel: level,
      provider,
      verifiedAt: proof.timestamp,
      expiresAt: proof.expiresAt,
    });
  }
  await writeKnowledgeClaimDoc({
    ...(await knowledgeTarget(params.keys.pnIdentifier, params.authToken)),
    ownerPnIdentifier: params.keys.pnIdentifier,
    template,
    sourceDataPointId: params.dataPointId,
    source: knowledgeSourceFor(template, params.userData),
    claims,
    signingKeys: { secretKey: params.keys.signing.mlDsaSecretKey, publicKey: params.keys.signing.mlDsaPublicKey },
    mlKemSecretKey: params.keys.mlKemSecretKey,
  });
  await releaseGrantedProofsQuietly(params.keys.pnIdentifier, params.authToken);
  return claims.map((c) => c.dataPointId);
}

type IssuedProof = {
  dataPointId: string;
  proofType: string;
  zkpProof: string;
  verificationLevel: VerificationLevel;
  provider: string;
  verifiedAt?: string;
  expiresAt?: string;
};

async function writeIssuedProof(
  target: Awaited<ReturnType<typeof knowledgeTarget>>,
  keys: AttestationKeys,
  proof: IssuedProof
): Promise<void> {
  await writeKnowledgeClaimDoc({
    ...target,
    ownerPnIdentifier: keys.pnIdentifier,
    template: requireTemplate(KNOWLEDGE_CLAIM_TEMPLATE_IDS.single),
    sourceDataPointId: proof.dataPointId,
    source: {},
    claims: [
      {
        dataPointId: proof.dataPointId,
        proofRef: proof.zkpProof,
        proofType: proof.proofType,
        verificationLevel: proof.verificationLevel,
        provider: proof.provider,
        verifiedAt: proof.verifiedAt || new Date().toISOString(),
        expiresAt: proof.expiresAt,
      },
    ],
    signingKeys: { secretKey: keys.signing.mlDsaSecretKey, publicKey: keys.signing.mlDsaPublicKey },
    mlKemSecretKey: keys.mlKemSecretKey,
  });
}

/** A proof minted elsewhere (ID verification document rows) stored as its own single-claim doc. */
export async function attestIssuedProof(
  params: IssuedProof & { keys: AttestationKeys; authToken: string }
): Promise<void> {
  const { keys, authToken, ...proof } = params;
  await writeIssuedProof(await knowledgeTarget(keys.pnIdentifier, authToken), keys, proof);
  await releaseGrantedProofsQuietly(keys.pnIdentifier, authToken);
}

/**
 * Hand the API the held proofs for every data point the user has granted, replacing
 * what it held before. The API never reads the cloud, so apps only see proofs this
 * device released.
 */
export async function releaseGrantedProofs(pnIdentifier: string, authToken: string): Promise<number> {
  const id = encodeURIComponent(pnIdentifier);
  const grantsRes = await ownerGet(authToken, `/api/users/${id}/third-party-permissions`, { pnIdentifier });
  if (!grantsRes.ok) throw new Error(`Reading grants failed (${grantsRes.status})`);
  const { permissions } = (await grantsRes.json()) as { permissions?: Record<string, { status?: string; dataPoints?: string[]; requiredDataPoints?: string[] }> };
  const granted = grantedDataPointIds(permissions);
  const proofs = granted.size
    ? await heldProofsFor({
        accessToken: (await sessionDriveFor(pnIdentifier, authToken)).accessToken,
        pnIdentifier,
        dataPointIds: granted,
      })
    : [];
  const res = await ownerFetch(authToken, 'PUT', `/api/users/${id}/released-proofs`, { proofs }, { pnIdentifier });
  if (!res.ok) throw new Error(`Releasing proofs failed (${res.status})`);
  return ((await res.json()) as { released?: number }).released ?? 0;
}

/** Attestation and grant changes must not fail on the release step; apps catch up on the next one. */
export async function releaseGrantedProofsQuietly(pnIdentifier: string, authToken: string): Promise<void> {
  try {
    await releaseGrantedProofs(pnIdentifier, authToken);
  } catch (error) {
    console.warn('[Knowledge] Could not release proofs to granted apps:', error instanceof Error ? error.message : error);
  }
}

/** The API-signed verification credential (JWT) is held as a single-claim doc under this id. */
export const VERIFICATION_CREDENTIAL_DATA_POINT = 'identity_verification_credential';
const CREDENTIAL_PROOF_TYPE = 'jwt';

export async function saveVerificationCredential(params: {
  keys: AttestationKeys;
  authToken: string;
  credential: string;
  expiresAt?: string;
}): Promise<void> {
  await attestIssuedProof({
    keys: params.keys,
    authToken: params.authToken,
    dataPointId: VERIFICATION_CREDENTIAL_DATA_POINT,
    proofType: CREDENTIAL_PROOF_TYPE,
    zkpProof: params.credential,
    verificationLevel: 'verified',
    provider: 'parnoir-api',
    expiresAt: params.expiresAt,
  });
}

/** Most recent held verification credential, or null. */
export async function findHeldVerificationCredential(
  pnIdentifier: string,
  authToken: string
): Promise<string | null> {
  const held = (await listHeldKnowledgeClaims(pnIdentifier, authToken)) || [];
  const latest = held
    .filter((c) => c.dataPointId === VERIFICATION_CREDENTIAL_DATA_POINT && c.zkpProof)
    .sort((a, b) => String(b.verifiedAt).localeCompare(String(a.verifiedAt)))[0];
  return latest?.zkpProof ?? null;
}

/** Held proofs across the pN's Knowledge docs; null when the Drive layout has no pN folder yet. */
export async function listHeldKnowledgeClaims(
  pnIdentifier: string,
  authToken: string
): Promise<DeviceKnowledgeClaim[] | null> {
  const drive = await sessionDriveFor(pnIdentifier, authToken);
  if (!drive.index.pnFolderId) return null;
  return listDeviceKnowledgeClaims({ accessToken: drive.accessToken, pnFolderId: drive.index.pnFolderId });
}

/**
 * Identity re-key: every Knowledge doc is rewritten under the successor (new genesis signature,
 * proofs re-bound to the successor ML-DSA key, docKey wrapped for the successor ML-KEM key).
 * The predecessor ML-KEM key opens the old `source` section. Issued proofs (ID verification queue)
 * land as single-claim docs. The API-signed verification credential is carried over unchanged;
 * the successor swaps it for its own via the credential reissue endpoint once succession is live.
 */
export async function reissueKnowledgeClaims(params: {
  authToken: string;
  drivePnIdentifier: string;
  predecessorMlKemSecretKey: string;
  successor: AttestationKeys & { publicKey: string };
  issued?: Array<{ dataPointId: string; zkpProof: string }>;
}): Promise<number> {
  const { reissueZkProofsFromEnvelopes } = await import('@par-noir/identity-migration');
  const target = await knowledgeTarget(params.drivePnIdentifier, params.authToken);
  const signing = {
    secretKey: params.successor.signing.mlDsaSecretKey,
    publicKey: params.successor.signing.mlDsaPublicKey,
  };
  const issuedIds = new Set((params.issued || []).map((p) => p.dataPointId));
  const byDoc = new Map<string, DeviceKnowledgeClaim[]>();
  const credentials: DeviceKnowledgeClaim[] = [];
  for (const claim of await listDeviceKnowledgeClaims(target)) {
    if (issuedIds.has(claim.sourceDataPointId)) continue;
    if (claim.dataPointId === VERIFICATION_CREDENTIAL_DATA_POINT) {
      credentials.push(claim);
      continue;
    }
    byDoc.set(claim.docId, [...(byDoc.get(claim.docId) || []), claim]);
  }
  let written = 0;
  for (const c of credentials) {
    await writeIssuedProof(target, params.successor, {
      dataPointId: c.dataPointId,
      proofType: c.proofType,
      zkpProof: c.zkpProof,
      verificationLevel: c.verificationLevel,
      provider: c.provider,
      verifiedAt: c.verifiedAt,
      expiresAt: c.expiresAt,
    });
    written += 1;
  }
  for (const claims of byDoc.values()) {
    const head = claims[0]!;
    const reissued = new Map(
      (
        await reissueZkProofsFromEnvelopes(
          claims.map((c) => c.zkpProof),
          { ...params.successor.signing, publicKey: params.successor.publicKey }
        )
      ).map((r) => [r.dataPointId, r.proof])
    );
    const next = claims
      .filter((c) => reissued.has(c.dataPointId))
      .map((c) => ({
        dataPointId: c.dataPointId,
        proofRef: reissued.get(c.dataPointId)!,
        proofType: c.proofType,
        verificationLevel: c.verificationLevel,
        provider: c.provider,
        verifiedAt: c.verifiedAt,
        expiresAt: c.expiresAt,
      }));
    if (!next.length) continue;
    const source =
      (await readKnowledgeClaimSource({
        ...target,
        sourceDataPointId: head.sourceDataPointId,
        mlKemSecretKey: params.predecessorMlKemSecretKey,
      })) || {};
    await writeKnowledgeClaimDoc({
      ...target,
      ownerPnIdentifier: params.successor.pnIdentifier,
      template: requireTemplate(head.templateId),
      sourceDataPointId: head.sourceDataPointId,
      source,
      claims: next,
      signingKeys: signing,
      mlKemSecretKey: params.successor.mlKemSecretKey,
    });
    written += next.length;
  }
  for (const proof of params.issued || []) {
    await writeIssuedProof(target, params.successor, {
      dataPointId: proof.dataPointId,
      proofType: STANDARD_DATA_POINTS[proof.dataPointId]?.zkpType || '',
      zkpProof: proof.zkpProof,
      verificationLevel: 'verified',
      provider: 'stripe_identity',
    });
    written += 1;
  }
  return written;
}

/** The answers behind a source data point, for the edit form. */
export async function readAttestationSource(params: {
  keys: Pick<AttestationKeys, 'pnIdentifier' | 'mlKemSecretKey'>;
  authToken: string;
  sourceDataPointId: string;
}): Promise<Record<string, string> | null> {
  return readKnowledgeClaimSource({
    ...(await knowledgeTarget(params.keys.pnIdentifier, params.authToken)),
    sourceDataPointId: params.sourceDataPointId,
    mlKemSecretKey: params.keys.mlKemSecretKey,
  });
}
