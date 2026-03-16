import React, { useState } from 'react';
import { Usb } from 'lucide-react';
import { IdentityCrypto, EncryptedData } from '../../utils/crypto';
import {
  generateUid,
  uidToBase64,
  encryptUidForDrive,
} from '../../utils/physicalKeyCrypto';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface ExportToUsbModalProps {
  isOpen: boolean;
  onClose: () => void;
  identityToExport: { encryptedData: string; iv: string; salt: string; publicKey?: string };
  /** Used only to verify - collect pN + passcode as the last step before write */
  onSuccess: () => void;
  onError: (message: string) => void;
}

export function ExportToUsbModal({
  isOpen,
  onClose,
  identityToExport,
  onSuccess,
  onError,
}: ExportToUsbModalProps) {
  const [step, setStep] = useState<'passcode' | 'verify' | 'writing'>('passcode');
  const [drivePasscode, setDrivePasscode] = useState('');
  const [confirmDrivePasscode, setConfirmDrivePasscode] = useState('');
  const [pnName, setPnName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setStep('passcode');
    setDrivePasscode('');
    setConfirmDrivePasscode('');
    setPnName('');
    setPasscode('');
    setError(null);
    onClose();
  };

  const handleConfirmDrivePasscode = () => {
    setError(null);
    if (!drivePasscode || drivePasscode !== confirmDrivePasscode) {
      setError('Passcodes do not match');
      return;
    }
    if (drivePasscode.length < 6) {
      setError('Drive passcode must be at least 6 characters');
      return;
    }
    setStep('verify');
  };

  const handleDownload = async () => {
    setError(null);

    if (!pnName || !passcode) {
      setError('Enter your pN name and passcode to authorize the export');
      return;
    }

    setStep('writing');

    try {
      const encryptedData: EncryptedData = {
        encrypted: identityToExport.encryptedData ?? (identityToExport as any).encrypted,
        iv: identityToExport.iv,
        salt: identityToExport.salt,
      };

      const plaintext = await IdentityCrypto.decryptData(
        encryptedData,
        pnName,
        passcode
      );

      const uid = generateUid();
      const uidBase64 = uidToBase64(uid);

      const boundEncrypted = await IdentityCrypto.encryptDataWithBinding(
        plaintext,
        pnName,
        passcode,
        uidBase64
      );

      const identityRecord = { ...boundEncrypted } as Record<string, string>;
      if (identityToExport.publicKey) identityRecord.publicKey = identityToExport.publicKey;
      // Payload file: no uid in binding (binary system; uid is in key file)
      const payloadBlob = JSON.stringify({
        version: '1.0',
        timestamp: new Date().toISOString(),
        binding: { type: 'usb' },
        identities: [identityRecord],
      });

      const keyFileBase64 = await encryptUidForDrive(uidBase64, drivePasscode);

      downloadBlob(new Blob([payloadBlob], { type: 'application/json' }), 'parnoir-payload.enc');
      downloadBlob(new Blob([keyFileBase64], { type: 'text/plain' }), 'parnoir-key.enc');

      handleClose();
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to prepare download');
      setStep('verify');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full text-text-primary">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Usb className="w-6 h-6 text-orange-600" />
            Export to USB
          </h2>
          <button
            onClick={handleClose}
            className="modal-close-button"
            disabled={step === 'writing'}
          >
            ×
          </button>
        </div>

        {step === 'passcode' && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              You will get two files: a payload file and a key file. Both are needed to unlock. Store them on the same or different USBs. Set a passcode to protect the key file; you will need it when unlocking.
            </p>
            <div>
              <label className="block text-sm font-medium mb-2">
                Drive passcode
              </label>
              <input
                type="password"
                value={drivePasscode}
                onChange={(e) => setDrivePasscode(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full px-3 py-2 border border-border rounded-md bg-input-bg text-text-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Confirm passcode
              </label>
              <input
                type="password"
                value={confirmDrivePasscode}
                onChange={(e) => setConfirmDrivePasscode(e.target.value)}
                placeholder="Confirm passcode"
                className="w-full px-3 py-2 border border-border rounded-md bg-input-bg text-text-primary"
              />
            </div>
            <button
              onClick={handleConfirmDrivePasscode}
              className="w-full bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              Verify your identity to authorize downloading the two files.
            </p>
            <div>
              <label className="block text-sm font-medium mb-2">pN Name</label>
              <input
                type="text"
                value={pnName}
                onChange={(e) => setPnName(e.target.value)}
                placeholder="Enter your pN name"
                className="w-full px-3 py-2 border border-border rounded-md bg-input-bg text-text-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Passcode</label>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter your passcode"
                className="w-full px-3 py-2 border border-border rounded-md bg-input-bg text-text-primary"
              />
            </div>
            <button
              onClick={handleDownload}
              className="w-full bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 transition-colors"
            >
              Download both files
            </button>
          </div>
        )}

        {step === 'writing' && (
          <div className="text-center py-8">
            <div className="animate-pulse text-text-secondary">
              Preparing download...
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
