import React, { useState, useEffect } from 'react';
import { LicenseVerification, LicenseInfo } from '../utils/licenseVerification';
import { CoinbaseProxy, CoinbaseCheckout, CheckoutRequest } from '../utils/coinbaseProxy';

interface LicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLicensePurchased: (licenseKey: string) => void;
}

interface LicenseType {
  name: string;
  price: string;
  licensingAgreement: string;
  cryptoDiscount: number;
}



export const LicenseModal: React.FC<LicenseModalProps> = ({
  isOpen,
  onClose,
  onLicensePurchased
}) => {
  const [licenseType, setLicenseType] = useState<'perpetual' | 'annual'>('perpetual');
  const [cryptoCurrency, setCryptoCurrency] = useState<'BTC' | 'ETH' | 'XRP' | 'USDT'>('BTC');
  const [isProcessing, setIsProcessing] = useState(false);
  const [identityFile, setIdentityFile] = useState<File | null>(null);
  const [identityHash, setIdentityHash] = useState<string>('');
  const [identityName, setIdentityName] = useState<string>('');
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>('dark');
  const [showCryptoPayment, setShowCryptoPayment] = useState(false);
  const [paymentRequest, setPaymentRequest] = useState<CoinbaseCheckout | null>(null);
  const [error, setError] = useState<string>('');

  const licenseTypes: Record<string, LicenseType> = {
    perpetual: {
      name: 'Perpetual License',
      price: '$3,999',
      licensingAgreement: 'https://identityprotocol.com/licensing/perpetual-agreement',
      cryptoDiscount: 0
    },
    annual: {
      name: 'Annual License',
      price: '$1,499/year',
      licensingAgreement: 'https://identityprotocol.com/licensing/annual-agreement',
      cryptoDiscount: 0
    }
  };

  const getBasePrice = (): number => {
    switch (licenseType) {
      case 'perpetual': return 3999;
      case 'annual': return 1499;
      default: return 3999;
    }
  };

  const getTotalPrice = (): number => {
    return getBasePrice();
  };

  useEffect(() => {
    // Function to update theme
    const updateTheme = () => {
      const isDarkTheme = document.documentElement.className.includes('theme-dark');
      setCurrentTheme(isDarkTheme ? 'dark' : 'light');
    };

    // Initial theme check
    updateTheme();

    // Listen for theme changes
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  const createCoinbaseCheckout = async (): Promise<CoinbaseCheckout> => {
    const totalPrice = getTotalPrice();
    
    const checkoutData: CheckoutRequest = {
      name: licenseTypes[licenseType].name,
      description: `Identity Protocol ${licenseType} license`,
      pricing_type: 'fixed_price',
      local_price: {
        amount: totalPrice.toString(),
        currency: 'USD'
      },
      requested_info: ['email'],
      metadata: {
        licenseType: licenseType,
        identityHash: identityHash,
        licensePrice: totalPrice.toString()
      }
    };

    
    // Validate checkout data
    if (!CoinbaseProxy.validateCheckoutData(checkoutData)) {
      throw new Error('Invalid checkout data');
    }

    // Use the smart proxy with fallbacks
    return await CoinbaseProxy.createCheckout(checkoutData);
  };

  const handleCryptoPurchase = async () => {
    setIsProcessing(true);
    setError('');
    
    try {
      const checkout = await createCoinbaseCheckout();
      setPaymentRequest(checkout);
      setShowCryptoPayment(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to create payment request');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleIdentityFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      // Read and parse the identity file
      const fileContent = await file.text();
      const identityData = JSON.parse(fileContent);
      
      // Generate hash of the identity file
      const encoder = new TextEncoder();
      const data = encoder.encode(fileContent);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      setIdentityFile(file);
      setIdentityHash(hash);
      setIdentityName(identityData.metadata?.displayName || identityData.metadata?.username || 'Unknown Identity');
    } catch (error) {
      alert('Invalid identity file. Please upload a valid .pn, .id, .json, or .identity file.');
    }
  };

  const generateLicenseInfo = async (): Promise<LicenseInfo> => {
    // Use the new LicenseVerification system to generate commercial license
    return await LicenseVerification.generateCommercialLicense(licenseType, identityHash, identityName);
  };

  const handlePurchase = async () => {
    if (!identityFile) {
      alert('Please upload your identity file');
      return;
    }

    await handleCryptoPurchase();
  };

  if (!isOpen) return null;

  // Theme-aware colors
  const isDark = currentTheme === 'dark';
  const bgColor = isDark ? '#1a1a1a' : '#ffffff';
  const textColor = isDark ? '#ffffff' : '#000000';
  const borderColor = isDark ? '#333333' : '#e0e0e0';
  const inputBgColor = isDark ? '#2a2a2a' : '#f5f5f5';
  const secondaryTextColor = isDark ? '#cccccc' : '#666666';
  const accentColor = isDark ? '#6b7280' : '#3b82f6';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div
        className="border rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: bgColor,
          borderColor: borderColor
        }}
      >
        <style dangerouslySetInnerHTML={{
          __html: `
            input[type="radio"]:checked {
              accent-color: ${accentColor} !important;
            }
            input[type="radio"] {
              accent-color: ${secondaryTextColor} !important;
            }
            input:focus, select:focus {
              outline: none !important;
              border-color: ${accentColor} !important;
              box-shadow: 0 0 0 2px ${accentColor}40 !important;
            }
          `
        }} />

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold" style={{ color: textColor }}>Purchase Commercial License</h2>
          <button
            onClick={onClose}
            className="text-xl"
            style={{ color: secondaryTextColor }}
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded border" style={{ 
            backgroundColor: isDark ? '#2a1a1a' : '#fff5f5',
            borderColor: isDark ? '#cc4444' : '#fecaca',
            color: isDark ? '#ffaaaa' : '#dc2626'
          }}>
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2" style={{ color: secondaryTextColor }}>License Type</label>
          <div className="space-y-2">
            <label className="flex items-center" style={{ color: secondaryTextColor }}>
              <input
                type="radio"
                value="perpetual"
                checked={licenseType === 'perpetual'}
                onChange={(e) => setLicenseType(e.target.value as any)}
                className="mr-2"
              />
              Perpetual License - $3,999 (One-time payment)
            </label>
            <label className="flex items-center" style={{ color: secondaryTextColor }}>
              <input
                type="radio"
                value="annual"
                checked={licenseType === 'annual'}
                onChange={(e) => setLicenseType(e.target.value as any)}
                className="mr-2"
              />
              Annual License - $1,499/year (Renewable)
            </label>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2" style={{ color: secondaryTextColor }}>Identity File</label>
          <div className="relative">
            <input
              type="file"
              accept=".pn,.id,.json,.identity"
              onChange={handleIdentityFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              id="license-file-upload"
            />
            <label
              htmlFor="license-file-upload"
              className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors"
              style={{ 
                borderColor: borderColor,
                backgroundColor: inputBgColor
              }}
            >
              <div className="text-center">
                <div className="text-2xl mb-2">↑</div>
                <div className="text-sm font-medium" style={{ color: textColor }}>
                  {identityFile ? identityFile.name : 'Tap to upload identity file'}
                </div>
                <div className="text-xs mt-1" style={{ color: secondaryTextColor }}>
                  (.pn, .id, .json, .identity files)
                </div>
              </div>
            </label>
          </div>
          <p className="text-xs mt-2" style={{ color: secondaryTextColor }}>
            Your license will be bound to this specific identity file for security.
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2" style={{ color: secondaryTextColor }}>Cryptocurrency</label>
          <div className="text-sm mb-2" style={{ color: secondaryTextColor }}>
            Pay with cryptocurrency
          </div>
                      <select
              value={cryptoCurrency}
              onChange={(e) => setCryptoCurrency(e.target.value as any)}
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

        <div 
          className="border p-4 rounded mb-6"
          style={{ 
            backgroundColor: inputBgColor,
            borderColor: borderColor
          }}
        >
          <h3 className="font-semibold mb-2" style={{ color: textColor }}>{licenseTypes[licenseType].name}</h3>
          <p className="text-2xl font-bold mb-2" style={{ color: textColor }}>
            ${getTotalPrice().toLocaleString()}
          </p>

          <div className="mt-3">
            <a 
              href={licenseTypes[licenseType].licensingAgreement}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-sm underline"
              style={{ color: accentColor }}
            >
              <span>View Licensing Agreement</span>
              <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
              </svg>
            </a>
          </div>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handlePurchase}
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
            onClick={onClose}
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
      </div>

      {/* Crypto Payment Modal */}
      {showCryptoPayment && paymentRequest && (
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
                onClick={() => setShowCryptoPayment(false)}
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
                onClick={() => setShowCryptoPayment(false)}
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
      )}
    </div>
  );
};
