import React from 'react';

interface TransferStatusProps {
  error: string;
  success: string;
}

export const TransferStatus: React.FC<TransferStatusProps> = React.memo(({ error, success }) => {
  return (
    <>
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
          <p className="text-green-400 text-sm">{success}</p>
        </div>
      )}
    </>
  );
});

TransferStatus.displayName = 'TransferStatus';
