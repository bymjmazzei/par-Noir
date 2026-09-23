/**
 * Unconditional paid license key — ZKP public_inputs for zk-protocol-v2 envelopes.
 * Issued after seller-MoR Stripe Checkout; binds buyer + asset + payment ref.
 */

import { sortKeysDeep } from './binding.js';

export const LICENSE_KEY_CONTEXT_V1 = 'parnoir.license_key.v1' as const;

export type LicenseKeyScope = 'personal' | 'commercial';

export interface LicenseKeyPublicInputsV1 {
  asset_id: string;
  seller_pn_hash: string;
  buyer_pn_hash: string;
  scope: LicenseKeyScope;
  price_cents: number;
  currency: string;
  /** Hash or id of Stripe payment — never raw secrets. */
  stripe_payment_ref: string;
  issued_at_ms: number;
  expires_at_ms: number;
}

export function buildLicenseKeyPublicInputs(params: {
  assetId: string;
  sellerPnHash: string;
  buyerPnHash: string;
  scope: LicenseKeyScope;
  priceCents: number;
  currency?: string;
  stripePaymentRef: string;
  issuedAtMs?: number;
  expiresAtMs: number;
}): LicenseKeyPublicInputsV1 {
  const price = Math.max(1, Math.round(params.priceCents));
  const issued = params.issuedAtMs ?? Date.now();
  return {
    asset_id: params.assetId.trim(),
    seller_pn_hash: params.sellerPnHash.trim(),
    buyer_pn_hash: params.buyerPnHash.trim(),
    scope: params.scope,
    price_cents: price,
    currency: (params.currency || 'usd').trim().toLowerCase(),
    stripe_payment_ref: params.stripePaymentRef.trim(),
    issued_at_ms: issued,
    expires_at_ms: params.expiresAtMs
  };
}

export function isLicenseKeyPublicInputsV1(x: unknown): x is LicenseKeyPublicInputsV1 {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.asset_id === 'string' &&
    typeof o.seller_pn_hash === 'string' &&
    typeof o.buyer_pn_hash === 'string' &&
    (o.scope === 'personal' || o.scope === 'commercial') &&
    typeof o.price_cents === 'number' &&
    o.price_cents > 0 &&
    typeof o.currency === 'string' &&
    typeof o.stripe_payment_ref === 'string' &&
    typeof o.issued_at_ms === 'number' &&
    typeof o.expires_at_ms === 'number'
  );
}

export function licenseKeyPublicInputsFromEnvelope(
  publicInputs: Record<string, unknown>
): LicenseKeyPublicInputsV1 | null {
  return isLicenseKeyPublicInputsV1(publicInputs) ? publicInputs : null;
}

/** Canonical JSON for binding / tests. */
export function canonicalLicenseKeyInputs(inputs: LicenseKeyPublicInputsV1): string {
  return JSON.stringify(sortKeysDeep(inputs));
}
