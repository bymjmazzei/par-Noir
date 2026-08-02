import React, { useEffect, useState } from 'react';
import { Lock, Mail, QrCode } from 'lucide-react';
import type { EncryptedIdentity } from '../../types/crypto';
import type { PredecessorCustodian } from '../../services/identityMigrationOrchestrator';
import { assignCustodianVaultAndIssueCredential } from '../../services/recoveryCustodianSetup';
import { fetchRecoveryCustodianSummary } from '../../services/recoveryApiService';
import { buildCustodianInvitationPayload } from '@par-noir/recovery-crypto';

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
  unrevokable: boolean;
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
  const [protectedCount, setProtectedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQr, setLastQr] = useState<string | null>(null);
  const [pendingShareCount, setPendingShareCount] = useState<number | null>(null);
  const [form, setForm] = useState<InvitedCustodian>({
    custodianId: '',
    name: '',
    contactType: 'email',
    contactValue: '',
    type: 'person',
    unrevokable: true,
  });

  const canContinue = invitedCount >= recoveryThreshold;

  useEffect(() => {
    void fetchRecoveryCustodianSummary(successorPnIdentifier, authToken).then((summary) => {
      setPendingShareCount(summary?.pending.length ?? null);
    });
  }, [successorPnIdentifier, authToken, invitedCount]);

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
        apiToken: authToken,
        userPnIdentifier: successorPnIdentifier,
        unrevokable: custodian.unrevokable,
      });

      const deepLink = buildCustodianInvitationPayload({
        invitationId,
        custodianId,
        custodianName: custodian.name,
        custodianType: custodian.type,
        contactType: custodian.contactType,
        contactValue: custodian.contactValue,
        identityPublicKey: successorEncryptedIdentity.publicKey,
        shareIndex: vault.shareIndex,
        custodianshipZkp: vault.custodianshipZkp,
        unrevokable: custodian.unrevokable,
      });
      const encoded = encodeURIComponent(JSON.stringify(deepLink));
      setLastQr(`${window.location.origin}${window.location.pathname}?custodian-invitation=${encoded}`);
      setInvitedCount((n) => n + 1);
      if (custodian.unrevokable) setProtectedCount((n) => n + 1);
      void fetchRecoveryCustodianSummary(successorPnIdentifier, authToken).then((summary) => {
        setPendingShareCount(summary?.pending.length ?? null);
      });
      void migrationId;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invitation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-secondary">
        Send recovery invitations bound to your new identity. Recovery requires at least one protected custodian
        and {recoveryThreshold} of {recoveryTotalShares} invitations sent ({invitedCount}/{recoveryThreshold} sent,
        {protectedCount} protected).
        {pendingShareCount != null && (
          <span className="block mt-1">{pendingShareCount} share(s) still unassigned in the vault pool.</span>
        )}
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
                  unrevokable: false,
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
        <select
          className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
          value={form.type}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              type: e.target.value as InvitedCustodian['type'],
              unrevokable: e.target.value === 'self' ? true : f.unrevokable,
            }))
          }
        >
          <option value="person">Person</option>
          <option value="self">Self (your alt pN)</option>
          <option value="service">Service</option>
        </select>
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
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={form.unrevokable}
            onChange={(e) => setForm((f) => ({ ...f, unrevokable: e.target.checked }))}
          />
          <Lock className="w-3 h-3" />
          Protected custodian (cannot be revoked)
        </label>
        <button
          type="button"
          disabled={busy || !form.name.trim()}
          className="px-3 py-2 bg-primary text-bg-primary rounded text-sm flex items-center gap-2"
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
        className="px-4 py-2 bg-primary text-bg-primary rounded-lg text-sm disabled:opacity-50"
        onClick={onComplete}
      >
        Continue ({invitedCount}/{recoveryThreshold} invitations sent)
      </button>
    </div>
  );
};
