import React, { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { getRecoveryAuthSession } from '../../services/recoveryAuthSession';
import {
  hasLegacyRecoveryWorkbook,
  isRecoveryResplitRequired,
  resecureRecovery,
} from '../../services/recoveryResecure';

interface RecoveryResecurePanelProps {
  apiToken: string | null;
  userPnIdentifier: string | null;
  identityId: string | null;
  recoveryThreshold: number;
  canManage: boolean;
  onResecured: () => void;
  setError: (msg: string | null) => void;
}

/** Shown while recovery is unlocked when the old workbook still exists or a revoke left a valid old share. */
export const RecoveryResecurePanel: React.FC<RecoveryResecurePanelProps> = ({
  apiToken,
  userPnIdentifier,
  identityId,
  recoveryThreshold,
  canManage,
  onResecured,
  setError,
}) => {
  const [reason, setReason] = useState<'legacy' | 'revoked' | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!userPnIdentifier) return;
    let cancelled = false;
    void (async () => {
      let next: 'legacy' | 'revoked' | null = isRecoveryResplitRequired(userPnIdentifier) ? 'revoked' : null;
      try {
        if (await hasLegacyRecoveryWorkbook(userPnIdentifier)) next = 'legacy';
      } catch (err) {
        console.warn('[recovery] legacy workbook check failed:', err instanceof Error ? err.message : err);
      }
      if (!cancelled) setReason(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [userPnIdentifier]);

  if (!reason && !done) return null;

  const run = async () => {
    const auth = getRecoveryAuthSession();
    if (!auth || !apiToken || !userPnIdentifier || !identityId) {
      setError('Unlock recovery above first.');
      setTimeout(() => setError(null), 9000);
      return;
    }
    setBusy(true);
    try {
      const { invited } = await resecureRecovery({
        authToken: apiToken,
        pnIdentifier: userPnIdentifier,
        identityId,
        auth,
        threshold: recoveryThreshold,
      });
      setReason(null);
      setDone(
        invited > 0
          ? `Recovery re-secured. ${invited} earlier custodian${invited === 1 ? ' was' : 's were'} re-invited — use Resend to send each their new invitation, then download your updated .pn.`
          : 'Recovery re-secured. Custodians receive their new shares automatically. Download your updated .pn.'
      );
      onResecured();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not re-secure recovery');
      setTimeout(() => setError(null), 9000);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return <p className="text-sm text-green-400 bg-secondary rounded-lg p-3">{done}</p>;
  }

  return (
    <div className="bg-secondary border border-amber-500/50 rounded-lg p-4 space-y-3">
      <div className="flex items-start gap-2">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-amber-300">Re-secure recovery</p>
          <p className="text-text-secondary">
            {reason === 'legacy'
              ? 'This pN was set up with the older recovery system, which kept encrypted shares in a workbook on your Drive. Re-securing creates new shares, moves custodians to the new system, and deletes that workbook.'
              : 'A custodian you removed still holds a working share. Re-securing creates new shares so old ones stop working.'}
          </p>
        </div>
      </div>
      <button
        type="button"
        disabled={busy || !canManage}
        onClick={() => void run()}
        className="px-4 py-2 modal-button rounded-md text-sm disabled:opacity-50"
      >
        {busy ? 'Re-securing…' : 'Re-secure recovery'}
      </button>
    </div>
  );
};
