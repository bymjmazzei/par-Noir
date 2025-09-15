import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { IDUploadStep } from './IDUploadStep';
import { SelfieCaptureStep } from './SelfieCaptureStep';
import { ProcessingStep } from './ProcessingStep';
import { ResultStep } from './ResultStep';
import { PaymentStep } from './PaymentStep';
import { PrivacyNotice } from './PrivacyNotice';
import { SecureFileHandler } from '../utils/SecureFileHandler';
import '../styles/IDVerification.css';

export interface IDVerificationResult {
  isValid: boolean;
  error?: string;
  verifiedDataPoints?: string[];
  extractedData?: any;
  confidence?: number;
  verificationMethod?: string;
}

interface IDVerificationPopupProps {
  identityId?: string;
  onClose: () => void;
  onComplete: (result: IDVerificationResult) => void;
}

export const IDVerificationPopup: React.FC<IDVerificationPopupProps> = ({
  identityId,
  onClose,
  onComplete
}) => {
  const [step, setStep] = useState<'payment' | 'upload-id' | 'take-selfie' | 'processing' | 'result'>('payment');
  const [idFile, setIdFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [verificationResult, setVerificationResult] = useState<IDVerificationResult | null>(null);
  const [secureFileURLs, setSecureFileURLs] = useState<string[]>([]);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const handlePaymentComplete = (paymentCheckoutId: string) => {
    setCheckoutId(paymentCheckoutId);
    setPaymentCompleted(true);
    setStep('upload-id');
  };

  const handlePaymentError = (error: string) => {
    setVerificationResult({ 
      isValid: false, 
      error: `Payment failed: ${error}` 
    });
    setStep('result');
  };

  const handleIDUpload = (file: File) => {
    // Validate file securely
    const validation = SecureFileHandler.validateFile(file);
    if (!validation.isValid) {
      setVerificationResult({ 
        isValid: false, 
        error: validation.error 
      });
      setStep('result');
      return;
    }
    
    setIdFile(file);
    setStep('take-selfie');
  };

  const handleSelfieCapture = (file: File) => {
    // Validate selfie file
    const validation = SecureFileHandler.validateFile(file);
    if (!validation.isValid) {
      setVerificationResult({ 
        isValid: false, 
        error: validation.error 
      });
      setStep('result');
      return;
    }
    
    setSelfieFile(file);
    setStep('processing');
    
    // Start secure verification process
    verifyIdentitySecurely();
  };

  const verifyIdentitySecurely = async () => {
    if (!idFile || !selfieFile) return;

    try {
      // Import the secure verification service
      const { SecureIdentityVerificationService } = await import('../services/SecureIdentityVerificationService');
      const verificationService = new SecureIdentityVerificationService();
      
      // Process verification securely
      const result = await verificationService.verifyIdentity(idFile, selfieFile, identityId);
      
      // Clean up files immediately after verification
      await cleanupFiles();
      
      setVerificationResult(result);
      setStep('result');
    } catch (error) {
      // Clean up files even on error
      await cleanupFiles();
      
      setVerificationResult({ 
        isValid: false, 
        error: error instanceof Error ? error.message : 'Verification failed' 
      });
      setStep('result');
    }
  };

  const cleanupFiles = async () => {
    try {
      // Securely delete files
      if (idFile) {
        await SecureFileHandler.secureDeleteFile(idFile);
        setIdFile(null);
      }
      
      if (selfieFile) {
        await SecureFileHandler.secureDeleteFile(selfieFile);
        setSelfieFile(null);
      }
      
      // Revoke all secure URLs
      secureFileURLs.forEach(url => {
        SecureFileHandler.secureRevokeURL(url);
      });
      setSecureFileURLs([]);
      
    } catch (error) {
      console.warn('File cleanup warning:', error);
    }
  };

  const handleComplete = () => {
    if (verificationResult) {
      onComplete(verificationResult);
    }
  };

  // Secure cleanup on component unmount
  useEffect(() => {
    cleanupRef.current = async () => {
      await cleanupFiles();
    };

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);

  // Cleanup on close
  const handleClose = async () => {
    await cleanupFiles();
    onClose();
  };

  return (
    <div className="popup-overlay">
      <div className="id-verification-popup">
        <div className="popup-header">
          <h3>Identity Verification</h3>
          <button onClick={handleClose} className="close-button">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="popup-content">
          {step === 'payment' && (
            <PaymentStep
              identityId={identityId || ''}
              onPaymentComplete={handlePaymentComplete}
              onPaymentError={handlePaymentError}
            />
          )}
          
          {step === 'upload-id' && (
            <>
              <IDUploadStep onUpload={handleIDUpload} />
              <PrivacyNotice className="mt-4" />
            </>
          )}
          
          {step === 'take-selfie' && (
            <>
              <SelfieCaptureStep onCapture={handleSelfieCapture} />
              <PrivacyNotice className="mt-4" />
            </>
          )}
          
          {step === 'processing' && (
            <ProcessingStep />
          )}
          
          {step === 'result' && verificationResult && (
            <ResultStep 
              result={verificationResult}
              onClose={onClose}
              onComplete={handleComplete}
            />
          )}
        </div>
      </div>
    </div>
  );
};
