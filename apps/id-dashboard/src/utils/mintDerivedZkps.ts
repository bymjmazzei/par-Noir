/**
 * Mint derived ZKPs from name / DOB attestation forms.
 */

import type { EncryptedIdentity } from '@par-noir/identity-crypto';
import { AGE_DERIVED_IDS, NAME_DERIVED_IDS } from '@par-noir/standard-data-points';
import { ZKPGenerator } from './ZKPGenerator';
import type { ZKPDataPoint } from './zkpDataPointsService';
import { ZKPDataPointsService } from './zkpDataPointsService';

export interface NameAttestationFields {
  prefix?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  nickname?: string;
}

export interface MintDerivedParams {
  identityId: string;
  credentials: { pnName: string; passcode: string };
  authToken: string;
  publicKey?: string;
  encryptedIdentity: EncryptedIdentity;
  verificationLevel?: 'basic' | 'enhanced' | 'verified';
  encryptedUserData?: string;
}

function trimPart(s?: string): string {
  return (s || '').trim();
}

export function buildNameDerivedPayloads(fields: NameAttestationFields): Record<string, Record<string, unknown>> {
  const prefix = trimPart(fields.prefix);
  const first = trimPart(fields.firstName);
  const middle = trimPart(fields.middleName);
  const last = trimPart(fields.lastName);
  const suffix = trimPart(fields.suffix);
  const nickname = trimPart(fields.nickname);

  const fullParts = [prefix, first, middle, last, suffix].filter(Boolean);
  const fullName = fullParts.join(' ');
  const firstLast = [first, last].filter(Boolean).join(' ');
  const lastInitial = last ? `${last.charAt(0).toUpperCase()}.` : '';
  const firstLastInitial = [first, lastInitial].filter(Boolean).join(' ');

  const out: Record<string, Record<string, unknown>> = {
    full_name: { fullName },
    first_last: { firstLast },
    first_last_initial: { firstLastInitial },
    first_name: { firstName: first },
    last_name: { lastName: last },
    identity_attestation: {
      firstName: first,
      middleName: middle || '',
      lastName: last
    }
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
  return {
    age_attestation: { dateOfBirth },
    over_18: { over18: age >= 18 },
    over_21: { over21: age >= 21 }
  };
}

async function mintAndSaveOne(
  dataPointId: string,
  userData: Record<string, unknown>,
  params: MintDerivedParams,
  storeEncryptedUserData: boolean
): Promise<void> {
  const level = params.verificationLevel || 'basic';
  const proof = await ZKPGenerator.generateZKP({
    dataPointId,
    userData,
    verificationLevel: level,
    identityId: params.identityId,
    encryptedIdentity: params.encryptedIdentity
  });

  const zkpDataPoint: ZKPDataPoint = {
    dataPointId,
    proofType: proof.proofType,
    zkpProof: proof.proof,
    signature: proof.signature || proof.proof,
    verifiedAt: proof.timestamp || new Date().toISOString(),
    expiresAt: proof.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    verificationLevel: level,
    metadata: {
      provider: level === 'verified' ? 'veriff' : 'user_attested'
    },
    encryptedUserData: storeEncryptedUserData ? params.encryptedUserData : undefined
  };

  await ZKPDataPointsService.saveDataPoint(
    params.identityId,
    params.credentials,
    params.authToken,
    zkpDataPoint,
    params.publicKey
  );
}

/** Mint all name-derived ZKPs; encrypted source payload stored on name_attestation. */
export async function mintDerivedNameZkps(
  fields: NameAttestationFields,
  params: MintDerivedParams
): Promise<string[]> {
  const payloads = buildNameDerivedPayloads(fields);
  const saved: string[] = [];

  // Source row for Edit form reload
  await mintAndSaveOne(
    'name_attestation',
    {
      prefix: fields.prefix || '',
      firstName: fields.firstName,
      middleName: fields.middleName || '',
      lastName: fields.lastName,
      suffix: fields.suffix || '',
      nickname: fields.nickname || ''
    },
    params,
    true
  );
  saved.push('name_attestation');

  for (const id of NAME_DERIVED_IDS) {
    const userData = payloads[id];
    if (!userData) continue;
    try {
      await mintAndSaveOne(id, userData, params, false);
      saved.push(id);
    } catch (e) {
      // Skip optional derived rows that fail validation (e.g. empty middle)
      console.warn(`[mintDerivedNameZkps] skip ${id}:`, (e as Error)?.message);
    }
  }
  return saved;
}

/** Mint age + over_18 + over_21; DOB encrypted on age_attestation only. */
export async function mintDerivedAgeZkps(
  dateOfBirth: string,
  params: MintDerivedParams
): Promise<string[]> {
  const payloads = buildAgeDerivedPayloads(dateOfBirth);
  const saved: string[] = [];
  for (const id of AGE_DERIVED_IDS) {
    const userData = payloads[id];
    if (!userData) continue;
    await mintAndSaveOne(id, userData, params, id === 'age_attestation');
    saved.push(id);
  }
  return saved;
}
