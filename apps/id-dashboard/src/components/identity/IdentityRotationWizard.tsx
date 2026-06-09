import React, { useState } from 'react';
import { AlertTriangle, KeyRound, Loader2 } from 'lucide-react';
import type { EncryptedIdentity } from '../../types/crypto';
import { IdentityCrypto } from '../../utils/crypto';
import { runIdentityMigration } from '../../services/identityMigrationOrchestrator';
import { SimpleStorage } from '../../utils/simpleStorage';
import { SecureCredentialManager } from '../../utils/secureCredentialManager';

interface IdentityRotationWizardProps {
  authToken: string;
  identityKey?: string;
  currentDid?: string;
  onComplete?: (newIdentity: EncryptedIdentity) => void;
}

type WizardStep = 'intro' | 'unlock_old' | 'new_passcode' | 'migrating' | 'done';

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
        {
          encrypted: identity.encryptedData,
          iv: identity.iv,
          salt: identity.salt,
        },
        oldPnName,
        oldPasscode
      );
      setStep('new_passcode');
    } catch {
      setError('Could not unlock old identity. Check pn name and passcode.');
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

    setStep('migrating');
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

      const { migrationId, successorEncryptedIdentity } = await runIdentityMigration({
        authToken,
        predecessor: {
          encryptedIdentity: predIdentity,
          did: predDid,
          pnName,
          passcode: predPasscode,
        },
        successor: {
          encryptedIdentity: rotated.identity,
          did: (JSON.parse(
            await IdentityCrypto.decryptData(
              {
                encrypted: rotated.identity.encryptedData,
                iv: rotated.identity.iv,
                salt: rotated.identity.salt,
              },
              pnName,
              newPasscode
            )
          ) as { id: string }).id,
          pnName,
          passcode: newPasscode,
        },
        onProgress: (label, pct) => {
          setProgressLabel(label);
          setProgressPct(pct);
        },
      });

      setResultIdentity(successorEncryptedIdentity);
      setStep('done');
      onComplete?.(successorEncryptedIdentity);
      void migrationId;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Migration failed');
      setStep('new_passcode');
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
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm"
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
          <button type="button" className="px-4 py-2 bg-primary text-white rounded-lg text-sm" onClick={handleUnlockOld}>
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
          <button type="button" className="px-4 py-2 bg-primary text-white rounded-lg text-sm" onClick={handleMigrate}>
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

      {step === 'done' && (
        <div className="space-y-3">
          <p className="text-sm text-green-600">Migration complete. Download your new .pn file and unlock with the new passcode.</p>
          <button type="button" className="px-4 py-2 bg-primary text-white rounded-lg text-sm" onClick={downloadNewPn}>
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
