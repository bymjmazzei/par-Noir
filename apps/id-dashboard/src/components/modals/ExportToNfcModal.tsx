import React, { useState } from 'react';
import { CreditCard, AlertTriangle } from 'lucide-react';
import { IdentityCrypto } from '../../utils/crypto';

const PARNOIR_MIME_TYPE = 'application/x-parnoir-identity';

const hasNfcSupport =
  typeof window !== 'undefined' &&
  'NDEFReader' in window;

interface ExportToNfcModalProps {
  isOpen: boolean;
  onClose: () => void;
  identityToExport: { encryptedData: string; iv: string; salt: string; publicKey?: string };
  pnName: string;
  passcode: string;
  onSuccess: () => void;
  onError: (message: string) => void;
}

export function ExportToNfcModal({
  isOpen,
  onClose,
  identityToExport,
  pnName,
  passcode,
  onSuccess,
  onError,
}: ExportToNfcModalProps) {
  const [step, setStep] = useState<'scan' | 'writing'>('scan');
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setStep('scan');
    setError(null);
    onClose();
  };

  const handleWriteToNfc = async () => {
    setError(null);

    if (!hasNfcSupport) {
      setError('NFC export requires Chrome on Android. Use Download or USB instead.');
      return;
    }

    const NDEFReader = (window as any).NDEFReader;
    if (!NDEFReader) {
      setError('NFC not supported');
      return;
    }

    try {
      setStep('scan');

      const ndef = new NDEFReader();

      const abortController = new AbortController();
      let timeoutId: ReturnType<typeof setTimeout>;
      const cardUid = await new Promise<string>((resolve, reject) => {
        const onReading = (evt: { serialNumber: string }) => {
          clearTimeout(timeoutId);
          ndef.removeEventListener('reading', onReading);
          ndef.removeEventListener('error', onError);
          resolve(evt.serialNumber);
        };
        const onError = (e: Event) => {
          clearTimeout(timeoutId);
          ndef.removeEventListener('reading', onReading);
          ndef.removeEventListener('error', onError);
          reject((e as ErrorEvent).error || new Error('NFC read failed'));
        };
        ndef.addEventListener('reading', onReading);
        ndef.addEventListener('error', onError);
        timeoutId = setTimeout(() => {
          ndef.removeEventListener('reading', onReading);
          ndef.removeEventListener('error', onError);
          abortController.abort();
          reject(new Error('Timeout: tap your NFC card'));
        }, 60000);
        ndef.scan({ signal: abortController.signal }).catch((err: Error) => {
          clearTimeout(timeoutId);
          ndef.removeEventListener('reading', onReading);
          ndef.removeEventListener('error', onError);
          reject(err);
        });
      });

      const encryptedData = {
        encrypted: identityToExport.encryptedData ?? (identityToExport as any).encrypted,
        iv: identityToExport.iv,
        salt: identityToExport.salt,
      };

      const plaintext = await IdentityCrypto.decryptData(
        encryptedData,
        pnName,
        passcode
      );

      const boundEncrypted = await IdentityCrypto.encryptDataWithBinding(
        plaintext,
        pnName,
        passcode,
        cardUid
      );

      const identityRecord = { ...boundEncrypted } as Record<string, string>;
      if (identityToExport.publicKey) identityRecord.publicKey = identityToExport.publicKey;
      const boundPnBlob = JSON.stringify({
        version: '1.0',
        timestamp: new Date().toISOString(),
        binding: { type: 'nfc', uid: cardUid },
        identities: [identityRecord],
      });

      setStep('writing');

      const encoder = new TextEncoder();
      const ndefMessage = {
        records: [
          {
            recordType: 'mime',
            mediaType: PARNOIR_MIME_TYPE,
            data: encoder.encode(boundPnBlob),
          },
        ],
      };

      await ndef.write(ndefMessage);

      handleClose();
      onSuccess();
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('NFC permission denied');
      } else if (err.name === 'NotSupportedError') {
        setError('NFC not supported on this device');
      } else {
        setError(err.message || 'Failed to write to NFC card');
      }
      setStep('scan');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full text-text-primary">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-orange-600" />
            Export to NFC
          </h2>
          <button
            onClick={handleClose}
            className="modal-close-button"
            disabled={step === 'writing'}
          >
            ×
          </button>
        </div>

        {!hasNfcSupport && (
          <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-text-secondary">
              NFC export requires Chrome on Android. Use Download or USB instead.
            </p>
          </div>
        )}

        {step === 'scan' && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              Hold your NFC card or fob (DESFire 4K/8K) near the back of your
              phone. The pN will be bound to this card and cannot be copied.
            </p>
            <button
              onClick={handleWriteToNfc}
              disabled={!hasNfcSupport}
              className="w-full bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Tap to Write
            </button>
          </div>
        )}

        {step === 'writing' && (
          <div className="text-center py-8">
            <div className="animate-pulse text-text-secondary">
              Hold your card near the device...
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
