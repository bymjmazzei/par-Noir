import React, { useState, useEffect } from 'react';
import { FileText, Smartphone, Usb, CreditCard, Laptop } from 'lucide-react';
import { SectionInfo } from '../common/SectionInfo';

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
  onExportDeviceBound?: () => void;
  canExportDeviceBound?: boolean;
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
  onExportDeviceBound,
  canExportDeviceBound,
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
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Export Options</h2>
            <SectionInfo title="Export Options">
              <p>Choose how you want to export your pN file. Download saves a portable file; USB and NFC bind to hardware; device-bound backups unlock only on this keyed device; transfer moves the identity to another device.</p>
            </SectionInfo>
          </div>
          <button
            onClick={handleClose}
            className="modal-close-button"
          >
            ×
          </button>
        </div>
        
        <div className="space-y-4">
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

          {onExportDeviceBound && canExportDeviceBound && (
            <button
              onClick={onExportDeviceBound}
              className="w-full p-4 border border-border rounded-lg hover:bg-secondary transition-colors text-left"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Laptop className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="font-medium">Download (device-bound)</div>
                  <div className="text-sm text-text-secondary">
                    Only unlocks on this keyed device. Keep a portable backup too.
                  </div>
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
