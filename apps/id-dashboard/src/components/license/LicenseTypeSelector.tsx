import React from 'react';

interface LicenseType {
  name: string;
  price: string;
  licensingAgreement: string;
  cryptoDiscount: number;
}

interface LicenseTypeSelectorProps {
  licenseType: 'perpetual' | 'annual';
  onLicenseTypeChange: (type: 'perpetual' | 'annual') => void;
  licenseTypes: Record<string, LicenseType>;
}

export const LicenseTypeSelector: React.FC<LicenseTypeSelectorProps> = React.memo(({ 
  licenseType, 
  onLicenseTypeChange, 
  licenseTypes 
}) => {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--secondary-text-color)' }}>
        License Type
      </label>
      <div className="space-y-2">
        <label className="flex items-center" style={{ color: 'var(--secondary-text-color)' }}>
          <input
            type="radio"
            value="perpetual"
            checked={licenseType === 'perpetual'}
            onChange={(e) => onLicenseTypeChange(e.target.value as 'perpetual' | 'annual')}
            className="mr-2"
          />
          Perpetual License - $3,999 (One-time payment)
        </label>
        <label className="flex items-center" style={{ color: 'var(--secondary-text-color)' }}>
          <input
            type="radio"
            value="annual"
            checked={licenseType === 'annual'}
            onChange={(e) => onLicenseTypeChange(e.target.value as 'perpetual' | 'annual')}
            className="mr-2"
          />
          Annual License - $1,499/year (Renewable)
        </label>
      </div>
    </div>
  );
});

LicenseTypeSelector.displayName = 'LicenseTypeSelector';
