import React from 'react';

interface TransferCodeInputProps {
  transferCode: string;
  onCodeChange: (code: string) => void;
  loading: boolean;
}

export const TransferCodeInput: React.FC<TransferCodeInputProps> = React.memo(({ 
  transferCode, 
  onCodeChange, 
  loading 
}) => {
  return (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-2">
        Transfer code
      </label>
      <input
        type="password"
        value={transferCode}
        onChange={(e) => onCodeChange(e.target.value)}
        className="w-full px-3 py-2 bg-input-bg border border-border rounded-md text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        placeholder="Enter the transfer code"
        disabled={loading}
      />
    </div>
  );
});

TransferCodeInput.displayName = 'TransferCodeInput';
