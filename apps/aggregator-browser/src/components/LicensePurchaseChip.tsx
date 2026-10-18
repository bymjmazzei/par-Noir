import { useEffect, useState } from 'react';
import type { PenLicensingSnapshot } from '@par-noir/aggregator-domain';
import { createLicenseCheckout, fetchLicenseGrantStatus } from '../services/licenseCheckoutApi';

type Props = {
  fileId: string;
  licensing?: PenLicensingSnapshot;
  accessToken?: string | null;
};

export function LicensePurchaseChip({ fileId, licensing, accessToken }: Props) {
  const [owned, setOwned] = useState(false);
  const [busy, setBusy] = useState(false);

  const paid =
    licensing?.family === 'unconditionalPaid' &&
    Array.isArray(licensing.offers) &&
    licensing.offers[0]?.priceCents > 0;
  const priceCents = paid ? licensing!.offers![0]!.priceCents : 0;

  useEffect(() => {
    if (!accessToken || !paid) return;
    void fetchLicenseGrantStatus(accessToken, fileId).then((s) => setOwned(s === 'active'));
  }, [accessToken, fileId, paid]);

  if (!paid) return null;

  return (
    <button
      type="button"
      disabled={busy || owned || !accessToken}
      onClick={() => {
        if (!accessToken) return;
        setBusy(true);
        const returnUrl = `https://pn.parnoir.com/?license=success&asset=${encodeURIComponent(fileId)}`;
        void createLicenseCheckout(accessToken, fileId, returnUrl)
          .then((url) => {
            window.location.href = url;
          })
          .finally(() => setBusy(false));
      }}
      style={{
        fontSize: 12,
        padding: '4px 8px',
        borderRadius: 6,
        border: '1px solid #ccc',
        background: owned ? '#e8f5e9' : '#fff'
      }}
    >
      {owned ? 'Licensed' : busy ? '…' : `Buy $${(priceCents / 100).toFixed(2)}`}
    </button>
  );
}
