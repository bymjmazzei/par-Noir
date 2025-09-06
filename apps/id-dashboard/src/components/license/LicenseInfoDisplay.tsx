import React from 'react';
import { LicenseInfo } from '../utils/licenseVerification';

interface LicenseInfoDisplayProps {
  licenseInfo: LicenseInfo;
  licenseKey: string;
  onRemoveLicense: () => void;
}

export const LicenseInfoDisplay: React.FC = ({ isOpen, onClose, settings, onSettingsChange }) => {
  licenseInfo,
  licenseKey,
  onRemoveLicense
}) => {
  const getLicenseStatusColor = (status: string, isCommercial: boolean) => {
    if (isCommercial) {
      switch (status) {
        case 'active': return 'text-white bg-gray-800 border-gray-600';
        case 'expired': return 'text-gray-300 bg-gray-900 border-gray-700';
        case 'pending': return 'text-gray-400 bg-gray-800 border-gray-600';
        default: return 'text-gray-400 bg-gray-900 border-gray-700';
      }
    } else {
      return 'text-white bg-blue-900 border-blue-600';
    }
  };

  const getLicenseStatusIcon = (status: string, isCommercial: boolean) => {
    if (isCommercial) {
      switch (status) {
        case 'active': return '✓';
        case 'expired': return '⚠';
        case 'pending': return '⏳';
        default: return '?';
      }
    } else {
      return '🆓';
    }
  };

  const getLicenseTypeDisplay = (type: string) => {
    switch (type) {
      case 'free': return 'Free Non-Commercial';
      case 'perpetual': return 'Perpetual Commercial';
      case 'annual': return 'Annual Commercial';
      default: return type;
    }
  };

  return (
    <div className={`border border-gray-700 rounded-lg p-4 mb-6 ${getLicenseStatusColor(licenseInfo.status, licenseInfo.isCommercial)}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center text-white">
          <span className="mr-2">{getLicenseStatusIcon(licenseInfo.status, licenseInfo.isCommercial)}</span>
          {licenseInfo.isCommercial ? 'Commercial License Active' : 'Free License Active'}
        </h3>
        {licenseInfo.isCommercial && (
          <button
            onClick={onRemoveLicense}
            className="text-sm text-gray-400 hover:text-gray-300"
          >
            Downgrade to Free
          </button>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-sm font-medium text-gray-300">License Key</p>
          <p className="font-mono text-sm bg-gray-800 border border-gray-600 px-2 py-1 rounded mt-1 break-all text-gray-200">
            {licenseKey}
          </p>
        </div>
        
        <div>
          <p className="text-sm font-medium text-gray-300">Type</p>
          <p className="capitalize mt-1 text-white">{getLicenseTypeDisplay(licenseInfo.type)}</p>
        </div>
        
        <div>
          <p className="text-sm font-medium text-gray-300">Issued</p>
          <p className="mt-1 text-white">
            {licenseInfo.issuedAt ? new Date(licenseInfo.issuedAt).toLocaleDateString() : 'Unknown'}
          </p>
        </div>
        
        <div>
          <p className="text-sm font-medium text-gray-300">Expires</p>
          <p className="mt-1 text-white">
            {licenseInfo.expiresAt === 'Never' ? 'Never (Perpetual)' : 
             licenseInfo.expiresAt ? new Date(licenseInfo.expiresAt).toLocaleDateString() : 'Unknown'}
          </p>
        </div>
        
        <div>
          <p className="text-sm font-medium text-gray-300">Bound Identity</p>
          <p className="mt-1 text-white">Demo Identity</p>
        </div>

        {licenseInfo.transferredFrom && (
          <div>
            <p className="text-sm font-medium text-gray-300">Transferred From</p>
            <p className="mt-1 text-white font-mono text-xs">
              {licenseInfo.transferredFrom.substring(0, 16)}...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
