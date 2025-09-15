import React, { useState, useEffect } from 'react';
import { CreditCard, Bitcoin, AlertCircle, CheckCircle, Clock, ExternalLink } from 'lucide-react';
import { IDVerificationPaymentService, IDVerificationPaymentRequest } from '../services/IDVerificationPaymentService';

interface PaymentStepProps {
  identityId: string;
  onPaymentComplete: (checkoutId: string) => void;
  onPaymentError: (error: string) => void;
}

export const PaymentStep: React.FC<PaymentStepProps> = ({
  identityId,
  onPaymentComplete,
  onPaymentError
}) => {
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supportedCurrencies] = useState(IDVerificationPaymentService.getSupportedCurrencies());

  const verificationPrice = IDVerificationPaymentService.getVerificationPrice(selectedCurrency);

  const handleCreatePayment = async () => {
    setIsCreatingPayment(true);
    setError(null);

    try {
      const paymentRequest: IDVerificationPaymentRequest = {
        identityId,
        amount: 5.00, // $5.00 USD base price
        currency: selectedCurrency,
        description: 'Government ID verification with secure processing'
      };

      const paymentResult = await IDVerificationPaymentService.createVerificationPayment(paymentRequest);
      
      setCheckoutId(paymentResult.checkoutId);
      setPaymentUrl(paymentResult.hostedUrl);
      
      // Start monitoring payment status
      monitorPaymentStatus(paymentResult.checkoutId);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create payment';
      setError(errorMessage);
      onPaymentError(errorMessage);
    } finally {
      setIsCreatingPayment(false);
    }
  };

  const monitorPaymentStatus = async (checkoutId: string) => {
    const checkStatus = async () => {
      try {
        const status = await IDVerificationPaymentService.checkPaymentStatus(checkoutId);
        
        if (status.status === 'completed') {
          onPaymentComplete(checkoutId);
          return;
        }
        
        if (status.status === 'failed' || status.status === 'expired') {
          setError(`Payment ${status.status}. Please try again.`);
          onPaymentError(`Payment ${status.status}`);
          return;
        }
        
        // Continue monitoring if still pending/processing
        if (status.status === 'pending' || status.status === 'processing') {
          setTimeout(checkStatus, 5000); // Check every 5 seconds
        }
      } catch (error) {
        console.error('Payment status check failed:', error);
        setTimeout(checkStatus, 10000); // Retry every 10 seconds on error
      }
    };

    // Start monitoring
    checkStatus();
  };

  const openPaymentWindow = () => {
    if (paymentUrl) {
      window.open(paymentUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const getCurrencyIcon = (currency: string) => {
    switch (currency.toUpperCase()) {
      case 'BTC':
        return <Bitcoin className="w-4 h-4" />;
      case 'ETH':
        return <div className="w-4 h-4 bg-blue-500 rounded-full" />;
      case 'XRP':
        return <div className="w-4 h-4 bg-blue-600 rounded-full" />;
      case 'USDT':
        return <div className="w-4 h-4 bg-green-500 rounded-full" />;
      default:
        return <CreditCard className="w-4 h-4" />;
    }
  };

  const getCurrencyName = (currency: string) => {
    switch (currency.toUpperCase()) {
      case 'BTC':
        return 'Bitcoin';
      case 'ETH':
        return 'Ethereum';
      case 'XRP':
        return 'Ripple';
      case 'USDT':
        return 'Tether';
      default:
        return 'USD';
    }
  };

  return (
    <div className="payment-step">
      <div className="step-header">
        <h4>Complete Payment</h4>
        <p>Pay $5.00 to verify your identity with government-issued ID</p>
      </div>

      {error && (
        <div className="error-message">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {!paymentUrl ? (
        <div className="payment-setup">
          <div className="currency-selection">
            <h5>Select Payment Method</h5>
            <div className="currency-options">
              {supportedCurrencies.map((currency) => (
                <button
                  key={currency}
                  onClick={() => setSelectedCurrency(currency)}
                  className={`currency-option ${selectedCurrency === currency ? 'selected' : ''}`}
                >
                  {getCurrencyIcon(currency)}
                  <span>{getCurrencyName(currency)}</span>
                  <span className="currency-code">({currency})</span>
                </button>
              ))}
            </div>
          </div>

          <div className="payment-summary">
            <div className="summary-row">
              <span>Identity Verification</span>
              <span>${verificationPrice.toFixed(2)} {selectedCurrency}</span>
            </div>
            <div className="summary-row total">
              <span>Total</span>
              <span>${verificationPrice.toFixed(2)} {selectedCurrency}</span>
            </div>
          </div>

          <button
            onClick={handleCreatePayment}
            disabled={isCreatingPayment}
            className="btn-primary"
          >
            {isCreatingPayment ? 'CREATING PAYMENT...' : 'PAY WITH CRYPTO'}
          </button>
        </div>
      ) : (
        <div className="payment-created">
          <div className="payment-success">
            <CheckCircle className="w-8 h-8 text-green-500" />
            <h5>Payment Created Successfully</h5>
            <p>Complete your payment to proceed with verification</p>
          </div>

          <div className="payment-actions">
            <button
              onClick={openPaymentWindow}
              className="btn-primary"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              OPEN PAYMENT WINDOW
            </button>
          </div>

          <div className="payment-status">
            <Clock className="w-4 h-4 text-blue-500" />
            <span>Waiting for payment confirmation...</span>
          </div>

          <div className="payment-instructions">
            <h6>Payment Instructions:</h6>
            <ul>
              <li>Click "Open Payment Window" to complete your payment</li>
              <li>Follow the instructions in the payment window</li>
              <li>Payment will be confirmed automatically</li>
              <li>You can close this popup and return later</li>
            </ul>
          </div>
        </div>
      )}

      <div className="payment-security">
        <div className="security-badge">
          <CheckCircle className="w-4 h-4 text-green-500" />
          <span>Secure Payment</span>
        </div>
        <div className="security-badge">
          <CheckCircle className="w-4 h-4 text-green-500" />
          <span>Powered by Coinbase Commerce</span>
        </div>
      </div>
    </div>
  );
};
