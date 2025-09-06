import React from 'react';

interface LicenseModalFooterProps {
  isProcessing: boolean;
  onPurchase: () => void;
  onCancel: () => void;
  isDark: boolean;
}

export const LicenseModalFooter: React.FC<LicenseModalFooterProps> = React.memo(({ 
  isProcessing, 
  onPurchase, 
  onCancel, 
  isDark 
}) => {
  return (
    <div className="flex space-x-3">
      <button
        onClick={onPurchase}
        disabled={isProcessing}
        className="flex-1 px-4 py-2 rounded-lg font-medium transition-colors"
        style={{
          backgroundColor: isProcessing ? (isDark ? '#666666' : '#cccccc') : (isDark ? '#ffffff' : '#000000'),
          color: isProcessing ? (isDark ? '#cccccc' : '#666666') : (isDark ? '#000000' : '#ffffff')
        }}
      >
        {isProcessing ? 'Processing...' : 'Purchase License'}
      </button>
      <button
        onClick={onCancel}
        disabled={isProcessing}
        className="flex-1 px-4 py-2 rounded-lg font-medium transition-colors"
        style={{
          backgroundColor: isProcessing ? (isDark ? '#1a1a1a' : '#f5f5f5') : (isDark ? '#333333' : '#e0e0e0'),
          color: isProcessing ? (isDark ? '#666666' : '#999999') : (isDark ? '#cccccc' : '#666666')
        }}
      >
        Cancel
      </button>
    </div>
  );
});

LicenseModalFooter.displayName = 'LicenseModalFooter';
