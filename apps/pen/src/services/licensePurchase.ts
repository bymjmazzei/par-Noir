import { apiFetch, apiGet } from './penOwnerFetch';
import {
  LICENSE_KEY_CONTEXT_V1,
  buildLicenseKeyPublicInputs,
  generateZkProofEnvelopeV2
} from '@par-noir/zk-protocol-v2';
import { createDocFromTemplate } from './createDocFromTemplate';
import type { PenSession } from '../App';
import { resolveSigningKeys } from './penKeys';

const PERPETUAL_MS = 100 * 365.25 * 24 * 60 * 60 * 1000;

export async function startLicenseCheckout(
  session: PenSession,
  assetId: string,
  returnUrl: string
): Promise<string> {
  const res = await apiFetch(
    'POST',
    '/api/monetization/create-license-checkout',
    { asset_id: assetId, scope: 'personal', return_url: returnUrl },
    { authToken: session.accessToken, pnIdentifier: session.pnIdentifier }
  );
  if (!res.ok) throw new Error('license_checkout_failed');
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error('license_checkout_no_url');
  return data.url;
}

export async function fetchLicenseGrant(
  session: PenSession,
  assetId: string
): Promise<{ id: string; status: string } | null> {
  const res = await apiGet(
    `/api/monetization/license-grants?asset_id=${encodeURIComponent(assetId)}`,
    { authToken: session.accessToken, pnIdentifier: session.pnIdentifier }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { grant?: { id?: string; status?: string } | null };
  if (!data.grant?.id) return null;
  return { id: String(data.grant.id), status: String(data.grant.status || '') };
}

export async function completeLicensePurchase(
  session: PenSession,
  assetId: string
): Promise<void> {
  const grant = await fetchLicenseGrant(session, assetId);
  if (!grant) throw new Error('license_grant_missing');
  if (grant.status === 'active') return;

  const detailRes = await apiGet(
    `/api/monetization/license-grants?asset_id=${encodeURIComponent(assetId)}`,
    { authToken: session.accessToken, pnIdentifier: session.pnIdentifier }
  );
  const detail = (await detailRes.json()) as {
    grant?: {
      id?: string;
      seller_pn?: string;
      price_cents?: number;
      scope?: string;
      stripe_payment_ref?: string;
    };
  };
  const g = detail.grant;
  if (!g?.id || !g.seller_pn) throw new Error('license_grant_incomplete');

  const keys = resolveSigningKeys(session);

  const { hashPnIdentifier } = await import('@par-noir/pen-protocol');
  const proof = generateZkProofEnvelopeV2({
    mlDsaSecretKey: keys.secretKey,
    mlDsaPublicKey: keys.publicKey,
    context: LICENSE_KEY_CONTEXT_V1,
    public_inputs: buildLicenseKeyPublicInputs({
      assetId,
      sellerPnHash: hashPnIdentifier(g.seller_pn),
      buyerPnHash: hashPnIdentifier(session.pnIdentifier),
      scope: g.scope === 'commercial' ? 'commercial' : 'personal',
      priceCents: Number(g.price_cents || 0),
      stripePaymentRef: String(g.stripe_payment_ref || grant.id),
      expiresAtMs: Date.now() + PERPETUAL_MS
    }),
    expiresAtMs: Date.now() + PERPETUAL_MS
  });

  const postRes = await apiFetch(
    'POST',
    `/api/monetization/license-grants/${encodeURIComponent(g.id)}/proof`,
    { proof },
    { authToken: session.accessToken, pnIdentifier: session.pnIdentifier }
  );
  if (!postRes.ok) throw new Error('license_proof_submit_failed');

  await createDocFromTemplate({
    session,
    templateId: 'asset_key.basic.v1',
    title: `License: ${assetId.slice(0, 12)}`
  });
}
