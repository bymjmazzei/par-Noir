import React from 'react';

interface TransferPasscodeInputProps {
  transferPasscode: string;
  onPasscodeChange: (passcode: string) => void;
  loading: boolean;
}

export const TransferPasscodeInput: React.FC<TransferPasscodeInputProps> = React.memo(({ 
  transferPasscode, 
  onPasscodeChange, 
  loading 
}) => {
  return (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-2">
        Transfer Passcode
      </label>
      <input
        type="password"
        value={transferPasscode}
        onChange={(e) => onPasscodeChange(e.target.value)}
        className="w-full px-3 py-2 bg-input-bg border border-border rounded-md text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        placeholder="Enter the transfer passcode"
        disabled={loading}
      />
    </div>
  );
});

TransferPasscodeInput.displayName = 'TransferPasscodeInput';
