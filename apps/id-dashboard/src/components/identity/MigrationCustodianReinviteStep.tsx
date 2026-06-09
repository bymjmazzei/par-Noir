import React, { useState } from 'react';
import { Mail, QrCode } from 'lucide-react';
import type { EncryptedIdentity } from '../../types/crypto';
import type { PredecessorCustodian } from '../../services/identityMigrationOrchestrator';
import { assignCustodianVaultAndIssueCredential } from '../../services/recoveryCustodianSetup';
import { batchRecoveryCustodians } from '../../services/identityMigrationApi';

interface MigrationCustodianReinviteStepProps {
  authToken: string;
  migrationId: string;
  successorPnIdentifier: string;
  successorDid: string;
  successorEncryptedIdentity: EncryptedIdentity;
  predecessorCustodians: PredecessorCustodian[];
  recoveryThreshold: number;
  recoveryTotalShares: number;
  onComplete: () => void;
}

interface InvitedCustodian {
  custodianId: string;
  name: string;
  contactType: 'email' | 'phone';
  contactValue: string;
  type: 'person' | 'service' | 'self';
}

export const MigrationCustodianReinviteStep: React.FC<MigrationCustodianReinviteStepProps> = ({
  authToken,
  migrationId,
  successorPnIdentifier,
  successorDid,
  successorEncryptedIdentity,
  predecessorCustodians,
  recoveryThreshold,
  recoveryTotalShares,
  onComplete,
}) => {
  const [invitedCount, setInvitedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQr, setLastQr] = useState<string | null>(null);
  const [form, setForm] = useState<InvitedCustodian>({
    custodianId: '',
    name: '',
    contactType: 'email',
    contactValue: '',
    type: 'person',
  });

  const canContinue = invitedCount >= recoveryThreshold;

  const sendInvitation = async (custodian: InvitedCustodian) => {
    setBusy(true);
    setError(null);
    try {
      const custodianId = custodian.custodianId || `cust_${Date.now()}`;
      const invitationId = `inv-mig-${Date.now()}`;
      const vault = await assignCustodianVaultAndIssueCredential({
        custodianId,
        custodianName: custodian.name,
        custodianType: custodian.type,
        identityId: successorDid,
        encryptedIdentity: successorEncryptedIdentity,
        invitationId,
        threshold: recoveryThreshold,
        apiToken: undefined,
      });

      await batchRecoveryCustodians(authToken, migrationId, successorPnIdentifier, [
        {
          custodianId,
          name: custodian.name,
          custodianType: custodian.type,
          shareIndex: vault.shareIndex,
          encryptedShare: vault.encryptedShare,
          custodianshipCredential: vault.custodianshipZkp,
          status: 'active',
        },
      ]);

      const deepLink = {
        invitationId,
        custodianId,
        custodianName: custodian.name,
        custodianType: custodian.type,
        contactType: custodian.contactType,
        contactValue: custodian.contactValue,
        identityPublicKey: successorEncryptedIdentity.publicKey,
        shareIndex: vault.shareIndex,
        custodianshipZkp: vault.custodianshipZkp,
      };
      const encoded = encodeURIComponent(JSON.stringify(deepLink));
      setLastQr(`${window.location.origin}${window.location.pathname}?custodian-invitation=${encoded}`);
      setInvitedCount((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invitation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-secondary">
        Send recovery invitations bound to your new identity. Recovery is not operational until custodians
        accept on their devices. You need at least {recoveryThreshold} of {recoveryTotalShares} custodians
        invited ({invitedCount}/{recoveryThreshold} sent).
      </p>

      {predecessorCustodians.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-text-primary">Previous custodians</p>
          {predecessorCustodians.map((c) => (
            <button
              key={c.custodianId}
              type="button"
              disabled={busy}
              className="w-full text-left px-3 py-2 rounded border border-border text-sm hover:bg-secondary"
              onClick={() =>
                void sendInvitation({
                  custodianId: c.custodianId,
                  name: c.name,
                  contactType: 'email',
                  contactValue: '',
                  type: (c.custodianType as InvitedCustodian['type']) || 'person',
                })
              }
            >
              Re-invite {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2 border border-border rounded-lg p-3">
        <p className="text-sm font-medium">Add custodian</p>
        <input
          className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
          placeholder="Email or phone"
          value={form.contactValue}
          onChange={(e) => setForm((f) => ({ ...f, contactValue: e.target.value }))}
        />
        <button
          type="button"
          disabled={busy || !form.name.trim()}
          className="px-3 py-2 bg-primary text-white rounded text-sm flex items-center gap-2"
          onClick={() => void sendInvitation(form)}
        >
          <Mail className="w-4 h-4" />
          Send invitation
        </button>
      </div>

      {lastQr && (
        <div className="text-xs break-all bg-secondary p-2 rounded flex gap-2 items-start">
          <QrCode className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Share this link with the custodian: {lastQr}</span>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        type="button"
        disabled={!canContinue || busy}
        className="px-4 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-50"
        onClick={onComplete}
      >
        Continue ({invitedCount}/{recoveryThreshold} invitations sent)
      </button>
    </div>
  );
};
