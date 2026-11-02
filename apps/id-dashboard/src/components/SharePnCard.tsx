import React, { useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Send, QrCode, Link2 } from 'lucide-react';
import { buildMessagingConnectUrl } from '@par-noir/social-connections';
import { pnShortLabel } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import { messagingAppOrigin } from '../services/publicNamesApi';

const iconButtonClass =
  'flex h-9 w-9 items-center justify-center rounded-md border border-border text-text-primary hover:bg-bg-primary transition-colors';

export function SharePnCard({
  accessToken,
  pnIdentifier,
  nickname
}: {
  accessToken: string | null;
  pnIdentifier: string | null;
  nickname?: string;
}) {
  const [status, setStatus] = useState<string | null>(null);

  const shareUrl = useMemo(() => {
    if (!pnIdentifier) return null;
    return buildMessagingConnectUrl(messagingAppOrigin(), pnIdentifier);
  }, [pnIdentifier]);

  function flash(message: string) {
    setStatus(message);
    window.setTimeout(() => setStatus(null), 2000);
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      flash('Link copied');
    } catch {
      flash('Could not copy link');
    }
  }

  async function shareLink() {
    if (!shareUrl) return;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: nickname || (pnIdentifier ? pnShortLabel(pnIdentifier) : 'My pN'), url: shareUrl });
        return;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
      }
    }
    await copyLink();
  }

  async function downloadQr() {
    if (!shareUrl || !pnIdentifier) return;
    try {
      const dataUrl = await QRCode.toDataURL(shareUrl, { margin: 2, width: 512 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${pnShortLabel(pnIdentifier)}-qr.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      flash('Could not create QR code');
    }
  }

  if (!accessToken || !pnIdentifier || !shareUrl) return null;

  return (
    <div className="flex items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => void copyLink()}
        className={iconButtonClass}
        title="Copy pN link"
        aria-label="Copy pN link"
      >
        <Link2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => void shareLink()}
        className={iconButtonClass}
        title="Share pN link"
        aria-label="Share pN link"
      >
        <Send className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => void downloadQr()}
        className={iconButtonClass}
        title="Download QR code"
        aria-label="Download QR code"
      >
        <QrCode className="h-4 w-4" />
      </button>
      {status ? <span className="text-xs text-text-secondary">{status}</span> : null}
    </div>
  );
}
