import React from 'react';
import { DeviceManagementPanel } from '../DeviceManagementPanel';
import { RecoveryAuthProvider } from '../../contexts/RecoveryAuthContext';
import { ShamirRecoverySection } from './ShamirRecoverySection';
import { RecoveryKeyFailsafeSection } from './RecoveryKeyFailsafeSection';
import { RecoveryAdvancedSection } from './RecoveryAdvancedSection';
import { RecoveryCustodianPendingPanel } from './RecoveryCustodianPendingPanel';
import type { RecoveryCustodianSummary } from '../../services/recoveryApiService';

export interface RecoveryTabProps {
  apiToken: string | null;
  recoveryVaultPnId: string | null;
  authenticatedUser: any;
  deviceAuth: any;
  canRotateIdentity: boolean;
  canCustodiansRead: boolean;
  canManageCustodians: boolean;
  recoveryVaultSummary: RecoveryCustodianSummary | null;
  vaultRecoveryReady: boolean;
  recoveryThreshold: number;
  setRecoveryThreshold: (n: number) => void;
  recoveryMutationAllowed: boolean;
  recoveryKeys: any[];
  custodianships: any[];
  recoveryRequests: any[];
  setError: (msg: string | null) => void;
  setShowAddCustodianModal: (v: boolean) => void;
  setSelectedCustodianForInvitation: (c: any) => void;
  setShowSendInvitationModal: (v: boolean) => void;
  setShowRecoveryKeyModal: (v: boolean) => void;
  setSelectedCustodianship: (c: any) => void;
  setSelectedRecoveryRequest: (r: any) => void;
  setShowCustodianApprovalModal: (v: boolean) => void;
  setRecoveryRequests: React.Dispatch<React.SetStateAction<any[]>>;
  bumpRecoveryAuthUi: () => void;
  refreshRecoveryVault: () => void | Promise<void>;
  handleRemoveCustodian: (id: string) => void;
  handleOpenCustodianApprovalModal: (cs: any) => void;
}

export const RecoveryTab: React.FC<RecoveryTabProps> = (props) => {
  const {
    apiToken,
    recoveryVaultPnId,
    authenticatedUser,
    deviceAuth,
    canRotateIdentity,
    canCustodiansRead,
    canManageCustodians,
    recoveryVaultSummary,
    vaultRecoveryReady,
    recoveryThreshold,
    setRecoveryThreshold,
    recoveryMutationAllowed,
    recoveryKeys,
    custodianships,
    recoveryRequests,
    setError,
    setShowAddCustodianModal,
    setSelectedCustodianForInvitation,
    setShowSendInvitationModal,
    setShowRecoveryKeyModal,
    setSelectedCustodianship,
    setSelectedRecoveryRequest,
    setShowCustodianApprovalModal,
    setRecoveryRequests,
    bumpRecoveryAuthUi,
    refreshRecoveryVault,
    handleRemoveCustodian,
    handleOpenCustodianApprovalModal,
  } = props;

  const onSendInvitation = (custodianId: string, name: string) => {
    setSelectedCustodianForInvitation({ id: custodianId, name });
    setShowSendInvitationModal(true);
  };

  const showActingAs =
    (custodianships?.length ?? 0) > 0 ||
    (recoveryRequests?.some((r: any) => r.status === 'pending') ?? false);

  return (
    <div className="space-y-8">
      <DeviceManagementPanel
        authToken={apiToken ?? undefined}
        pnIdentifier={recoveryVaultPnId ?? undefined}
        sessionId={authenticatedUser?.id ?? undefined}
        ownerPublicKey={authenticatedUser?.publicKey ?? undefined}
        deviceAuth={deviceAuth}
      />

      <RecoveryAuthProvider>
        <ShamirRecoverySection
          apiToken={apiToken}
          userPnIdentifier={recoveryVaultPnId}
          canCustodiansRead={canCustodiansRead}
          canManageCustodians={canManageCustodians}
          recoveryMutationAllowed={recoveryMutationAllowed}
          vaultRecoveryReady={vaultRecoveryReady}
          recoveryThreshold={recoveryThreshold}
          setRecoveryThreshold={setRecoveryThreshold}
          recoveryVaultSummary={recoveryVaultSummary}
          hasKeyedDevices={!!deviceAuth?.hasKeyedDevices}
          deviceRequiredMessage={deviceAuth?.deviceRequiredMessage || 'Keyed device required'}
          onAuthChange={bumpRecoveryAuthUi}
          onSeeded={() => {
            bumpRecoveryAuthUi();
            void refreshRecoveryVault();
          }}
          onAddCustodian={() => setShowAddCustodianModal(true)}
          onSendInvitation={onSendInvitation}
          onRemoveCustodian={handleRemoveCustodian}
          setError={setError}
        />

        <RecoveryKeyFailsafeSection
          apiToken={apiToken}
          userPnIdentifier={recoveryVaultPnId}
          recoveryKeysCount={recoveryKeys?.length ?? 0}
          canCreate={recoveryMutationAllowed && canManageCustodians}
          onCreate={() => setShowRecoveryKeyModal(true)}
          disabledReason={
            !recoveryMutationAllowed
              ? 'Unlock recovery first'
              : !canManageCustodians
                ? deviceAuth?.deviceRequiredMessage
                : undefined
          }
        />
      </RecoveryAuthProvider>

      {authenticatedUser && showActingAs && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-text-primary">Acting as custodian</h3>
          <RecoveryCustodianPendingPanel
            authenticatedUser={authenticatedUser}
            custodianships={custodianships}
            onApprove={(requestId, custodianshipId, identityPublicKey) => {
              const cs = custodianships.find((c: any) => c.id === custodianshipId);
              if (cs) {
                setSelectedCustodianship({ ...cs, identityPublicKey });
              }
              const pending = recoveryRequests.find((r: any) => r.id === requestId);
              if (pending) {
                setSelectedRecoveryRequest(pending);
                setShowCustodianApprovalModal(true);
              } else {
                const stub = {
                  id: requestId,
                  requestingDid: identityPublicKey,
                  requestingUser: 'Recovery claimant',
                  timestamp: new Date().toISOString(),
                  status: 'pending',
                  approvals: [],
                  denials: [],
                  signatures: [],
                  proofs: [],
                  expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
                  requiredApprovals: recoveryThreshold,
                  currentApprovals: 0,
                  oldIdentityHash: identityPublicKey,
                };
                setRecoveryRequests((prev) => [...prev, stub]);
                setSelectedRecoveryRequest(stub);
                setShowCustodianApprovalModal(true);
              }
            }}
          />
          {(custodianships?.length ?? 0) > 0 && (
            <div className="bg-secondary p-4 rounded-lg space-y-3">
              <h4 className="font-medium text-text-primary">IDs you are a custodian of</h4>
              {custodianships.map((cs: any) => {
                const pendingRequest = recoveryRequests.find(
                  (r: any) => r.requestingDid === cs.identityId && r.status === 'pending'
                );
                return (
                  <div
                    key={cs.id}
                    className="flex items-center justify-between p-3 bg-input-bg rounded border border-border"
                  >
                    <div className="text-sm text-text-primary">{cs.identityName || cs.identityId}</div>
                    {pendingRequest && (
                      <button
                        type="button"
                        onClick={() => handleOpenCustodianApprovalModal(cs)}
                        className="text-sm modal-button px-3 py-1 rounded"
                      >
                        Recover
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <RecoveryAdvancedSection
        authenticatedUser={authenticatedUser}
        apiToken={apiToken}
        canRotateIdentity={canRotateIdentity}
        hasKeyedDevices={!!deviceAuth?.hasKeyedDevices}
      />
    </div>
  );
};
