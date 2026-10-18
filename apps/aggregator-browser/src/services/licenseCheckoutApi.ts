import { API_ENDPOINT } from '../config/api';

export async function createLicenseCheckout(
  accessToken: string,
  assetId: string,
  returnUrl: string
): Promise<string> {
  const res = await fetch(`${API_ENDPOINT}/api/monetization/create-license-checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ asset_id: assetId, scope: 'personal', return_url: returnUrl })
  });
  if (!res.ok) throw new Error('license_checkout_failed');
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error('license_checkout_no_url');
  return data.url;
}

export async function fetchLicenseGrantStatus(
  accessToken: string,
  assetId: string
): Promise<'none' | 'pending_proof' | 'active'> {
  const res = await fetch(
    `${API_ENDPOINT}/api/monetization/license-grants?asset_id=${encodeURIComponent(assetId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return 'none';
  const data = (await res.json()) as { grant?: { status?: string } | null };
  const st = data.grant?.status;
  if (st === 'active') return 'active';
  if (st === 'pending_proof') return 'pending_proof';
  return data.grant ? 'pending_proof' : 'none';
}
