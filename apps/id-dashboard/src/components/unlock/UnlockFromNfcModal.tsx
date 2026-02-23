import React, { useState } from 'react';
import { CreditCard, AlertTriangle } from 'lucide-react';
import { IdentityCrypto, EncryptedData, AuthSession } from '../../utils/crypto';

const PARNOIR_MIME_TYPE = 'application/x-parnoir-identity';
const hasNfcSupport = typeof window !== 'undefined' && 'NDEFReader' in window;

export interface UnlockFromNfcResult {
  authSession: AuthSession;
  identityToUnlock: Record<string, unknown>;
  identityData: Record<string, unknown>;
  publicKey: string;
  nickname: string;
  pnName: string;
  identityId: string;
}

interface UnlockFromNfcModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlock: (result: UnlockFromNfcResult) => Promise<void>;
  onError: (message: string) => void;
}

export function UnlockFromNfcModal({
  isOpen,
  onClose,
  onUnlock,
  onError,
}: UnlockFromNfcModalProps) {
  const [step, setStep] = useState<'scan' | 'credentials'>('scan');
  const [pnName, setPnName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    setStep('scan');
    setPnName('');
    setPasscode('');
    setError(null);
    setLoading(false);
    onClose();
  };

  const handleScan = async () => {
    setError(null);
    if (!hasNfcSupport) {
      setError('NFC unlock requires Chrome on Android.');
      return;
    }
    const NDEFReader = (window as any).NDEFReader;
    if (!NDEFReader) {
      setError('NFC not supported');
      return;
    }
    setLoading(true);
    try {
      const ndef = new NDEFReader();
      const abortController = new AbortController();
      let timeoutId: ReturnType<typeof setTimeout>;
      const result = await new Promise<{ boundPnBlob: string; uid: string }>((resolve, reject) => {
        const onReading = async (evt: any) => {
          clearTimeout(timeoutId);
          ndef.removeEventListener('reading', onReading);
          ndef.removeEventListener('error', onErrorHandler);
          try {
            const { serialNumber, message } = evt;
            if (!message?.records?.length) {
              reject(new Error('No records on NFC tag'));
              return;
            }
            for (const record of message.records) {
              if (
                record.recordType === 'mime' &&
                record.mediaType === PARNOIR_MIME_TYPE &&
                record.data
              ) {
                const decoder = new TextDecoder();
                const boundPnBlob = decoder.decode(record.data);
                resolve({ boundPnBlob, uid: serialNumber });
                return;
              }
            }
            reject(new Error('pN identity not found on this card'));
          } catch (err) {
            reject(err);
          }
        };
        const onErrorHandler = (e: Event) => {
          clearTimeout(timeoutId);
          ndef.removeEventListener('reading', onReading);
          ndef.removeEventListener('error', onErrorHandler);
          reject((e as ErrorEvent).error || new Error('NFC read failed'));
        };
        ndef.addEventListener('reading', onReading);
        ndef.addEventListener('error', onErrorHandler);
        timeoutId = setTimeout(() => {
          ndef.removeEventListener('reading', onReading);
          ndef.removeEventListener('error', onErrorHandler);
          abortController.abort();
          reject(new Error('Timeout: tap your NFC card'));
        }, 60000);
        ndef.scan({ signal: abortController.signal }).catch((err: Error) => {
          clearTimeout(timeoutId);
          ndef.removeEventListener('reading', onReading);
          ndef.removeEventListener('error', onErrorHandler);
          reject(err);
        });
      });
      (window as any).__unlockNfcBoundPnBlob = result.boundPnBlob;
      (window as any).__unlockNfcUid = result.uid;
      setStep('credentials');
    } catch (err: any) {
      setError(err.message || 'Failed to read NFC card');
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
    const boundPnBlob = (window as any).__unlockNfcBoundPnBlob;
    const uid = (window as any).__unlockNfcUid;
    if (!boundPnBlob || !uid) {
      setError('Session expired. Please scan again.');
      return;
    }
    setLoading(true);
    try {
      const pnData = JSON.parse(boundPnBlob);
      const identities = pnData.identities;
      const binding = pnData.binding;
      if (!binding || binding.type !== 'nfc' || !identities?.length) {
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
      if (!publicKey) throw new Error('Invalid pN file: missing public key');
      const authSession = await IdentityCrypto.buildAuthSessionFromDecrypted(
        identity,
        publicKey,
        pnName,
        passcode
      );
      delete (window as any).__unlockNfcBoundPnBlob;
      delete (window as any).__unlockNfcUid;
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
            <CreditCard className="w-6 h-6 text-orange-600" />
            Unlock from NFC
          </h2>
          <button
            onClick={handleClose}
            className="modal-close-button"
            disabled={loading}
          >
            ×
          </button>
        </div>
        {!hasNfcSupport && (
          <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-text-secondary">
              NFC unlock requires Chrome on Android. Use file upload or USB instead.
            </p>
          </div>
        )}
        {step === 'scan' && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              Hold your NFC card or fob near the back of your phone to read the identity.
            </p>
            <button
              onClick={handleScan}
              disabled={!hasNfcSupport || loading}
              className="w-full bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Waiting for card...' : 'Tap to Scan'}
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
            <button
              onClick={() => {
                setStep('scan');
                setPnName('');
                setPasscode('');
                setError(null);
                delete (window as any).__unlockNfcBoundPnBlob;
                delete (window as any).__unlockNfcUid;
              }}
              className="w-full text-text-secondary text-sm py-1 hover:text-text-primary"
            >
              Scan different card
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
