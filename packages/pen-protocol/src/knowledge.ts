/**
 * Knowledge atom + geo/place as proof attachments (never raw PII / lat-lng).
 * Place is not a template family — attach proofs to any asset.
 */

import type { PenDocManifest, PenHistoryChain, PenSectionContent } from './types.js';
import type { PenTemplate } from './templates.js';
import { hashPnIdentifier, hashSectionContent, signGenesis } from './chain.js';
import { ensureOwnerAssignment } from './roles.js';
import {
  TABLE_PAYLOAD_VERSION,
  parseTablePayloadFromTipTap,
  tableSectionFromPayload
} from './table.js';

export const KNOWLEDGE_CLAIM_CLASS_ID = 'knowledge.claim';

export function isKnowledgeClassId(classId: string | null | undefined): boolean {
  return classId === 'knowledge' || !!classId?.startsWith('knowledge.');
}

/** Claim bound to a standard-data-points catalog id + optional ZKP slot. */
export type KnowledgeClaim = {
  /** Catalog data-point id (e.g. age_over_18). Never raw age/email/name. */
  dataPointId: string;
  /** Opaque proof / attestation ref — never plaintext claim value. */
  proofRef?: string;
  /** Human-facing label for the claim slot (not the secret). */
  label?: string;
  proofType?: string;
  verificationLevel?: 'basic' | 'enhanced' | 'verified';
  /** Who vouched: user_attested, stripe_identity, … */
  provider?: string;
  verifiedAt?: string;
  expiresAt?: string;
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
  /** Data point the doc's form attests (one Knowledge doc per source per pN). */
  sourceDataPointId?: string;
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
  /^(lat|lng|longitude|latitude|email|pass_?code|key_?[12]|pn[_-]?name|ssn|phone|address|dob|birth)/i;
const COORD_PAIR = /-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+/;
/** Catalog predicates like email_verification name a proof, not the raw value. */
const PROOF_PREDICATE_ID = /_(verification|attestation)$/;

/** Reject payloads that store raw PII or coordinates in IR. */
export function assertKnowledgePayloadSafe(payload: KnowledgePayload): void {
  for (const claim of payload.claims || []) {
    if (!claim.dataPointId?.trim()) {
      throw new Error('knowledge_claim_missing_data_point');
    }
    if (RAW_PII_KEYS.test(claim.dataPointId) && !PROOF_PREDICATE_ID.test(claim.dataPointId)) {
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

/** Data point ids a Knowledge template may carry claims for. */
export function knowledgeClaimIdsForTemplate(template: PenTemplate, sourceDataPointId: string): string[] {
  const form = template.knowledgeForm;
  if (!form) return [];
  return [sourceDataPointId, ...form.derivedDataPointIds];
}

function fieldTable(source: Record<string, string>) {
  return {
    version: TABLE_PAYLOAD_VERSION,
    columns: [
      { id: 'field', title: 'Field', type: 'string' as const },
      { id: 'value', title: 'Value', type: 'string' as const }
    ],
    rows: Object.entries(source).map(([field, value]) => ({ id: field, cells: { field, value } }))
  };
}

function claimTable(claims: KnowledgeClaim[]) {
  return {
    version: TABLE_PAYLOAD_VERSION,
    columns: [
      { id: 'dataPointId', title: 'Data point', type: 'string' as const },
      { id: 'level', title: 'Level', type: 'string' as const },
      { id: 'expiresAt', title: 'Expires', type: 'string' as const }
    ],
    rows: claims.map((c) => ({
      id: c.dataPointId,
      cells: {
        dataPointId: c.dataPointId,
        level: c.verificationLevel || 'basic',
        expiresAt: c.expiresAt || ''
      }
    }))
  };
}

/** Raw answers from a Knowledge doc's decrypted `source` section. */
export function knowledgeSourceFromSection(section: PenSectionContent | null | undefined): Record<string, string> {
  const table = parseTablePayloadFromTipTap(section?.doc);
  const out: Record<string, string> = {};
  for (const row of table?.rows || []) {
    const field = String(row.cells.field ?? row.id ?? '');
    if (field) out[field] = String(row.cells.value ?? '');
  }
  return out;
}

/**
 * A Knowledge claim doc: ML-DSA genesis (Pen authorship), claims with their proofs on the
 * manifest, and the raw answers in the `source` section (the caller seals sections with the docKey).
 */
export function buildKnowledgeClaimDoc(input: {
  docId: string;
  groupId: string;
  template: PenTemplate;
  authorPn: string;
  sourceDataPointId: string;
  source: Record<string, string>;
  claims: KnowledgeClaim[];
  secretKey: Uint8Array;
  publicKey: Uint8Array;
  title?: string;
  now?: string;
}): { manifest: PenDocManifest; sections: PenSectionContent[]; chain: PenHistoryChain } {
  const form = input.template.knowledgeForm;
  if (input.template.classId !== KNOWLEDGE_CLAIM_CLASS_ID || !form) {
    throw new Error(`knowledge_template_required:${input.template.id}`);
  }
  if (!input.sourceDataPointId) throw new Error('knowledge_source_required');
  if (form.sourceDataPointId && form.sourceDataPointId !== input.sourceDataPointId) {
    throw new Error(`knowledge_source_mismatch:${input.template.id}:${input.sourceDataPointId}`);
  }
  if (!input.claims.length) throw new Error('knowledge_claims_required');
  const allowed = new Set(knowledgeClaimIdsForTemplate(input.template, input.sourceDataPointId));
  for (const claim of input.claims) {
    if (!allowed.has(claim.dataPointId)) {
      throw new Error(`knowledge_claim_not_in_template:${input.template.id}:${claim.dataPointId}`);
    }
  }
  if (form.inputFields.length) {
    const fields = new Set(form.inputFields);
    for (const key of Object.keys(input.source)) {
      if (!fields.has(key)) throw new Error(`knowledge_source_field_not_in_template:${key}`);
    }
  }
  const knowledge: KnowledgePayload = {
    sourceDataPointId: input.sourceDataPointId,
    claims: input.claims
  };
  assertKnowledgePayloadSafe(knowledge);

  const now = input.now || new Date().toISOString();
  const sections = [
    tableSectionFromPayload('source', fieldTable(input.source)),
    tableSectionFromPayload('claims', claimTable(input.claims))
  ];
  const genesis = signGenesis({
    docId: input.docId,
    templateId: input.template.id,
    clientCreatedAt: now,
    contentCommitment: hashSectionContent(new TextEncoder().encode(JSON.stringify(sections))),
    secretKey: input.secretKey,
    publicKey: input.publicKey
  });
  const ownerPnHash = hashPnIdentifier(input.authorPn);
  const manifest: PenDocManifest = {
    docId: input.docId,
    title: input.title || input.template.title,
    docType: input.template.docType,
    classId: input.template.classId,
    templateId: input.template.id,
    templateVersion: input.template.version,
    groupId: input.groupId,
    toc: sections.map((s) => s.slug),
    createdAt: now,
    updatedAt: now,
    genesisProof: genesis,
    ownerPnHash,
    roles: ensureOwnerAssignment([], ownerPnHash),
    lifecycle: 'published',
    knowledge
  };
  return { manifest, sections, chain: { docId: input.docId, genesis, links: [] } };
}
