import React from 'react';
import { LicenseProof, LicenseReceipt } from '../utils/licenseVerification';

interface LicenseVerificationProps {
  licenseProof: LicenseProof | null;
  receipt: LicenseReceipt | null;
  licenseKey: string | undefined;
  onVerifyProof: () => void;
  onDownloadProof: () => void;
  onDownloadReceipt: () => void;
}

export const LicenseVerification: React.FC = ({ isOpen, onClose, settings, onSettingsChange }) => {
  licenseProof,
  receipt,
  licenseKey,
  onVerifyProof,
  onDownloadProof,
  onDownloadReceipt
}) => {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded p-3">
      <h4 className="font-medium mb-3 text-white">Verification & Receipts</h4>
      <div className="flex flex-wrap gap-2">
        {licenseProof && (
          <>
            <button
              onClick={onVerifyProof}
              className="bg-gray-700 text-white px-3 py-1 rounded text-sm hover:bg-gray-600"
            >
              Verify Proof
            </button>
            <button
              onClick={onDownloadProof}
              className="bg-gray-700 text-white px-3 py-1 rounded text-sm hover:bg-gray-600"
            >
              Download Proof
            </button>
          </>
        )}
        {receipt && (
          <button
            onClick={onDownloadReceipt}
            className="bg-gray-700 text-white px-3 py-1 rounded text-sm hover:bg-gray-600"
          >
            Download Receipt
          </button>
        )}
      </div>
      {licenseProof && (
        <p className="text-xs text-gray-400 mt-2">
          ZKP Proof ID: {licenseProof.proof.substring(0, 16)}...
        </p>
      )}
    </div>
  );
};
