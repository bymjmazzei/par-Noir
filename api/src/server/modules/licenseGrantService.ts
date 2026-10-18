/**
 * Seller-MoR license grants (not creator-fund G).
 */

import type { Pool } from 'pg';
import { getDatabasePool } from '../utils/database';
import { AggregatorMetadataServiceDB } from './aggregatorMetadataServiceDB';
import {
  buildLicenseKeyPublicInputs,
  verifyZkProofEnvelopeV2,
  decodeEnvelopeFromProofString,
  isZkProofEnvelopeV2
} from '@par-noir/zk-protocol-v2';
import { hashPnIdentifier } from '@par-noir/pen-protocol';

export type LicenseScope = 'personal' | 'commercial';

export async function resolvePaidLicenseOffer(
  assetId: string,
  scope: LicenseScope
): Promise<{ sellerPn: string; priceCents: number }> {
  const fileId = assetId.trim();
  if (!fileId) throw new Error('asset_required');
  const svc = AggregatorMetadataServiceDB.getInstance();
  const entry = await svc.getFileMetadata(fileId);
  if (!entry?.metadata) throw new Error('asset_not_found');
  const meta = entry.metadata as unknown as Record<string, unknown>;
  const licensing = meta.licensing as Record<string, unknown> | undefined;
  if (!licensing || licensing.family !== 'unconditionalPaid') {
    throw new Error('asset_not_for_sale');
  }
  const offers = Array.isArray(licensing.offers) ? licensing.offers : [];
  const offer = offers.find(
    (o) =>
      o &&
      typeof o === 'object' &&
      (o as { scope?: string }).scope === scope &&
      Number((o as { priceCents?: number }).priceCents) > 0
  ) as { priceCents?: number } | undefined;
  if (!offer?.priceCents) throw new Error('offer_not_found');
  const sellerPn = String(entry.pnIdentifier || meta.pnIdentifier || '').trim();
  if (!sellerPn) throw new Error('seller_unknown');
  return { sellerPn, priceCents: Math.floor(Number(offer.priceCents)) };
}

export async function insertLicenseGrant(input: {
  assetId: string;
  sellerPn: string;
  buyerPn: string;
  scope: LicenseScope;
  priceCents: number;
  stripePaymentRef: string;
}): Promise<string> {
  const pool = getDatabasePool();
  const existing = await pool.query(
    `SELECT id FROM license_grants
     WHERE buyer_pn = $1 AND asset_id = $2 AND scope = $3
       AND status IN ('pending_proof', 'active')
     LIMIT 1`,
    [input.buyerPn, input.assetId, input.scope]
  );
  if (existing.rows.length > 0) return String(existing.rows[0].id);
  const res = await pool.query(
    `INSERT INTO license_grants (
       asset_id, seller_pn, buyer_pn, scope, price_cents, stripe_payment_ref, status
     ) VALUES ($1, $2, $3, $4, $5, $6, 'pending_proof')
     RETURNING id`,
    [
      input.assetId,
      input.sellerPn,
      input.buyerPn,
      input.scope,
      input.priceCents,
      input.stripePaymentRef
    ]
  );
  return String(res.rows[0].id);
}

export async function getLicenseGrantForBuyer(
  buyerPn: string,
  assetId: string
): Promise<Record<string, unknown> | null> {
  const pool = getDatabasePool();
  const res = await pool.query(
    `SELECT id, asset_id, seller_pn, scope, price_cents, status, proof, stripe_payment_ref, created_at
     FROM license_grants
     WHERE buyer_pn = $1 AND asset_id = $2
       AND status IN ('pending_proof', 'active')
     ORDER BY created_at DESC
     LIMIT 1`,
    [buyerPn.trim(), assetId.trim()]
  );
  return res.rows[0] ?? null;
}

export async function attachLicenseGrantProof(
  grantId: string,
  buyerPn: string,
  proof: string
): Promise<void> {
  const pool = getDatabasePool();
  const row = await pool.query(
    `SELECT * FROM license_grants WHERE id = $1::uuid AND buyer_pn = $2`,
    [grantId, buyerPn.trim()]
  );
  if (row.rows.length === 0) throw new Error('grant_not_found');
  const g = row.rows[0];
  const ok = verifyZkProofEnvelopeV2(proof);
  if (!ok.ok) throw new Error('proof_invalid');
  const envelope = decodeEnvelopeFromProofString(proof);
  if (!isZkProofEnvelopeV2(envelope)) throw new Error('proof_invalid');
  const expected = buildLicenseKeyPublicInputs({
    assetId: String(g.asset_id),
    sellerPnHash: hashPnIdentifier(String(g.seller_pn)),
    buyerPnHash: hashPnIdentifier(buyerPn),
    scope: g.scope as LicenseScope,
    priceCents: Number(g.price_cents),
    stripePaymentRef: String(g.stripe_payment_ref || ''),
    expiresAtMs: Number.MAX_SAFE_INTEGER
  });
  const pub = envelope.public_inputs as Record<string, unknown>;
  if (
    pub.asset_id !== expected.asset_id ||
    pub.buyer_pn_hash !== expected.buyer_pn_hash ||
    pub.seller_pn_hash !== expected.seller_pn_hash ||
    pub.scope !== expected.scope ||
    pub.price_cents !== expected.price_cents
  ) {
    throw new Error('proof_mismatch');
  }
  await pool.query(
    `UPDATE license_grants SET proof = $2, status = 'active', updated_at = NOW() WHERE id = $1::uuid`,
    [grantId, proof]
  );
}
