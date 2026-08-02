import React, { useState, useEffect } from 'react';
import { CreditCard, AlertTriangle } from 'lucide-react';
import { IdentityCrypto } from '@par-noir/identity-crypto';
import * as nfcAdapter from '../../utils/nfcAdapter';

const PARNOIR_MIME_TYPE = 'application/x-parnoir-identity';

interface ExportToNfcModalProps {
  isOpen: boolean;
  onClose: () => void;
  identityToExport: { encryptedData: string; iv: string; salt: string; publicKey?: string };
  onSuccess: () => void;
  onError: (message: string) => void;
}

export function ExportToNfcModal({
  isOpen,
  onClose,
  identityToExport,
  onSuccess,
  onError,
}: ExportToNfcModalProps) {
  const [step, setStep] = useState<'verify' | 'scan' | 'writing'>('verify');
  const [pnName, setPnName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hasNfcSupport, setHasNfcSupport] = useState(false);

  useEffect(() => {
    nfcAdapter.isSupported().then(setHasNfcSupport);
  }, []);

  const handleClose = () => {
    setStep('verify');
    setPnName('');
    setPasscode('');
    setError(null);
    onClose();
  };

  const handleConfirmVerify = () => {
    setError(null);
    if (!pnName || !passcode) {
      setError('Enter your pN name and passcode to authorize the export');
      return;
    }
    setStep('scan');
  };

  const handleWriteToNfc = async () => {
    setError(null);

    if (!pnName || !passcode) {
      setError('Enter your pN name and passcode first');
      return;
    }

    const supported = await nfcAdapter.isSupported();
    if (!supported) {
      setError('NFC export requires a device with NFC (Android or iOS) or Chrome on Android.');
      return;
    }

    try {
      setStep('writing');

      const cardUid = await nfcAdapter.readTagForUid(60000);

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

      const encoder = new TextEncoder();
      await nfcAdapter.writeTag({
        recordType: 'mime',
        mediaType: PARNOIR_MIME_TYPE,
        data: encoder.encode(boundPnBlob),
      });

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
              NFC export requires a device with NFC (Android or iOS) or Chrome on Android.
            </p>
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              Verify your identity to authorize writing your pN to the NFC card.
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
              onClick={handleConfirmVerify}
              className="w-full bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 transition-colors"
            >
              Continue
            </button>
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
