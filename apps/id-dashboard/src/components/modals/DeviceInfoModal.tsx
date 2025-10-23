import React from 'react';
import { Info } from 'lucide-react';

interface DeviceInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDevice?: { name: string };
}

export function DeviceInfoModal({
  isOpen,
  onClose,
  currentDevice
}: DeviceInfoModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Info className="w-5 h-5" />
            Device Sync Information
          </h3>
          <button 
            onClick={onClose}
            className="modal-close-button"
          >
            ✕
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="text-sm text-text-secondary space-y-2">
            <p>• <strong>Primary Device:</strong> {currentDevice?.name || 'This Device'} (marked with green dot)</p>
            <p>• <strong>QR Code Pairing:</strong> Generate QR code on this device, scan with new device</p>
            <p>• <strong>Encrypted Sync:</strong> All data synced between devices is encrypted</p>
            <p>• <strong>Real-time Updates:</strong> Changes sync automatically across all devices</p>
            <p>• <strong>Device Limits:</strong> Maximum 5 synced devices per identity</p>
            <p>• <strong>Security:</strong> Only trusted devices can access your identity data</p>
          </div>
          
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
