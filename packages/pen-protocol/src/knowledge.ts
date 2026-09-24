/**
 * Knowledge atom + geo/place as proof attachments (never raw PII / lat-lng).
 * Place is not a template family — attach proofs to any asset.
 */

import type { PenDocManifest } from './types.js';

/** Claim bound to a standard-data-points catalog id + optional ZKP slot. */
export type KnowledgeClaim = {
  /** Catalog data-point id (e.g. age_over_18). Never raw age/email/name. */
  dataPointId: string;
  /** Opaque proof / attestation ref — never plaintext claim value. */
  proofRef?: string;
  /** Human-facing label for the claim slot (not the secret). */
  label?: string;
};

/** Device location or selected area → geo proof attached to an asset. */
export type GeoProofAttachment = {
  /** Opaque geo/area proof id (ZKP or custody attestation). */
  proofRef: string;
  /** Optional precision band for agents (never exact coords). */
  precision?: 'city' | 'region' | 'country' | 'custom_area';
  /** When the proof was attached (ISO). */
  attachedAt?: string;
};

export type KnowledgePayload = {
  claims: KnowledgeClaim[];
  /** Optional geo/place proofs on this Knowledge atom. */
  geoProofs?: GeoProofAttachment[];
};

/**
 * Asset-level geo/place proof attachments on any publishable manifest.
 * Not a Place template — queryable later for geo feeds.
 */
export type AssetAttestation = {
  knowledge?: KnowledgePayload;
  geoProofs?: GeoProofAttachment[];
};

const RAW_PII_KEYS =
  /^(lat|lng|longitude|latitude|email|passcode|pn[_-]?name|ssn|phone|address|dob|birth)/i;
const COORD_PAIR = /-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+/;

/** Reject payloads that store raw PII or coordinates in IR. */
export function assertKnowledgePayloadSafe(payload: KnowledgePayload): void {
  for (const claim of payload.claims || []) {
    if (!claim.dataPointId?.trim()) {
      throw new Error('knowledge_claim_missing_data_point');
    }
    if (RAW_PII_KEYS.test(claim.dataPointId)) {
      throw new Error(`knowledge_raw_pii_key:${claim.dataPointId}`);
    }
    if (claim.label && COORD_PAIR.test(claim.label)) {
      throw new Error('knowledge_raw_coords_in_label');
    }
    if (claim.proofRef && COORD_PAIR.test(claim.proofRef)) {
      throw new Error('knowledge_raw_coords_in_proof');
    }
  }
  for (const geo of payload.geoProofs || []) {
    if (!geo.proofRef?.trim()) {
      throw new Error('geo_proof_missing_ref');
    }
    if (COORD_PAIR.test(geo.proofRef)) {
      throw new Error('geo_proof_raw_coords');
    }
  }
}

export function attachGeoProofToManifest(
  manifest: PenDocManifest,
  proof: GeoProofAttachment
): PenDocManifest {
  if (!proof.proofRef?.trim() || COORD_PAIR.test(proof.proofRef)) {
    throw new Error('geo_proof_invalid');
  }
  const prior = manifest.attestations;
  const geoProofs = [...(prior?.geoProofs || []), proof];
  return {
    ...manifest,
    attestations: {
      ...(prior || {}),
      geoProofs
    }
  };
}
