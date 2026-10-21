/**
 * Yes/no attestations for an AI agent, computed on this device from the owner's stored
 * proofs. Only {dataPointId, satisfied, level, expiresAt} leaves this module: no proof
 * envelope, no public inputs, no encrypted user data.
 */

import { listDeviceZkpPoints } from '@par-noir/device-cloud-credentials';
import {
  AI_SCOPES,
  isAttestableDataPointId,
  type AgentAttestation,
  type AgentDelegationDraft,
  type AiScope,
  type AttestableDataPointId
} from '@par-noir/standard-data-points';
import { decodeEnvelopeFromProofString, verifyZkProofEnvelopeV1 } from '@par-noir/zk-protocol-v1';
import { sessionDriveFor } from './sessionDrive';

export interface HeldProofRow {
  dataPointId: string;
  zkpProof?: string;
  verificationLevel?: string;
}

/** Threshold proofs answer from their signed predicate; the rest are "holds a valid proof". */
const PREDICATE_FIELD: Partial<Record<AttestableDataPointId, string>> = {
  over_18: 'over_18',
  over_21: 'over_21'
};

/** Null when the proof is not attestable, does not verify, or is not for this data point. */
export function attestationFromProof(row: HeldProofRow, now: number = Date.now()): AgentAttestation | null {
  const id = row.dataPointId;
  if (!isAttestableDataPointId(id) || !row.zkpProof) return null;
  if (!verifyZkProofEnvelopeV1(row.zkpProof, { nowMs: now }).ok) return null;
  const env = decodeEnvelopeFromProofString(row.zkpProof) as {
    context?: unknown;
    expires_at_ms?: unknown;
    public_inputs?: Record<string, unknown>;
  } | null;
  if (!env || env.context !== `par-noir.zkp.${id}` || env.public_inputs?.data_point_id !== id) return null;
  const field = PREDICATE_FIELD[id];
  const satisfied = field ? env.public_inputs?.[field] === true : true;
  const expiresAt = typeof env.expires_at_ms === 'number' ? new Date(env.expires_at_ms).toISOString() : null;
  return {
    dataPointId: id,
    satisfied,
    level: row.verificationLevel === 'verified' ? 'verified' : 'attested',
    expiresAt
  };
}

export function attestationsFromProofs(rows: HeldProofRow[], now: number = Date.now()): AgentAttestation[] {
  const out = new Map<string, AgentAttestation>();
  for (const row of rows) {
    const a = attestationFromProof(row, now);
    if (a && !out.has(a.dataPointId)) out.set(a.dataPointId, a);
  }
  return [...out.values()];
}

/** Same Drive sheet the Privacy panel reads; proofs are checked here and never sent. */
export async function loadAgentAttestations(
  pnIdentifier: string,
  authToken: string,
  now: number = Date.now()
): Promise<AgentAttestation[]> {
  const key = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  const drive = await sessionDriveFor(key, authToken);
  const sheetId = drive.index.sheetIds['zkp-data-points'];
  if (!sheetId) return [];
  return attestationsFromProofs(await listDeviceZkpPoints(drive.accessToken, sheetId), now);
}

function nonce(random: (n: number) => Uint8Array): string {
  let bin = '';
  for (const b of random(18)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

const defaultRandom = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** Draft Unlock signs. Attestations only travel with ai:proofs, and only the ones picked. */
export function buildAgentDelegationDraft(args: {
  scopes: AiScope[];
  held: AgentAttestation[];
  picked: string[];
  now?: number;
  random?: (n: number) => Uint8Array;
}): AgentDelegationDraft {
  const picked = new Set(args.picked);
  const attestations = args.scopes.includes(AI_SCOPES.proofs)
    ? args.held
        .filter((a) => picked.has(a.dataPointId))
        .map((a) => ({
          dataPointId: a.dataPointId,
          satisfied: a.satisfied,
          level: a.level,
          expiresAt: a.expiresAt
        }))
    : [];
  return {
    scopes: [...new Set(args.scopes)],
    attestations,
    issuedAt: new Date(args.now ?? Date.now()).toISOString(),
    expiresAt: null,
    nonce: nonce(args.random ?? defaultRandom)
  };
}
