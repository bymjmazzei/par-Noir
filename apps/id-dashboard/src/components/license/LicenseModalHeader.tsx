import React from 'react';

interface LicenseModalHeaderProps {
  onClose: () => void;
}

export const LicenseModalHeader: React.FC<LicenseModalHeaderProps> = React.memo(({ onClose }) => {
  return (
    <div className="flex justify-between items-center mb-6">
      <div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-color)' }}>
          Enterprise License Required
        </h1>
        <p className="text-sm" style={{ color: 'var(--secondary-text-color)' }}>
          This feature requires a commercial license for enterprise use
        </p>
      </div>
      <button
        onClick={onClose}
        className="text-2xl font-bold"
        style={{ color: 'var(--secondary-text-color)' }}
      >
        ×
      </button>
    </div>
  );
});

LicenseModalHeader.displayName = 'LicenseModalHeader';
