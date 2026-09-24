/**
 * Membership-aware licensing editor for Pen doc/template root.
 * Product labels: Free / Social / Conditional (protocol: unconditionalFree / implied / unconditionalPaid).
 */

import {
  BPS_DENOM,
  type PenLicenseFamily,
  type PenLicensingRoot,
  defaultLicensingRoot,
  normalizeLicensingRoot
} from '@par-noir/pen-protocol';

export type MembershipFlags = {
  membership: boolean;
  connectReady: boolean;
};

export function coerceLicensingForMembership(
  raw: PenLicensingRoot | undefined,
  ownerPnHash: string | null | undefined,
  flags: MembershipFlags,
  opts?: { musicAsset?: boolean }
): PenLicensingRoot {
  return normalizeLicensingRoot(raw, ownerPnHash, {
    membership: flags.membership,
    connectReady: flags.connectReady,
    musicAsset: opts?.musicAsset
  });
}

type Props = {
  value: PenLicensingRoot;
  ownerPnHash?: string | null;
  membership: boolean;
  connectReady: boolean;
  musicAsset?: boolean;
  onChange: (next: PenLicensingRoot) => void;
};

export function LicensingSettingsPanel({
  value,
  ownerPnHash,
  membership,
  connectReady,
  musicAsset,
  onChange
}: Props) {
  const family = value.family || 'unconditionalFree';

  function setFamily(f: PenLicenseFamily) {
    if (!membership && f !== 'unconditionalFree') return;
    if (f === 'unconditionalPaid' && !connectReady) return;
    if (f === 'implied') {
      onChange(defaultLicensingRoot(ownerPnHash, { membership: true, musicAsset, family: 'implied' }));
      return;
    }
    if (f === 'unconditionalFree') {
      onChange({ family: 'unconditionalFree', workLicense: value.workLicense, contracts: [] });
      return;
    }
    onChange({
      family: 'unconditionalPaid',
      workLicense: value.workLicense,
      contracts: [],
      offers: value.offers?.length
        ? value.offers
        : [{ scope: 'personal', priceCents: 500, currency: 'usd' }]
    });
  }

  const content = value.contracts.find((c) => c.party === 'content_rights');
  const music = value.contracts.find((c) => c.party === 'music');
  const claimContract = musicAsset ? music || content : content;
  const claimLabel = musicAsset
    ? 'Your claim of the music fund'
    : 'Your claim of the content fund';

  return (
    <div className="pen-licensing-settings" style={{ display: 'grid', gap: 8, fontSize: 13 }}>
      <label style={{ fontWeight: 600 }}>License</label>
      {!membership && (
        <p style={{ margin: 0, opacity: 0.8 }}>
          Unverified accounts publish as free. Verify identity to unlock Social (platform fund) or
          Conditional (your Stripe) licenses.
        </p>
      )}
      <select
        value={family}
        disabled={!membership}
        onChange={(e) => setFamily(e.target.value as PenLicenseFamily)}
        aria-label="License family"
      >
        <option value="unconditionalFree">Free</option>
        <option value="implied" disabled={!membership}>
          Social (platform fund)
        </option>
        <option value="unconditionalPaid" disabled={!membership || !connectReady}>
          Conditional (your Stripe)
        </option>
      </select>
      {family === 'implied' && claimContract && (
        <label style={{ display: 'grid', gap: 4 }}>
          {claimLabel}
          <span style={{ opacity: 0.75, fontSize: 11 }}>
            Platform fund rates are fixed. Adjust what percentage you take of your party’s bucket.
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((claimContract.claimBps / BPS_DENOM) * 100)}
            onChange={(e) => {
              const pct = Number(e.target.value);
              const claimBps = Math.round((pct / 100) * BPS_DENOM);
              const party = claimContract.party;
              const contracts = value.contracts.filter((c) => c.party !== party);
              contracts.push({ ...claimContract, claimBps });
              onChange({ ...value, family: 'implied', contracts });
            }}
          />
          <span>{Math.round((claimContract.claimBps / BPS_DENOM) * 100)}%</span>
        </label>
      )}
      {family === 'unconditionalPaid' && (
        <label style={{ display: 'grid', gap: 4 }}>
          Personal license price (USD)
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={((value.offers?.[0]?.priceCents ?? 500) / 100).toFixed(2)}
            onChange={(e) => {
              const dollars = Number(e.target.value);
              const priceCents = Math.max(1, Math.round(dollars * 100));
              onChange({
                ...value,
                family: 'unconditionalPaid',
                contracts: [],
                offers: [{ scope: 'personal', priceCents, currency: 'usd' }]
              });
            }}
          />
        </label>
      )}
      {membership && family === 'unconditionalPaid' && !connectReady && (
        <p style={{ margin: 0, color: '#b45309' }}>
          Connect Stripe payouts in the dashboard Monetization tab before selling licenses.
        </p>
      )}
      {membership && !connectReady && family !== 'unconditionalPaid' && (
        <p style={{ margin: 0, opacity: 0.75, fontSize: 11 }}>
          Connect Stripe payouts in the dashboard Monetization tab to enable Conditional licenses.
        </p>
      )}
    </div>
  );
}
