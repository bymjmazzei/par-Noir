import React, { useState, useEffect } from 'react';
import { FileText, Smartphone, Usb, CreditCard } from 'lucide-react';

import * as nfcAdapter from '../../utils/nfcAdapter';

interface ExportOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  exportAuthData: { pnName: string; passcode: string };
  setExportAuthData: (data: { pnName: string; passcode: string }) => void;
  setShowExportPnName: (show: boolean) => void;
  setShowExportPasscode: (show: boolean) => void;
  onDownloadExport: () => void;
  onExportToUsb?: () => void;
  onExportToNfc?: () => void;
  onTransfer: () => void;
}

export function ExportOptionsModal({
  isOpen,
  onClose,
  exportAuthData,
  setExportAuthData,
  setShowExportPnName,
  setShowExportPasscode,
  onDownloadExport,
  onExportToUsb,
  onExportToNfc,
  onTransfer
}: ExportOptionsModalProps) {
  const [hasNfcSupport, setHasNfcSupport] = useState(false);
  useEffect(() => {
    nfcAdapter.isSupported().then(setHasNfcSupport);
  }, []);

  if (!isOpen) return null;

  const handleClose = () => {
    setExportAuthData({ pnName: '', passcode: '' });
    setShowExportPnName(false);
    setShowExportPasscode(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full text-text-primary">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Export Options</h2>
          <button
            onClick={handleClose}
            className="modal-close-button"
          >
            ×
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="text-sm text-text-secondary mb-4">
            Choose how you want to export your pN file:
          </div>
          
          <button
            onClick={onDownloadExport}
            className="w-full p-4 border border-border rounded-lg hover:bg-secondary transition-colors text-left"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <div>
                <div className="font-medium">Download</div>
                <div className="text-sm text-text-secondary">Save pN file to your device</div>
              </div>
            </div>
          </button>

          {onExportToUsb && (
            <button
              onClick={onExportToUsb}
              className="w-full p-4 border border-border rounded-lg hover:bg-secondary transition-colors text-left"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Usb className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="font-medium">Export to USB</div>
                  <div className="text-sm text-text-secondary">Bind to passcode-protected drive</div>
                </div>
              </div>
            </button>
          )}

          {onExportToNfc && hasNfcSupport && (
            <button
              onClick={onExportToNfc}
              className="w-full p-4 border border-border rounded-lg hover:bg-secondary transition-colors text-left"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <CreditCard className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="font-medium">Export to NFC</div>
                  <div className="text-sm text-text-secondary">Bind to NFC card/fob</div>
                </div>
              </div>
            </button>
          )}
          
          <button
            onClick={onTransfer}
            className="w-full p-4 border border-border rounded-lg hover:bg-secondary transition-colors text-left"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-primary" />
              </div>
              <div>
                <div className="font-medium">Transfer to Device</div>
                <div className="text-sm text-text-secondary">Generate URL for another device to unlock pN identity</div>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
