import React, { useCallback, useEffect, useState } from 'react';
import { Bot, ChevronDown } from 'lucide-react';
import { AI_SCOPE_LABELS, isKnownAiScope } from '@par-noir/standard-data-points';
import { fetchAiAgents, revokeAllAiAgents, type AiAgentDto } from '../../services/ownedAssetsApi';

interface AiAgentsPrivacyRowProps {
  accessToken: string | null | undefined;
  pnIdentifier: string | null | undefined;
}

/** AI agents the API honors right now, with one control that cuts all of them. */
export const AiAgentsPrivacyRow: React.FC<AiAgentsPrivacyRowProps> = ({ accessToken, pnIdentifier }) => {
  const [expanded, setExpanded] = useState(false);
  const [agents, setAgents] = useState<AiAgentDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !pnIdentifier) return;
    try {
      setAgents(await fetchAiAgents(accessToken, pnIdentifier));
    } catch {
      setMessage('Could not load AI agents.');
    }
  }, [accessToken, pnIdentifier]);

  useEffect(() => {
    if (expanded) void load();
  }, [expanded, load]);

  const revokeAll = async () => {
    if (!accessToken || !pnIdentifier) return;
    if (!confirm('Revoke every AI agent? Their access stops immediately.')) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await revokeAllAiAgents(accessToken, pnIdentifier);
      setMessage(
        result.sheetSynced
          ? `Revoked ${result.revoked} AI agent${result.revoked === 1 ? '' : 's'}.`
          : 'Access revoked. Reconnect Google Drive to update the Sub-pN list.'
      );
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Revoke failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-secondary rounded-lg mb-6">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full p-6 flex items-center justify-between hover:bg-border transition-colors"
      >
        <h4 className="font-medium text-text-primary flex items-center gap-2">
          <Bot className="w-5 h-5" />
          AI agents
        </h4>
        <ChevronDown className={`w-5 h-5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="px-6 pb-6 space-y-3">
          {agents.length === 0 ? (
            <p className="text-sm text-text-secondary">No AI agents. Add one in the Sub-pN tab.</p>
          ) : (
            <ul className="space-y-2">
              {agents.map((a) => (
                <li key={a.id} className="border border-border rounded-lg p-3">
                  <p className="font-medium text-text-primary">{a.label || 'AI agent'}</p>
                  <p className="text-xs text-text-secondary">
                    {a.scopes.filter(isKnownAiScope).map((s) => AI_SCOPE_LABELS[s]).join(' · ') || 'No access'}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => void revokeAll()}
            disabled={busy || agents.length === 0 || !accessToken}
            className="px-3 py-2 text-sm text-red-400 border border-red-800/60 rounded hover:bg-red-900/20 disabled:opacity-50"
          >
            Revoke all AI agents
          </button>
          {message && <p className="text-xs text-text-secondary">{message}</p>}
        </div>
      )}
    </div>
  );
};
