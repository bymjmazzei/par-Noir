import React, { useState } from 'react';
import { AlertTriangle, KeyRound, Loader2 } from 'lucide-react';
import type { EncryptedIdentity } from '../../types/crypto';
import { IdentityCrypto } from '../../utils/crypto';
import {
  runIdentityMigrationCore,
  finalizeIdentityMigration,
  resumeMigrationAfterDriveAck,
  type MigrationCoreResult,
} from '../../services/identityMigrationOrchestrator';
import { MigrationCustodianReinviteStep } from './MigrationCustodianReinviteStep';
import { fetchOwnedAssets } from '../../services/ownedAssetsApi';
import { summarizeOwnedAssetsByKind } from '../../services/ownedAssetsManifestService';
import { SimpleStorage } from '../../utils/simpleStorage';
import { SecureCredentialManager } from '../../utils/secureCredentialManager';

interface IdentityRotationWizardProps {
  authToken: string;
  identityKey?: string;
  currentDid?: string;
  onComplete?: (newIdentity: EncryptedIdentity) => void;
}

type WizardStep =
  | 'intro'
  | 'unlock_old'
  | 'new_passcode'
  | 'migrating'
  | 'drive_failures'
  | 'custodian_reinvite'
  | 'finalizing'
  | 'subs_verify'
  | 'done';

async function loadStoredIdentity(key: string): Promise<EncryptedIdentity | null> {
  const simple = SimpleStorage.getInstance();
  const stored = await simple.getIdentity(key);
  if (!stored) return null;
  const enc = stored.encryptedData as EncryptedIdentity | undefined;
  if (enc?.encryptedData && enc.publicKey) return enc;
  return null;
}

export const IdentityRotationWizard: React.FC<IdentityRotationWizardProps> = ({
  authToken,
  identityKey,
  currentDid,
  onComplete,
}) => {
  const [storedIdentity, setStoredIdentity] = useState<EncryptedIdentity | null>(null);

  React.useEffect(() => {
    if (!identityKey) return;
    void loadStoredIdentity(identityKey).then(setStoredIdentity);
  }, [identityKey]);

  const [step, setStep] = useState<WizardStep>('intro');
  const [oldPnFile, setOldPnFile] = useState<File | null>(null);
  const [oldPasscode, setOldPasscode] = useState('');
  const [oldPnName, setOldPnName] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [resultIdentity, setResultIdentity] = useState<EncryptedIdentity | null>(null);
  const [coreResult, setCoreResult] = useState<MigrationCoreResult | null>(null);
  const [subsBackupAck, setSubsBackupAck] = useState(false);
  const [subsSummary, setSubsSummary] = useState<Record<string, number>>({});
  const [migrationCtx, setMigrationCtx] = useState<{
    predIdentity: EncryptedIdentity;
    predDid: string;
    pnName: string;
    predPasscode: string;
    rotatedIdentity: EncryptedIdentity;
    successorDid: string;
    recoveryConfig?: { threshold: number; totalShares: number };
  } | null>(null);

  const handleStart = () => {
    setError(null);
    setStep(storedIdentity ? 'new_passcode' : 'unlock_old');
  };

  const handleUnlockOld = async () => {
    setError(null);
    if (!oldPnFile || !oldPasscode || !oldPnName) {
      setError('Provide your current .pn file, pn name, and passcode.');
      return;
    }
    try {
      const text = await oldPnFile.text();
      const fileJson = JSON.parse(text) as { identity?: EncryptedIdentity; encryptedData?: EncryptedIdentity };
      const identity = fileJson.identity || fileJson.encryptedData;
      if (!identity?.encryptedData) throw new Error('Invalid .pn file');
      await IdentityCrypto.decryptData(
        { encrypted: identity.encryptedData, iv: identity.iv, salt: identity.salt },
        oldPnName,
        oldPasscode
      );
      setStep('new_passcode');
    } catch {
      setError('Could not unlock old identity. Check pn name and passcode.');
    }
  };

  const runCore = async (acknowledgeDriveFailures = false) => {
    if (!migrationCtx) return;
    setStep('migrating');
    try {
      const core = await runIdentityMigrationCore({
        authToken,
        predecessor: {
          encryptedIdentity: migrationCtx.predIdentity,
          did: migrationCtx.predDid,
          pnName: migrationCtx.pnName,
          passcode: migrationCtx.predPasscode,
          recoveryConfig: migrationCtx.recoveryConfig,
        },
        successor: {
          encryptedIdentity: migrationCtx.rotatedIdentity,
          did: migrationCtx.successorDid,
          pnName: migrationCtx.pnName,
          passcode: newPasscode,
        },
        acknowledgeDriveFailures,
        onProgress: (label, pct) => {
          setProgressLabel(label);
          setProgressPct(pct);
        },
      });
      setCoreResult(core);
      if (core.driveFilesPendingAck) {
        setStep('drive_failures');
        return;
      }
      setStep('custodian_reinvite');
    } catch (e) {
      if (
        !acknowledgeDriveFailures &&
        e instanceof Error &&
        e.message.includes('Acknowledge to continue')
      ) {
        setStep('drive_failures');
        return;
      }
      setError(e instanceof Error ? e.message : 'Migration failed');
      setStep('new_passcode');
    }
  };

  const handleMigrate = async () => {
    setError(null);
    if (newPasscode.length < 8) {
      setError('New passcode must be at least 8 characters.');
      return;
    }
    if (newPasscode !== confirmPasscode) {
      setError('Passcodes do not match.');
      return;
    }

    try {
      let predIdentity = storedIdentity;
      let predDid = currentDid || '';
      let predPnName = oldPnName;
      let predPasscode = oldPasscode;

      if (!predIdentity && oldPnFile) {
        const text = await oldPnFile.text();
        const fileJson = JSON.parse(text) as { identity?: EncryptedIdentity };
        predIdentity = fileJson.identity ?? null;
        if (!predIdentity?.encryptedData) throw new Error('Invalid .pn file');
        const raw = await IdentityCrypto.decryptData(
          {
            encrypted: predIdentity.encryptedData,
            iv: predIdentity.iv,
            salt: predIdentity.salt,
          },
          oldPnName,
          oldPasscode
        );
        const identityJson = JSON.parse(raw) as { id?: string };
        predDid = identityJson.id || '';
      }

      if (!predIdentity || !predDid) {
        throw new Error('Predecessor identity is required.');
      }

      const creds = currentDid ? SecureCredentialManager.getCredentials(currentDid) : null;
      const pnName = predPnName || creds?.pnName || 'user';
      if (storedIdentity && !predPasscode && creds?.passcode) {
        predPasscode = creds.passcode;
      }
      const predRaw = await IdentityCrypto.decryptData(
        {
          encrypted: predIdentity.encryptedData,
          iv: predIdentity.iv,
          salt: predIdentity.salt,
        },
        pnName,
        predPasscode
      );
      const predData = JSON.parse(predRaw) as {
        nickname?: string;
        recoveryEmail?: string;
        recoveryPhone?: string;
        recoveryConfig?: { threshold: number; totalShares: number };
      };

      const rotated = await IdentityCrypto.prepareRotatedIdentity({
        pnName,
        newPasscode,
        predecessorDecrypted: predData,
      });

      const successorDid = (
        JSON.parse(
          await IdentityCrypto.decryptData(
            {
              encrypted: rotated.identity.encryptedData,
              iv: rotated.identity.iv,
              salt: rotated.identity.salt,
            },
            pnName,
            newPasscode
          )
        ) as { id: string }
      ).id;

      setMigrationCtx({
        predIdentity,
        predDid,
        pnName,
        predPasscode,
        rotatedIdentity: rotated.identity,
        successorDid,
        recoveryConfig: predData.recoveryConfig,
      });

      await runCore(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Migration failed');
      setStep('new_passcode');
    }
  };

  const handleCustodianComplete = async () => {
    if (!coreResult) return;
    setStep('finalizing');
    try {
      const fin = await finalizeIdentityMigration({
        authToken,
        migrationId: coreResult.migrationId,
        predecessor: coreResult.predMat,
        successor: coreResult.succMat,
        successorEncryptedIdentity: coreResult.successorEncryptedIdentity,
        driveFolderId: coreResult.startDriveFolderId,
        onProgress: (label, pct) => {
          setProgressLabel(label);
          setProgressPct(pct);
        },
      });
      setResultIdentity(fin.successorEncryptedIdentity);
      try {
        const assets = await fetchOwnedAssets(authToken);
        setSubsSummary(summarizeOwnedAssetsByKind(assets));
      } catch {
        setSubsSummary({});
      }
      setStep('subs_verify');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to finalize migration');
      setStep('custodian_reinvite');
    }
  };

  const downloadNewPn = () => {
    if (!resultIdentity) return;
    const blob = new Blob([JSON.stringify({ identity: resultIdentity }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rotated-identity.pn';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="bg-secondary rounded-lg p-6 space-y-4 border border-border">
      <div className="flex items-center gap-2">
        <KeyRound className="w-5 h-5 text-text-primary" />
        <h4 className="font-medium text-text-primary">Rotate identity (new keys)</h4>
      </div>
      <p className="text-xs text-text-secondary">
        Re-key your pN after compromise or estate succession. This preserves your Drive folder, re-issues
        ZKPs, rebuilds recovery, and registers network succession. Distinct from Shamir passcode recovery.
      </p>

      {step === 'intro' && (
        <button
          type="button"
          className="px-4 py-2 bg-primary text-bg-primary rounded-lg text-sm"
          onClick={handleStart}
        >
          Start rotation
        </button>
      )}

      {step === 'unlock_old' && (
        <div className="space-y-3">
          <input
            type="file"
            accept=".pn,.json"
            onChange={(e) => setOldPnFile(e.target.files?.[0] || null)}
            className="text-sm w-full"
          />
          <input
            type="text"
            placeholder="pn name"
            value={oldPnName}
            onChange={(e) => setOldPnName(e.target.value)}
            className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
            autoComplete="off"
          />
          <input
            type="password"
            placeholder="current passcode"
            value={oldPasscode}
            onChange={(e) => setOldPasscode(e.target.value)}
            className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
            autoComplete="off"
          />
          <button type="button" className="px-4 py-2 bg-primary text-bg-primary rounded-lg text-sm" onClick={handleUnlockOld}>
            Continue
          </button>
        </div>
      )}

      {step === 'new_passcode' && (
        <div className="space-y-3">
          {storedIdentity && (
            <input
              type="password"
              placeholder="current passcode"
              value={oldPasscode}
              onChange={(e) => setOldPasscode(e.target.value)}
              className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
              autoComplete="off"
            />
          )}
          <input
            type="password"
            placeholder="new passcode"
            value={newPasscode}
            onChange={(e) => setNewPasscode(e.target.value)}
            className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
            autoComplete="new-password"
          />
          <input
            type="password"
            placeholder="confirm new passcode"
            value={confirmPasscode}
            onChange={(e) => setConfirmPasscode(e.target.value)}
            className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
            autoComplete="new-password"
          />
          <button type="button" className="px-4 py-2 bg-primary text-bg-primary rounded-lg text-sm" onClick={handleMigrate}>
            Run migration
          </button>
        </div>
      )}

      {step === 'migrating' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="w-4 h-4 animate-spin" />
            {progressLabel || 'Migrating…'}
          </div>
          <div className="h-2 bg-border rounded overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {step === 'drive_failures' && coreResult && (
        <div className="space-y-3">
          <p className="text-sm text-amber-600">
            {coreResult.driveFailures.length} Drive item(s) could not be migrated:
          </p>
          <ul className="text-xs text-text-secondary list-disc pl-4 max-h-32 overflow-y-auto">
            {coreResult.driveFailures.map((f) => (
              <li key={f.path}>
                {f.path}: {f.reason}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="px-4 py-2 bg-primary text-bg-primary rounded-lg text-sm"
            onClick={() => {
              void (async () => {
                try {
                  await resumeMigrationAfterDriveAck({
                    authToken,
                    migrationId: coreResult.migrationId,
                    predecessor: coreResult.predMat,
                    successor: coreResult.succMat,
                    onProgress: (label, pct) => {
                      setProgressLabel(label);
                      setProgressPct(pct);
                    },
                  });
                  setStep('custodian_reinvite');
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Failed to continue migration');
                }
              })();
            }}
          >
            I understand — continue migration
          </button>
        </div>
      )}

      {step === 'custodian_reinvite' && coreResult && migrationCtx && (
        <MigrationCustodianReinviteStep
          authToken={authToken}
          migrationId={coreResult.migrationId}
          successorPnIdentifier={coreResult.succMat.pnIdentifier}
          successorDid={migrationCtx.successorDid}
          successorEncryptedIdentity={coreResult.successorEncryptedIdentity}
          predecessorCustodians={coreResult.predecessorCustodians}
          recoveryThreshold={coreResult.recoveryThreshold}
          recoveryTotalShares={coreResult.recoveryTotalShares}
          onComplete={() => void handleCustodianComplete()}
        />
      )}

      {step === 'finalizing' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="w-4 h-4 animate-spin" />
            {progressLabel || 'Finalizing…'}
          </div>
          <div className="h-2 bg-border rounded overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {step === 'subs_verify' && (
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            Root ownership migrated on the network. Sub subjects stay stable unless you rotate them individually.
          </p>
          {Object.keys(subsSummary).length > 0 ? (
            <ul className="text-sm text-text-primary list-disc pl-5">
              {Object.entries(subsSummary).map(([kind, count]) => (
                <li key={kind}>
                  {count} active {kind} sub(s)
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-secondary">No active sub-pN assets registered.</p>
          )}
          <label className="flex items-start gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={subsBackupAck}
              onChange={(e) => setSubsBackupAck(e.target.checked)}
              className="mt-1"
            />
            <span>
              I have downloaded sub exports or confirm local sealed backups still exist (Sub-pN tab).
            </span>
          </label>
          <button
            type="button"
            className="px-4 py-2 bg-primary text-bg-primary rounded-lg text-sm disabled:opacity-50"
            disabled={!subsBackupAck}
            onClick={() => {
              onComplete?.(resultIdentity!);
              setStep('done');
            }}
          >
            Finish
          </button>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-3">
          <p className="text-sm text-green-600">
            Migration complete. Download your new .pn file and unlock with the new passcode.
          </p>
          <button type="button" className="px-4 py-2 bg-primary text-bg-primary rounded-lg text-sm" onClick={downloadNewPn}>
            Download new .pn
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );
};
