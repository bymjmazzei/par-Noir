import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { buildMessagingConnectUrl } from '@par-noir/social-connections';
import { messagingAppOrigin } from '../services/publicNamesApi';

export function SharePnCard({
  accessToken,
  pnIdentifier,
  nickname
}: {
  accessToken: string | null;
  pnIdentifier: string | null;
  nickname?: string;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedQr, setCopiedQr] = useState(false);
  const [qrCopyError, setQrCopyError] = useState<string | null>(null);

  const shareUrl = useMemo(() => {
    if (!pnIdentifier) return null;
    return buildMessagingConnectUrl(messagingAppOrigin(), pnIdentifier);
  }, [pnIdentifier]);

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
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      /* ignore */
    }
  }

  async function copyQr() {
    setQrCopyError(null);
    if (!qrDataUrl) return;
    try {
      const res = await fetch(qrDataUrl);
      const blob = await res.blob();
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        setCopiedQr(true);
        window.setTimeout(() => setCopiedQr(false), 2000);
        return;
      }
      setQrCopyError('QR copy is not supported in this browser. Use Copy link.');
    } catch {
      setQrCopyError('Could not copy QR. Use Copy link.');
    }
  }

  if (!accessToken || !pnIdentifier || !shareUrl) return null;

  return (
    <div className="mt-4 w-full max-w-sm rounded-xl border border-border bg-modal-bg p-4 text-left shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Share pN</p>
      <p className="mt-1 text-sm text-text-primary break-all">{shareUrl}</p>
      <div className="mt-3 flex flex-col items-center gap-3 rounded-lg bg-bg-primary p-4">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="QR code for your connect link"
            className="rounded-md border border-border bg-white p-2"
            width={200}
            height={200}
          />
        ) : null}
        <div className="text-center">
          <p className="text-sm font-medium text-text-primary">{nickname || 'Your pN'}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => void copyLink()}
          className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-bg-primary hover:opacity-90 sm:flex-1"
        >
          {copiedLink ? 'Copied' : 'Copy link'}
        </button>
        <button
          type="button"
          onClick={() => void copyQr()}
          disabled={!qrDataUrl}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-primary hover:bg-bg-primary disabled:opacity-50 sm:flex-1"
        >
          {copiedQr ? 'Copied' : 'Copy QR'}
        </button>
      </div>
      {qrCopyError ? (
        <p className="mt-2 text-[11px] text-amber-600">{qrCopyError}</p>
      ) : null}
      <p className="mt-2 text-[11px] text-text-secondary">
        Opens messaging — others can connect without the browse app.
      </p>
    </div>
  );
}
