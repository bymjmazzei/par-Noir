import React from 'react';

interface CryptoPaymentSectionProps {
  cryptoCurrency: 'BTC' | 'ETH' | 'XRP' | 'USDT';
  onCryptoCurrencyChange: (currency: 'BTC' | 'ETH' | 'XRP' | 'USDT') => void;
  inputBgColor: string;
  borderColor: string;
  textColor: string;
  secondaryTextColor: string;
}

export const CryptoPaymentSection: React.FC<CryptoPaymentSectionProps> = React.memo(({ 
  cryptoCurrency, 
  onCryptoCurrencyChange, 
  inputBgColor, 
  borderColor, 
  textColor, 
  secondaryTextColor 
}) => {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium mb-2" style={{ color: secondaryTextColor }}>
        Cryptocurrency
      </label>
      <div className="text-sm mb-2" style={{ color: secondaryTextColor }}>
        Pay with cryptocurrency
      </div>
      <select
        value={cryptoCurrency}
        onChange={(e) => onCryptoCurrencyChange(e.target.value as 'BTC' | 'ETH' | 'XRP' | 'USDT')}
        className="w-full p-2 border rounded focus:outline-none"
        style={{ 
          backgroundColor: inputBgColor,
          borderColor: borderColor,
          color: textColor
        }}
      >
        <option value="BTC">Bitcoin (BTC)</option>
        <option value="ETH">Ethereum (ETH)</option>
        <option value="XRP">Ripple (XRP)</option>
        <option value="USDT">Tether (USDT)</option>
      </select>
    </div>
  );
});

CryptoPaymentSection.displayName = 'CryptoPaymentSection';
