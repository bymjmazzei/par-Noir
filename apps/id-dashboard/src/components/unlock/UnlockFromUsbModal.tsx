import React, { useState, useRef } from 'react';
import { Usb } from 'lucide-react';
import { IdentityCrypto, EncryptedData, AuthSession } from '@par-noir/identity-crypto';
import { HostedShellLaunch } from '@par-noir/oauth-ui';
import { decryptFromDrive, decryptUidFromDrive } from '../../utils/physicalKeyCrypto';
import { KEY_1_PLACEHOLDER, KEY_2_PLACEHOLDER } from '../../constants/credentialLabels';

export interface UnlockFromUsbResult {
  authSession: AuthSession;
  identityToUnlock: Record<string, unknown>;
  identityData: Record<string, unknown>;
  publicKey: string;
  nickname: string;
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
  const [step, setStep] = useState<'key' | 'drivePassphrase' | 'payload' | 'credentials'>('key');
  const [keyFileContent, setKeyFileContent] = useState<string | null>(null);
  const [payloadContent, setPayloadContent] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [boundPnBlob, setBoundPnBlob] = useState<string | null>(null);
  const [drivePassphrase, setDrivePassphrase] = useState('');
  const [key1, setKey1] = useState('');
  const [key2, setKey2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const payloadInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setStep('key');
    setKeyFileContent(null);
    setPayloadContent(null);
    setUid(null);
    setBoundPnBlob(null);
    setDrivePassphrase('');
    setKey1('');
    setKey2('');
    setError(null);
    setLoading(false);
    onClose();
  };

  const handleKeyFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      setKeyFileContent(content);
      setStep('drivePassphrase');
    } catch (err: any) {
      setError(err.message || 'Failed to read key file');
    }
    e.target.value = '';
  };

  const handlePayloadFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      setPayloadContent(content);
      setStep('credentials');
    } catch (err: any) {
      setError(err.message || 'Failed to read payload file');
    }
    e.target.value = '';
  };

  const handleDecryptKeyOrLegacy = async () => {
    setError(null);
    if (!drivePassphrase || drivePassphrase.length < 6) {
      setError('Drive passphrase must be at least 6 characters');
      return;
    }
    if (!keyFileContent) {
      setError('No key file selected. Please select a file.');
      return;
    }

    setLoading(true);
    try {
      const container = await decryptFromDrive(keyFileContent, drivePassphrase);
      setBoundPnBlob(container.boundPnBlob);
      setUid(container.uid);
      setStep('credentials');
    } catch {
      try {
        const decryptedUid = await decryptUidFromDrive(keyFileContent, drivePassphrase);
        setUid(decryptedUid);
        setStep('payload');
      } catch (err: any) {
        setError(err.message || 'Invalid key file or drive passphrase');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    setError(null);
    if (!key1 || !key2) {
      setError('Please enter Key 1 and Key 2');
      return;
    }

    const blob = boundPnBlob ?? payloadContent;
    const currentUid = uid;
    if (!blob || !currentUid) {
      setError('Session expired. Please start over.');
      return;
    }

    setLoading(true);
    try {
      const pnData = JSON.parse(blob);
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
        key1,
        key2,
        currentUid
      );

      const identity = JSON.parse(plaintext);
      const publicKey = identityToUnlock.publicKey || identity.publicKey;
      if (!publicKey) {
        throw new Error('Invalid pN file: missing public key');
      }

      const authSession = await IdentityCrypto.buildAuthSessionFromDecrypted(
        identity,
        publicKey,
        key1,
        key2
      );

      const identityForStorage = {
        ...identityToUnlock,
        encryptedData: identityToUnlock.encrypted ?? identityToUnlock.encryptedData,
      };

      await onUnlock({
        authSession,
        identityToUnlock: identityForStorage,
        identityData: identity,
        publicKey,
        nickname: authSession.nickname,
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

        {step === 'key' && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              Select the key file (parnoir-key.enc). If you have an older single backup file (identity.enc), select it here.
            </p>
            <input
              ref={keyInputRef}
              type="file"
              accept=".enc,application/octet-stream,text/plain"
              className="hidden"
              onChange={handleKeyFileSelected}
              aria-label="Select key file"
            />
            <button
              type="button"
              onClick={() => keyInputRef.current?.click()}
              className="w-full bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 transition-colors"
            >
              Select key file
            </button>
          </div>
        )}

        {step === 'drivePassphrase' && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              Enter the drive passphrase you set when exporting.
            </p>
            <div>
              <label className="block text-sm font-medium mb-2">Drive passphrase</label>
              <input
                type="password"
                value={drivePassphrase}
                onChange={(e) => setDrivePassphrase(e.target.value)}
                placeholder="Drive passphrase"
                className="w-full px-3 py-2 border border-border rounded-md bg-input-bg text-text-primary"
              />
            </div>
            <button
              onClick={handleDecryptKeyOrLegacy}
              disabled={loading}
              className="w-full bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Decrypting...' : 'Continue'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('key');
                setDrivePassphrase('');
                setKeyFileContent(null);
                setError(null);
              }}
              className="w-full text-text-secondary text-sm py-1 hover:text-text-primary"
            >
              Choose different file
            </button>
          </div>
        )}

        {step === 'payload' && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              Select the payload file (parnoir-payload.enc).
            </p>
            <input
              ref={payloadInputRef}
              type="file"
              accept=".enc,application/json,text/plain"
              className="hidden"
              onChange={handlePayloadFileSelected}
              aria-label="Select payload file"
            />
            <button
              type="button"
              onClick={() => payloadInputRef.current?.click()}
              className="w-full bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 transition-colors"
            >
              Select payload file
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('drivePassphrase');
                setPayloadContent(null);
                setError(null);
              }}
              className="w-full text-text-secondary text-sm py-1 hover:text-text-primary"
            >
              Back
            </button>
          </div>
        )}

        {step === 'credentials' && (
          <div className="space-y-4">
            <HostedShellLaunch op="session" onSession={() => undefined} />
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
