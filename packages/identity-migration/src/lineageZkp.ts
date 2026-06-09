import { generateZkProofEnvelopeV2, verifyZkProofEnvelopeV2 } from '@par-noir/zk-protocol-v2';
import {
  LINEAGE_ZKP_CONTEXT,
  LINEAGE_ZKP_TYPE,
  type IdentityKeyMaterial,
  type LineageZkpPair,
} from './types';

export interface LineageZkpParams {
  migrationId: string;
  predecessor: Pick<
    IdentityKeyMaterial,
    'publicKey' | 'pnIdentifier' | 'mlDsaSecretKey' | 'mlDsaPublicKey'
  >;
  successor: Pick<
    IdentityKeyMaterial,
    'publicKey' | 'pnIdentifier' | 'mlDsaSecretKey' | 'mlDsaPublicKey'
  >;
  effectiveAtMs?: number;
}

function buildPublicInputs(params: LineageZkpParams, signerRole: 'predecessor' | 'successor') {
  const effective_at_ms = params.effectiveAtMs ?? Date.now();
  return {
    zkp_type: LINEAGE_ZKP_TYPE,
    signer_role: signerRole,
    predecessor_public_key: params.predecessor.publicKey,
    successor_public_key: params.successor.publicKey,
    predecessor_pn_identifier: params.predecessor.pnIdentifier,
    successor_pn_identifier: params.successor.pnIdentifier,
    migration_id: params.migrationId,
    effective_at_ms,
  };
}

export async function issueLineageZkpPair(params: LineageZkpParams): Promise<LineageZkpPair> {
  const ttl = 10 * 365 * 24 * 60 * 60 * 1000;
  const expiresAtMs = Date.now() + ttl;

  const predecessorProof = generateZkProofEnvelopeV2({
    mlDsaSecretKey: params.predecessor.mlDsaSecretKey,
    mlDsaPublicKey: params.predecessor.mlDsaPublicKey,
    context: LINEAGE_ZKP_CONTEXT,
    public_inputs: buildPublicInputs(params, 'predecessor'),
    expiresAtMs,
  });

  const successorProof = generateZkProofEnvelopeV2({
    mlDsaSecretKey: params.successor.mlDsaSecretKey,
    mlDsaPublicKey: params.successor.mlDsaPublicKey,
    context: LINEAGE_ZKP_CONTEXT,
    public_inputs: buildPublicInputs(params, 'successor'),
    expiresAtMs,
  });

  return { predecessorProof, successorProof };
}

export function verifyLineageZkpPair(
  pair: LineageZkpPair,
  expectedMigrationId: string
): { ok: boolean; reason?: string } {
  const pred = verifyZkProofEnvelopeV2(pair.predecessorProof);
  if (!pred.ok) return { ok: false, reason: `predecessor_${pred.reason}` };
  const succ = verifyZkProofEnvelopeV2(pair.successorProof);
  if (!succ.ok) return { ok: false, reason: `successor_${succ.reason}` };

  const predEnv = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(pair.predecessorProof.trim()), (c) => c.charCodeAt(0))
    )
  ) as { public_inputs?: Record<string, unknown> };
  const succEnv = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(pair.successorProof.trim()), (c) => c.charCodeAt(0))
    )
  ) as { public_inputs?: Record<string, unknown> };

  const predInputs = predEnv.public_inputs ?? {};
  const succInputs = succEnv.public_inputs ?? {};

  if (predInputs.migration_id !== expectedMigrationId || succInputs.migration_id !== expectedMigrationId) {
    return { ok: false, reason: 'migration_id_mismatch' };
  }
  if (predInputs.predecessor_public_key !== succInputs.predecessor_public_key) {
    return { ok: false, reason: 'predecessor_key_mismatch_across_proofs' };
  }
  if (predInputs.successor_public_key !== succInputs.successor_public_key) {
    return { ok: false, reason: 'successor_key_mismatch_across_proofs' };
  }
  return { ok: true };
}
