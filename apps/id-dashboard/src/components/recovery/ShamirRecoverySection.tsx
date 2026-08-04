import React from 'react';
import { AlertTriangle, CheckCircle, Lock } from 'lucide-react';
import { SectionInfo } from '../common/SectionInfo';
import { useRecoveryAuth } from '../../contexts/RecoveryAuthContext';
import { RecoveryAuthGate } from './RecoveryAuthGate';
import { RecoveryVaultSetupPanel } from './RecoveryVaultSetupPanel';
import { CustodianList } from './CustodianList';
import { resolveRecoverySetupPhase } from './recoverySetupPhase';
import type { RecoveryCustodianSummary } from '../../services/recoveryApiService';
import { recoveryAuthRequiredMessage } from '../../services/recoveryAuthSession';

export interface ShamirRecoverySectionProps {
  apiToken: string | null;
  userPnIdentifier: string | null;
  authenticatedUser: { id: string; publicKey?: string } | null;
  loadEncryptedIdentity: (
    identityPublicKeyOrId: string
  ) => Promise<{ encryptedData: string; iv: string; salt: string } | null>;
  canCustodiansRead: boolean;
  canManageCustodians: boolean;
  recoveryMutationAllowed: boolean;
  vaultRecoveryReady: boolean;
  recoveryThreshold: number;
  setRecoveryThreshold: (n: number) => void;
  recoveryVaultSummary: RecoveryCustodianSummary | null;
  hasKeyedDevices: boolean;
  deviceRequiredMessage: string;
  onAuthChange: () => void;
  onSeeded: () => void;
  onAddCustodian: () => void;
  onSendInvitation: (custodianId: string, name: string) => void;
  onRemoveCustodian: (custodianId: string) => void;
  setError: (msg: string | null) => void;
}

export const ShamirRecoverySection: React.FC<ShamirRecoverySectionProps> = ({
  apiToken,
  userPnIdentifier,
  authenticatedUser,
  loadEncryptedIdentity,
  canCustodiansRead,
  canManageCustodians,
  recoveryMutationAllowed,
  vaultRecoveryReady,
  recoveryThreshold,
  setRecoveryThreshold,
  recoveryVaultSummary,
  hasKeyedDevices,
  deviceRequiredMessage,
  onAuthChange,
  onSeeded,
  onAddCustodian,
  onSendInvitation,
  onRemoveCustodian,
  setError,
}) => {
  const { isAuthenticated } = useRecoveryAuth();
  const pending = recoveryVaultSummary?.pending?.length ?? 0;
  const invited = recoveryVaultSummary?.counts.invited ?? 0;
  const accepted = recoveryVaultSummary?.counts.accepted ?? 0;
  const phase = resolveRecoverySetupPhase({
    recoveryAuthUnlocked: isAuthenticated,
    vaultRecoveryReady,
    pendingShareCount: pending,
    invitedCount: invited,
    acceptedCount: accepted,
  });

  const disabledTitle = !recoveryMutationAllowed
    ? recoveryAuthRequiredMessage()
    : !canManageCustodians
      ? deviceRequiredMessage
      : undefined;

  const guardAdd = () => {
    if (!recoveryMutationAllowed) {
      setError(recoveryAuthRequiredMessage());
      setTimeout(() => setError(null), 9000);
      return;
    }
    if (!canManageCustodians) {
      setError(deviceRequiredMessage);
      setTimeout(() => setError(null), 9000);
      return;
    }
    onAddCustodian();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold text-text-primary">Recovery</h3>
        <SectionInfo title="Recovery">
          <p>
            Shamir custodians protect your identity. Seed the vault, then invite trusted people (including
            one protected custodian).
          </p>
        </SectionInfo>
      </div>

      <RecoveryAuthGate
        expectedUser={authenticatedUser}
        loadEncryptedIdentity={loadEncryptedIdentity}
        onAuthenticated={onAuthChange}
        onLocked={onAuthChange}
      />

      {phase === 'auth_required' && (
        <p className="text-sm text-text-secondary">Unlock above to set up recovery custodians.</p>
      )}

      {phase === 'needs_seed' && (
        <RecoveryVaultSetupPanel
          apiToken={apiToken}
          userPnIdentifier={userPnIdentifier}
          canCustodiansRead={canCustodiansRead}
          pendingShareCount={pending}
          onSeeded={onSeeded}
        />
      )}

      {(phase === 'needs_custodians' || phase === 'managing' || phase === 'ready') && (
        <>
          <div className="bg-secondary p-4 rounded-lg space-y-3">
            {phase === 'ready' ? (
              <div className="flex items-start gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-green-400">Recovery ready</p>
                  <p className="text-text-secondary">
                    {accepted} accepted custodian
                    {accepted === 1 ? '' : 's'} ({recoveryVaultSummary?.counts.acceptedUnrevokable ?? 0}{' '}
                    protected). Threshold: {recoveryThreshold}.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-400">Recovery not ready</p>
                  <p className="text-text-secondary">
                    Need {recoveryThreshold} accepted custodians and at least 1 protected. Current:{' '}
                    {accepted} accepted, {recoveryVaultSummary?.counts.acceptedUnrevokable ?? 0}{' '}
                    protected
                    {invited > 0 ? `, ${invited} invited` : ''}.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <label className="text-sm text-text-secondary shrink-0">Approvals needed</label>
              <select
                value={recoveryThreshold}
                onChange={(e) => setRecoveryThreshold(parseInt(e.target.value, 10))}
                disabled={!recoveryMutationAllowed || phase === 'ready'}
                title={!recoveryMutationAllowed ? recoveryAuthRequiredMessage() : undefined}
                className="flex-1 px-3 py-1 border border-input-border bg-input-bg rounded-md text-sm disabled:opacity-50"
              >
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={5}>5</option>
              </select>
            </div>

            {phase === 'needs_custodians' && (
              <button
                type="button"
                onClick={guardAdd}
                disabled={!canManageCustodians || !recoveryMutationAllowed}
                title={disabledTitle}
                className="w-full px-4 py-2 modal-button rounded-md text-sm disabled:opacity-50"
              >
                Add your first custodian
              </button>
            )}
          </div>

          {canCustodiansRead && recoveryVaultSummary && phase !== 'needs_custodians' && (
            <CustodianList
              summary={recoveryVaultSummary}
              canManage={canManageCustodians}
              mutationAllowed={recoveryMutationAllowed}
              disabledTitle={disabledTitle}
              onAdd={guardAdd}
              onSendInvitation={(id, name) => onSendInvitation(id, name)}
              onRemove={onRemoveCustodian}
            />
          )}

          {phase === 'needs_custodians' && canCustodiansRead && recoveryVaultSummary && (
            <CustodianList
              summary={recoveryVaultSummary}
              canManage={canManageCustodians}
              mutationAllowed={recoveryMutationAllowed}
              disabledTitle={disabledTitle}
              onAdd={guardAdd}
              onSendInvitation={(id, name) => onSendInvitation(id, name)}
              onRemove={onRemoveCustodian}
            />
          )}
        </>
      )}

      {!canCustodiansRead && hasKeyedDevices && (
        <div className="bg-secondary p-4 rounded-lg flex items-start gap-3">
          <Lock className="w-5 h-5 text-text-secondary shrink-0 mt-0.5" />
          <p className="text-sm text-text-secondary">{deviceRequiredMessage}</p>
        </div>
      )}
    </div>
  );
};
