import React, { useState } from 'react';
import { Usb, AlertTriangle } from 'lucide-react';
import { IdentityCrypto, EncryptedData, AuthSession } from '../../utils/crypto';
import { decryptFromDrive } from '../../utils/physicalKeyCrypto';

const hasFileSystemAccess =
  typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export interface UnlockFromUsbResult {
  authSession: AuthSession;
  identityToUnlock: Record<string, unknown>;
  identityData: Record<string, unknown>;
  publicKey: string;
  nickname: string;
  pnName: string;
  identityId: string;
}

interface UnlockFromUsbModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlock: (result: UnlockFromUsbResult) => Promise<void>;
  onError: (message: string) => void;
}

export function UnlockFromUsbModal({
  isOpen,
  onClose,
  onUnlock,
  onError,
}: UnlockFromUsbModalProps) {
  const [step, setStep] = useState<'drive' | 'passcode' | 'credentials'>('drive');
  const [drivePasscode, setDrivePasscode] = useState('');
  const [pnName, setPnName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    setStep('drive');
    setDrivePasscode('');
    setPnName('');
    setPasscode('');
    setError(null);
    setLoading(false);
    onClose();
  };

  const handleSelectDrive = async () => {
    setError(null);
    if (!hasFileSystemAccess) {
      setError('Read from USB requires Chrome or Edge on desktop.');
      return;
    }

    try {
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'read',
      });

      const parnoirDir = await dirHandle.getDirectoryHandle('.parnoir');
      const fileHandle = await parnoirDir.getFileHandle('identity.enc');
      const file = await fileHandle.getFile();
      const content = await file.text();

      (window as any).__unlockUsbEncryptedContent = content;
      setStep('passcode');
    } catch (err: any) {
      if (err.name === 'NotFoundError' || err.name === 'TypeError') {
        setError('Identity file not found. Expected .parnoir/identity.enc on this drive.');
      } else if (err.name === 'AbortError') {
        return;
      } else {
        setError(err.message || 'Failed to read from drive');
      }
    }
  };

  const handleDecryptDrive = () => {
    setError(null);
    if (!drivePasscode || drivePasscode.length < 6) {
      setError('Drive passcode must be at least 6 characters');
      return;
    }

    const content = (window as any).__unlockUsbEncryptedContent;
    if (!content) {
      setError('No data. Please select the drive again.');
      return;
    }

    setLoading(true);
    decryptFromDrive(content, drivePasscode)
      .then((container) => {
        delete (window as any).__unlockUsbEncryptedContent;
        (window as any).__unlockUsbBoundPnBlob = container.boundPnBlob;
        (window as any).__unlockUsbUid = container.uid;
        setStep('credentials');
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message || 'Invalid drive passcode');
        setLoading(false);
      });
  };

  const handleUnlock = async () => {
    setError(null);
    if (!pnName || !passcode) {
      setError('Please enter pN name and passcode');
      return;
    }

    const boundPnBlob = (window as any).__unlockUsbBoundPnBlob;
    const uid = (window as any).__unlockUsbUid;
    if (!boundPnBlob || !uid) {
      setError('Session expired. Please start over.');
      return;
    }

    setLoading(true);
    try {
      const pnData = JSON.parse(boundPnBlob);
      const binding = pnData.binding;
      const identities = pnData.identities;

      if (!binding || binding.type !== 'usb' || !identities?.length) {
        throw new Error('Invalid key-bound pN file format');
      }

      const identityToUnlock = identities[0];
      const encryptedData: EncryptedData = {
        encrypted: identityToUnlock.encrypted ?? identityToUnlock.encryptedData,
        iv: identityToUnlock.iv,
        salt: identityToUnlock.salt,
      };

      const plaintext = await IdentityCrypto.decryptDataWithBinding(
        encryptedData,
        pnName,
        passcode,
        uid
      );

      const identity = JSON.parse(plaintext);
      const publicKey = identityToUnlock.publicKey || identity.publicKey;
      if (!publicKey) {
        throw new Error('Invalid pN file: missing public key');
      }

      const authSession = await IdentityCrypto.buildAuthSessionFromDecrypted(
        identity,
        publicKey,
        pnName,
        passcode
      );

      delete (window as any).__unlockUsbBoundPnBlob;
      delete (window as any).__unlockUsbUid;

      const identityForStorage = {
        ...identityToUnlock,
        encryptedData: identityToUnlock.encrypted ?? identityToUnlock.encryptedData,
      };

      await onUnlock({
        authSession,
        identityToUnlock: identityForStorage,
        identityData: identity,
        publicKey,
        nickname: identity.nickname || identity.username || pnName,
        pnName,
        identityId: identity.id,
      });

      handleClose();
    } catch (err: any) {
      setError(err.message || 'Unlock failed');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full text-text-primary">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Usb className="w-6 h-6 text-orange-600" />
            Unlock from USB
          </h2>
          <button
            onClick={handleClose}
            className="modal-close-button"
            disabled={loading}
          >
            ×
          </button>
        </div>

        {!hasFileSystemAccess && (
          <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-text-secondary">
              Read from USB requires Chrome or Edge on desktop. Use file upload instead.
            </p>
          </div>
        )}

        {step === 'drive' && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              Select the USB drive or folder where your pN identity is stored. The app will read from
              .parnoir/identity.enc
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
              Enter the drive passcode you set when exporting to this drive.
            </p>
            <div>
              <label className="block text-sm font-medium mb-2">Drive passcode</label>
              <input
                type="password"
                value={drivePasscode}
                onChange={(e) => setDrivePasscode(e.target.value)}
                placeholder="Drive passcode"
                className="w-full px-3 py-2 border border-border rounded-md bg-input-bg text-text-primary"
              />
            </div>
            <button
              onClick={handleDecryptDrive}
              disabled={loading}
              className="w-full bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Decrypting...' : 'Continue'}
            </button>
            <button
              onClick={() => {
                setStep('drive');
                setDrivePasscode('');
                setError(null);
                delete (window as any).__unlockUsbEncryptedContent;
              }}
              className="w-full text-text-secondary text-sm py-1 hover:text-text-primary"
            >
              Choose different drive
            </button>
          </div>
        )}

        {step === 'credentials' && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              Enter your pN name and passcode to unlock your identity.
            </p>
            <div>
              <label className="block text-sm font-medium mb-2">pN Name</label>
              <input
                type="text"
                value={pnName}
                onChange={(e) => setPnName(e.target.value)}
                placeholder="pN name"
                className="w-full px-3 py-2 border border-border rounded-md bg-input-bg text-text-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Passcode</label>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Passcode"
                className="w-full px-3 py-2 border border-border rounded-md bg-input-bg text-text-primary"
              />
            </div>
            <button
              onClick={handleUnlock}
              disabled={loading}
              className="w-full bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Unlocking...' : 'Unlock'}
            </button>
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
