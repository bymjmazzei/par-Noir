import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  fetchMyPublicNames,
  messagingAppOrigin,
  type PublicNameDto
} from '../services/publicNamesApi';

export function SharePnCard({
  accessToken,
  pnIdentifier,
  nickname
}: {
  accessToken: string | null;
  pnIdentifier: string | null;
  nickname?: string;
}) {
  const [vanity, setVanity] = useState<PublicNameDto | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    if (!accessToken || !pnIdentifier) {
      setVanity(null);
      return;
    }
    try {
      const rows = await fetchMyPublicNames(accessToken, pnIdentifier);
      const hit = rows.find((n) => n.isVanity && n.status === 'listed') || null;
      setVanity(hit);
    } catch {
      setVanity(null);
    }
  }, [accessToken, pnIdentifier]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const shareUrl = vanity
    ? `${messagingAppOrigin()}/${encodeURIComponent(vanity.publicName)}`
    : null;

  useEffect(() => {
    if (!shareUrl) {
      setQrDataUrl(null);
      return;
    }
    void QRCode.toDataURL(shareUrl, { margin: 1, width: 200 }).then(setQrDataUrl).catch(() => {
      setQrDataUrl(null);
    });
  }, [shareUrl]);

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  if (!accessToken || !pnIdentifier) return null;

  return (
    <div className="mt-4 w-full max-w-sm rounded-xl border border-border bg-modal-bg p-4 text-left shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Share pN</p>
      {vanity && shareUrl ? (
        <>
          <p className="mt-1 text-sm text-text-primary break-all">{shareUrl}</p>
          <div className="mt-3 flex flex-col items-center gap-3 rounded-lg bg-bg-primary p-4">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR code for your messaging profile link"
                className="rounded-md border border-border bg-white p-2"
                width={200}
                height={200}
              />
            ) : null}
            <div className="text-center">
              <p className="text-sm font-medium text-text-primary">{nickname || 'Your pN'}</p>
              <p className="text-xs text-text-secondary">@{vanity.publicName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="mt-3 w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-bg-primary hover:opacity-90"
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <p className="mt-2 text-[11px] text-text-secondary">
            Opens messaging — others can connect without the browse app.
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-text-secondary">
          List a public name and set it as your profile URL in Privacy → Public names to share a
          connect link.
        </p>
      )}
    </div>
  );
}
