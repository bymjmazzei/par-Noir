import React, { useCallback } from 'react';
import { DeviceManagementPanel } from '../DeviceManagementPanel';
import { RecoveryAuthProvider } from '../../contexts/RecoveryAuthContext';
import { ShamirRecoverySection } from './ShamirRecoverySection';
import { RecoveryKeyFailsafeSection } from './RecoveryKeyFailsafeSection';
import { RecoveryIdentityRotationSection } from './RecoveryAdvancedSection';
import { RecoveryCustodianPendingPanel } from './RecoveryCustodianPendingPanel';
import type { RecoveryCustodianSummary } from '../../services/recoveryApiService';
import type { RecoveryRequest } from '../../types/app';

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

  const refreshRecoveryVaultCb = useCallback(() => {
    void refreshRecoveryVault();
  }, [refreshRecoveryVault]);

  const onSendInvitation = (custodianId: string, name: string) => {
    setSelectedCustodianForInvitation({ id: custodianId, name });
    setShowSendInvitationModal(true);
  };

  return (
    <div className="space-y-8">
      <DeviceManagementPanel
        authToken={apiToken ?? undefined}
        pnIdentifier={recoveryVaultPnId ?? undefined}
        sessionId={authenticatedUser?.id ?? undefined}
        ownerPublicKey={authenticatedUser?.publicKey ?? undefined}
        deviceAuth={deviceAuth}
      />

      <RecoveryAuthProvider onSessionChange={bumpRecoveryAuthUi}>
        <ShamirRecoverySection
          apiToken={apiToken}
          userPnIdentifier={recoveryVaultPnId}
          authenticatedUser={
            authenticatedUser
              ? { id: authenticatedUser.id, publicKey: authenticatedUser.publicKey }
              : null
          }
          canCustodiansRead={canCustodiansRead}
          canManageCustodians={canManageCustodians}
          recoveryMutationAllowed={recoveryMutationAllowed}
          vaultRecoveryReady={vaultRecoveryReady}
          recoveryThreshold={recoveryThreshold}
          setRecoveryThreshold={setRecoveryThreshold}
          recoveryVaultSummary={recoveryVaultSummary}
          hasKeyedDevices={!!deviceAuth?.hasKeyedDevices}
          deviceRequiredMessage={deviceAuth?.deviceRequiredMessage || 'Keyed device required'}
          onSummaryChanged={refreshRecoveryVaultCb}
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

        <RecoveryIdentityRotationSection
          authenticatedUser={authenticatedUser}
          apiToken={apiToken}
          canRotateIdentity={canRotateIdentity}
          hasKeyedDevices={!!deviceAuth?.hasKeyedDevices}
          deviceRequiredMessage={deviceAuth?.deviceRequiredMessage}
        />
      </RecoveryAuthProvider>

      {authenticatedUser && (
        <RecoveryCustodianPendingPanel
          apiToken={apiToken}
          custodianPn={recoveryVaultPnId}
          custodianIdentityId={authenticatedUser.id ?? null}
          custodianPublicKey={authenticatedUser.publicKey ?? null}
          onReview={(relay) => {
            const cs = custodianships.find((c: any) => c.identityPublicKey === relay.ownerPublicKey);
            setSelectedCustodianship(
              cs ?? {
                id: `custodianship-${relay.custodianId}`,
                identityId: relay.ownerPublicKey,
                identityName: 'pN you protect',
                identityUsername: '',
                identityPublicKey: relay.ownerPublicKey,
                status: 'active',
                canApprove: true,
              }
            );
            const request: RecoveryRequest = {
              id: relay.requestId,
              requestingDid: relay.ownerPublicKey,
              requestingUser: relay.claimantContact || 'Recovery claimant',
              timestamp: relay.createdAt,
              status: 'pending',
              approvals: [],
              denials: [],
              signatures: [],
              expiresAt: relay.expiresAt,
              requiredApprovals: relay.threshold,
              currentApprovals: relay.approvalCount,
              oldIdentityHash: relay.ownerPublicKey,
              relay,
            };
            setRecoveryRequests((prev) => [...prev.filter((r) => r.id !== request.id), request]);
            setSelectedRecoveryRequest(request);
            setShowCustodianApprovalModal(true);
          }}
        />
      )}
    </div>
  );
};
