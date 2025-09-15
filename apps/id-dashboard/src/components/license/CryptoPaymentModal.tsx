import React from 'react';

interface CoinbaseCheckout {
  name: string;
  local_price: {
    amount: string;
    currency: string;
  };
  hosted_url: string;
}

interface CryptoPaymentModalProps {
  isOpen: boolean;
  paymentRequest: CoinbaseCheckout | null;
  onClose: () => void;
  bgColor: string;
  borderColor: string;
  textColor: string;
  secondaryTextColor: string;
  isDark: boolean;
}

export const CryptoPaymentModal: React.FC<CryptoPaymentModalProps> = React.memo(({ 
  isOpen, 
  paymentRequest, 
  onClose, 
  bgColor, 
  borderColor, 
  textColor, 
  secondaryTextColor, 
  isDark 
}) => {
  if (!isOpen || !paymentRequest) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div 
        className="border rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
        style={{ 
          backgroundColor: bgColor,
          borderColor: borderColor
        }}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold" style={{ color: textColor }}>Crypto Payment</h2>
          <button
            onClick={onClose}
            className="text-xl"
            style={{ color: secondaryTextColor }}
          >
            ×
          </button>
        </div>

        <div className="text-center mb-6">
          <div className="mb-4">
            <h3 className="font-semibold mb-2" style={{ color: textColor }}>
              {paymentRequest.name}
            </h3>
            <p className="text-2xl font-bold" style={{ color: textColor }}>
              ${paymentRequest.local_price.amount}
            </p>
          </div>

          <div className="mb-6">
            <p className="text-sm mb-4" style={{ color: secondaryTextColor }}>
              Click the button below to complete your payment with Coinbase Commerce
            </p>
            
            <button
              onClick={() => {
                window.open(paymentRequest.hosted_url, '_blank', 'noopener,noreferrer');
              }}
              className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <span>Pay with Crypto</span>
              <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
              </svg>
            </button>
          </div>

          <div className="text-xs" style={{ color: secondaryTextColor }}>
            <p>• Payment will open in a new window</p>
            <p>• You can pay with Bitcoin, Ethereum, and other cryptocurrencies</p>
            <p>• License will be issued after payment confirmation</p>
            <p>• Debug URL: {paymentRequest.hosted_url}</p>
          </div>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 rounded"
            style={{
              backgroundColor: isDark ? '#333333' : '#e0e0e0',
              color: isDark ? '#cccccc' : '#666666'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
});

CryptoPaymentModal.displayName = 'CryptoPaymentModal';
