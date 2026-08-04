import React from 'react';
import type { RecoveryCustodianSummary } from '../../services/recoveryApiService';

export interface CustodianListProps {
  summary: RecoveryCustodianSummary;
  canManage: boolean;
  mutationAllowed: boolean;
  disabledTitle?: string;
  onAdd: () => void;
  onSendInvitation: (custodianId: string, name: string) => void;
  onRemove: (custodianId: string) => void;
}

export const CustodianList: React.FC<CustodianListProps> = ({
  summary,
  canManage,
  mutationAllowed,
  disabledTitle,
  onAdd,
  onSendInvitation,
  onRemove,
}) => {
  const rows = summary.custodians;
  return (
    <div className="bg-secondary p-4 rounded-lg space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-medium text-text-primary">Custodians</h4>
        <button
          type="button"
          onClick={onAdd}
          disabled={rows.length >= 5 || !canManage || !mutationAllowed}
          title={disabledTitle}
          className="px-3 py-1 modal-button rounded-md disabled:opacity-50 text-sm"
        >
          Add ({rows.length}/5)
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-text-secondary text-center py-2">No custodians yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li
              key={c.custodianId}
              className="flex items-center justify-between gap-2 p-3 bg-input-bg rounded border border-border"
            >
              <div>
                <div className="font-medium text-sm text-text-primary flex items-center gap-2">
                  {c.name}
                  {c.unrevokable && (
                    <span className="text-xs text-primary" title="Protected">
                      protected
                    </span>
                  )}
                </div>
                <div className="text-xs text-text-secondary">
                  {c.status} · share #{c.shareIndex}
                  {c.custodianPnIdentifier ? ` · ${c.custodianPnIdentifier}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.status === 'invited' && (
                  <button
                    type="button"
                    onClick={() => onSendInvitation(c.custodianId, c.name)}
                    disabled={!canManage || !mutationAllowed}
                    className="text-sm text-blue-500 disabled:opacity-50"
                  >
                    Resend
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(c.custodianId)}
                  disabled={c.unrevokable || !canManage || !mutationAllowed}
                  title={c.unrevokable ? 'Protected custodians cannot be revoked' : disabledTitle}
                  className={`text-sm ${c.unrevokable ? 'text-gray-400 cursor-not-allowed' : 'text-red-500'}`}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {(summary.counts.acceptedUnrevokable ?? 0) < 1 && (
        <p className="text-xs text-yellow-500">
          Add and accept at least one protected custodian (e.g. an alt pN you control) before recovery
          can complete.
        </p>
      )}
    </div>
  );
};
