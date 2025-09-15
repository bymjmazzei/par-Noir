import React from 'react';

interface TransferData {
  id: string;
  ipfsCid: string;
  nickname: string;
  transferPasscode: string;
  expiresAt: string;
  directData?: any;
}

interface TransferInfoCardProps {
  transferData: TransferData;
}

export const TransferInfoCard: React.FC<TransferInfoCardProps> = React.memo(({ transferData }) => {
  return (
    <div className="bg-secondary p-3 rounded-lg">
      <div className="text-sm text-text-primary">
        <strong>From:</strong> {transferData.nickname}
      </div>
      <div className="text-xs text-text-secondary mt-1">
        Expires: {new Date(transferData.expiresAt).toLocaleString()}
      </div>
      <div className="text-xs text-text-secondary mt-2">
        {transferData.ipfsCid.startsWith('direct-transfer-') 
          ? '📱 Direct Transfer (Data included in URL)'
          : '🌐 IPFS Transfer (Decentralized storage)'
        }
      </div>
    </div>
  );
});

TransferInfoCard.displayName = 'TransferInfoCard';
