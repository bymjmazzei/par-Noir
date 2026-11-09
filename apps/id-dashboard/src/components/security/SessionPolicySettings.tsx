import { useEffect, useState } from 'react';
import {
  fetchSessionPolicy,
  idleOptionLabel,
  saveSessionPolicy,
  IDLE_MINUTE_OPTIONS,
  type SessionPolicy,
} from '@par-noir/oauth-ui';
import { API_ENDPOINT } from '../../config/api';
import { dashboardSession } from '../../services/parNoirOAuthInline';

const TRUSTED = 'trusted';

/** Idle lock for this pN across every par Noir app. Applies to other apps on their next token refresh. */
export function SessionPolicySettings() {
  const [policy, setPolicy] = useState<SessionPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const accessToken = await dashboardSession.getAccessToken();
      if (!accessToken) return;
      const loaded = await fetchSessionPolicy({ apiEndpoint: API_ENDPOINT, accessToken }).catch(() => null);
      if (!cancelled && loaded) setPolicy(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onChange = async (value: string) => {
    const accessToken = await dashboardSession.getAccessToken();
    if (!accessToken || !policy) return;
    const trustedDevice = value === TRUSTED;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveSessionPolicy({
        apiEndpoint: API_ENDPOINT,
        accessToken,
        idleMinutes: trustedDevice ? policy.idleMinutes : Number(value),
        trustedDevice,
      });
      setPolicy(saved);
      dashboardSession.update({ idleTimeoutS: saved.idleTimeoutS });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <span className="text-text-primary font-medium">Lock after inactivity</span>
        <p className="text-xs text-text-secondary">
          Applies to every par Noir app on this pN. Trusted device stays unlocked until you lock or close the tab.
        </p>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
      <select
        aria-label="Lock after inactivity"
        value={policy ? (policy.trustedDevice ? TRUSTED : String(policy.idleMinutes)) : ''}
        disabled={!policy || saving}
        onChange={(e) => void onChange(e.target.value)}
        className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-transparent"
      >
        {!policy && <option value="">Loading…</option>}
        {IDLE_MINUTE_OPTIONS.map((m) => (
          <option key={m} value={String(m)}>
            {idleOptionLabel(m)}
          </option>
        ))}
        <option value={TRUSTED}>Trusted device</option>
      </select>
    </div>
  );
}
