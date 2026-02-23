import React, { useState } from 'react';
import { Usb, AlertTriangle } from 'lucide-react';
import { IdentityCrypto, EncryptedData } from '../../utils/crypto';
import {
  generateUid,
  uidToBase64,
  encryptForDrive,
} from '../../utils/physicalKeyCrypto';

const hasFileSystemAccess =
  typeof window !== 'undefined' &&
  'showDirectoryPicker' in window;

interface ExportToUsbModalProps {
  isOpen: boolean;
  onClose: () => void;
  identityToExport: { encryptedData: string; iv: string; salt: string; publicKey?: string };
  pnName: string;
  passcode: string;
  onSuccess: () => void;
  onError: (message: string) => void;
}

export function ExportToUsbModal({
  isOpen,
  onClose,
  identityToExport,
  pnName,
  passcode,
  onSuccess,
  onError,
}: ExportToUsbModalProps) {
  const [step, setStep] = useState<'drive' | 'passcode' | 'writing'>('drive');
  const [drivePasscode, setDrivePasscode] = useState('');
  const [confirmDrivePasscode, setConfirmDrivePasscode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setStep('drive');
    setDrivePasscode('');
    setConfirmDrivePasscode('');
    setError(null);
    onClose();
  };

  const handleSelectDrive = async () => {
    setError(null);
    if (!hasFileSystemAccess) {
      setError('USB export requires Chrome or Edge on desktop. Use Download instead.');
      return;
    }

    try {
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
      });

      setStep('passcode');
      (window as any).__exportUsbDirHandle = dirHandle;
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Failed to select drive');
    }
  };

  const handleWriteToDrive = async () => {
    setError(null);

    if (!drivePasscode || drivePasscode !== confirmDrivePasscode) {
      setError('Passcodes do not match');
      return;
    }

    if (drivePasscode.length < 6) {
      setError('Drive passcode must be at least 6 characters');
      return;
    }

    const dirHandle = (window as any).__exportUsbDirHandle;
    if (!dirHandle) {
      setError('No drive selected. Please try again.');
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
      const boundPnBlob = JSON.stringify({
        version: '1.0',
        timestamp: new Date().toISOString(),
        binding: { type: 'usb', uid: uidBase64 },
        identities: [identityRecord],
      });

      const container = await encryptForDrive(uid, boundPnBlob, drivePasscode);

      const parnoirDir = await dirHandle.getDirectoryHandle('.parnoir', {
        create: true,
      });
      const fileHandle = await parnoirDir.getFileHandle('identity.enc', {
        create: true,
      });
      const writable = await fileHandle.createWritable();
      await writable.write(container);
      await writable.close();

      delete (window as any).__exportUsbDirHandle;
      handleClose();
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to write to drive');
      setStep('passcode');
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

        {!hasFileSystemAccess && (
          <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-text-secondary">
              USB export requires Chrome or Edge on desktop. Use Download for a
              portable file instead.
            </p>
          </div>
        )}

        {step === 'drive' && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              Select the USB drive or folder where you want to save your pN. A
              hidden folder <code className="text-xs">.parnoir</code> will be
              created with your encrypted identity.
            </p>
            <button
              onClick={handleSelectDrive}
              disabled={!hasFileSystemAccess}
              className="w-full bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Select Drive or Folder
            </button>
          </div>
        )}

        {step === 'passcode' && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              Set a passcode to protect the data on this drive. You will need
              this passcode to unlock when reading from USB.
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
              onClick={handleWriteToDrive}
              className="w-full bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 transition-colors"
            >
              Write to Drive
            </button>
          </div>
        )}

        {step === 'writing' && (
          <div className="text-center py-8">
            <div className="animate-pulse text-text-secondary">
              Writing to drive...
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
