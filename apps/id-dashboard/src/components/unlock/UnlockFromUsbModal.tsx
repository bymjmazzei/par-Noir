import React, { useState, useRef } from 'react';
import { Usb } from 'lucide-react';
import { IdentityCrypto, EncryptedData, AuthSession } from '@par-noir/identity-crypto';
import { decryptFromDrive, decryptUidFromDrive } from '../../utils/physicalKeyCrypto';

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
  const [step, setStep] = useState<'key' | 'passcode' | 'payload' | 'credentials'>('key');
  const [keyFileContent, setKeyFileContent] = useState<string | null>(null);
  const [payloadContent, setPayloadContent] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [boundPnBlob, setBoundPnBlob] = useState<string | null>(null);
  const [drivePasscode, setDrivePasscode] = useState('');
  const [pnName, setPnName] = useState('');
  const [passcode, setPasscode] = useState('');
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
    setDrivePasscode('');
    setPnName('');
    setPasscode('');
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
      setStep('passcode');
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
    if (!drivePasscode || drivePasscode.length < 6) {
      setError('Drive passcode must be at least 6 characters');
      return;
    }
    if (!keyFileContent) {
      setError('No key file selected. Please select a file.');
      return;
    }

    setLoading(true);
    try {
      const container = await decryptFromDrive(keyFileContent, drivePasscode);
      setBoundPnBlob(container.boundPnBlob);
      setUid(container.uid);
      setStep('credentials');
    } catch {
      try {
        const decryptedUid = await decryptUidFromDrive(keyFileContent, drivePasscode);
        setUid(decryptedUid);
        setStep('payload');
      } catch (err: any) {
        setError(err.message || 'Invalid key file or drive passcode');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    setError(null);
    if (!pnName || !passcode) {
      setError('Please enter pN name and passcode');
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
        pnName,
        passcode,
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
        pnName,
        passcode
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

        {step === 'passcode' && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              Enter the drive passcode you set when exporting.
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
                setDrivePasscode('');
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
                setStep('passcode');
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
