import React from 'react';

interface TransferReceiverHeaderProps {
  onClose: () => void;
}

export const TransferReceiverHeader: React.FC<TransferReceiverHeaderProps> = React.memo(({ onClose }) => {
  return (
    <div className="flex justify-between items-center mb-4">
      <h1 className="text-xl font-semibold">Unlock Identity Transfer</h1>
      <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
    </div>
  );
});

TransferReceiverHeader.displayName = 'TransferReceiverHeader';
