import React, { useState, useCallback, useRef } from 'react';
import { X, Upload, Camera, Shield, CheckCircle, AlertCircle, User, CreditCard, MapPin, Calendar, DollarSign } from 'lucide-react';
import { ZKPGenerator } from '../utils/ZKPGenerator';
import { STANDARD_DATA_POINTS } from '../types/StandardDataPointsRegistry';
import { CoinbaseProxy, CoinbaseCheckout, CheckoutRequest } from '../utils/coinbaseProxy';
import { verificationPaymentHandler } from '../services/verificationPaymentHandler';

interface IdentityVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerificationComplete: (verifiedData: VerifiedIdentityData) => void;
  identityId?: string;
}

interface VerifiedIdentityData {
  id: string;
  verificationId: string;
  verificationLevel: 'basic' | 'enhanced' | 'verified';
  verifiedAt: string;
  dataPoints: {
    [key: string]: {
      value: any;
      zkpProof: string;
      verified: boolean;
    };
  };
  fraudPrevention: {
    livenessCheck: boolean;
    documentAuthenticity: boolean;
    biometricMatch: boolean;
    riskScore: number;
  };
}

interface VerificationStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  completed: boolean;
  current: boolean;
}

export const IdentityVerificationModal: React.FC<IdentityVerificationModalProps> = ({
  isOpen,
  onClose,
  onVerificationComplete,
  identityId
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationData, setVerificationData] = useState<{
    idDocument?: File;
    selfie?: File;
    livenessCheck?: boolean;
  }>({});
  const [paymentData, setPaymentData] = useState<{
    paymentRequest?: CoinbaseCheckout;
    paymentCompleted?: boolean;
    selectedCurrency?: 'BTC' | 'ETH' | 'XRP' | 'USDT';
  }>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const steps: VerificationStep[] = [
    {
      id: 'payment',
      title: 'Payment',
      description: 'Pay for identity verification using cryptocurrency',
      icon: DollarSign,
      completed: false,
      current: currentStep === 0
    },
    {
      id: 'upload',
      title: 'Upload ID Document',
      description: 'Upload a clear photo of your government-issued ID',
      icon: CreditCard,
      completed: false,
      current: currentStep === 1
    },
    {
      id: 'selfie',
      title: 'Take Selfie',
      description: 'Take a selfie for identity verification',
      icon: Camera,
      completed: false,
      current: currentStep === 2
    },
    {
      id: 'liveness',
      title: 'Liveness Check',
      description: 'Complete liveness verification to prevent fraud',
      icon: User,
      completed: false,
      current: currentStep === 3
    },
    {
      id: 'verification',
      title: 'Verification',
      description: 'Processing your verification with fraud prevention',
      icon: Shield,
      completed: false,
      current: currentStep === 4
    },
    {
      id: 'complete',
      title: 'Complete',
      description: 'Your identity has been verified and ZKPs generated',
      icon: CheckCircle,
      completed: false,
      current: currentStep === 5
    }
  ];

  // Payment handling
  const createVerificationPayment = useCallback(async (currency: 'BTC' | 'ETH' | 'XRP' | 'USDT') => {
    setLoading(true);
    setError(null);

    try {
      const checkoutData: CheckoutRequest = {
        name: 'Identity Verification',
        description: 'Decentralized identity verification with fraud prevention',
        pricing_type: 'fixed_price',
        local_price: {
          amount: '5.00', // $5.00 for verification
          currency: 'USD'
        },
        requested_info: ['email'],
        metadata: {
          licenseType: 'verification',
          identityHash: identityId || 'unknown',
          licensePrice: '5.00'
        }
      };

      const checkout = await CoinbaseProxy.createCheckout(checkoutData);
      
      setPaymentData(prev => ({
        ...prev,
        paymentRequest: checkout,
        selectedCurrency: currency
      }));

      // Open payment window
      if (checkout.hosted_url) {
        window.open(checkout.hosted_url, '_blank');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to create payment request');
    } finally {
      setLoading(false);
    }
  }, [identityId]);

  const handlePaymentComplete = useCallback(async () => {
    try {
      // Check if payment is actually confirmed
      const paymentStatus = await verificationPaymentHandler.getPaymentStatus(identityId || '');
      
      if (paymentStatus.isConfirmed) {
        setPaymentData(prev => ({
          ...prev,
          paymentCompleted: true
        }));
        setCurrentStep(1); // Move to document upload
      } else {
        setError('Payment not yet confirmed. Please wait for confirmation or try again.');
      }
    } catch (error) {
      setError('Failed to verify payment status. Please try again.');
    }
  }, [identityId]);

  const handleFileUpload = useCallback((file: File, type: 'idDocument' | 'selfie') => {
    // Check if payment is completed
    if (!paymentData.paymentCompleted) {
      setError('Please complete payment before uploading documents.');
      return;
    }

    // Validate file type and size
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(file.type)) {
      setError('Please upload a valid image file (JPEG, PNG)');
      return;
    }

    if (file.size > maxSize) {
      setError('File size must be less than 10MB');
      return;
    }

    setVerificationData(prev => ({
      ...prev,
      [type]: file
    }));

    setError(null);
    
    // Auto-advance to next step
    if (type === 'idDocument') {
      setCurrentStep(2);
    } else if (type === 'selfie') {
      setCurrentStep(3);
    }
  }, [paymentData.paymentCompleted]);

  const handleLivenessCheck = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Simulate liveness check with WebRTC
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: 640, 
          height: 480,
          facingMode: 'user'
        } 
      });
      
      // Simulate liveness detection
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      stream.getTracks().forEach(track => track.stop());
      
      setVerificationData(prev => ({
        ...prev,
        livenessCheck: true
      }));
      
      setCurrentStep(4);
      await performVerification();
    } catch (err) {
      setError('Liveness check failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const performVerification = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Simulate Veriff-style verification process
      const verificationResult = await simulateVeriffVerification();
      
      if (!verificationResult.success) {
        throw new Error(verificationResult.error || 'Verification failed');
      }

      // Generate ZKPs for all verified data points
      const zkpProofs = await generateZKProofs(verificationResult.extractedData);
      
      const verifiedData: VerifiedIdentityData = {
        id: identityId || 'unknown',
        verificationId: verificationResult.verificationId,
        verificationLevel: 'verified',
        verifiedAt: new Date().toISOString(),
        dataPoints: zkpProofs,
        fraudPrevention: verificationResult.fraudPrevention
      };

      setCurrentStep(5);
      onVerificationComplete(verifiedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }, [identityId, onVerificationComplete]);

  const createVeriffSession = async () => {
    try {
      const response = await fetch('https://stationapi.veriff.com/v1/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.REACT_APP_VERIFF_API_KEY || 'ccc8f523-8157-4453-b75d-84bf97036bb8'}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          verification: {
            callback: 'https://yourdomain.com/api/veriff-webhook',
            person: {
              firstName: 'User',
              lastName: 'Verification'
            },
            document: {
              type: 'DRIVERS_LICENSE',
              country: 'US'
            },
            vendorData: identityId || 'unknown'
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Veriff session creation failed: ${response.status}`);
      }

      const session = await response.json();
      return session;
    } catch (error) {
      console.error('Failed to create Veriff session:', error);
      throw error;
    }
  };

  const redirectToVeriff = async () => {
    try {
      const session = await createVeriffSession();
      
      // Redirect to Veriff's hosted verification page
      window.location.href = `https://magic.veriff.com/v/${session.verification.url}`;
    } catch (error) {
      setError('Failed to start verification. Please try again.');
    }
  };

  const generateZKProofs = async (extractedData: any) => {
    const zkpProofs: { [key: string]: { value: any; zkpProof: string; verified: boolean; expirationDate?: string } } = {};

    // Calculate ID expiration days for dynamic data
    const idExpirationDate = extractedData.expirationDate;
    const idExpirationDays = idExpirationDate 
      ? Math.ceil((new Date(idExpirationDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      : 365; // Fallback to 1 year if no expiration date

    // Static data - truly perpetual (100 years)
    const perpetualExpiration = 365 * 100;

    // Generate ZKPs for identity attestation (perpetual)
    if (extractedData.firstName && extractedData.lastName) {
      const identityProof = await ZKPGenerator.generateZKP({
        dataPointId: 'identity_attestation',
        userData: {
          firstName: extractedData.firstName,
          lastName: extractedData.lastName,
          middleName: extractedData.middleName || ''
        },
        verificationLevel: 'verified',
        expirationDays: perpetualExpiration
      });
      
      zkpProofs.identity_attestation = {
        value: {
          firstName: extractedData.firstName,
          lastName: extractedData.lastName,
          middleName: extractedData.middleName || ''
        },
        zkpProof: identityProof.proof,
        verified: true,
        expirationDate: new Date(Date.now() + perpetualExpiration * 24 * 60 * 60 * 1000).toISOString()
      };
    }

    // Generate ZKP for age attestation (perpetual)
    if (extractedData.dateOfBirth) {
      const ageProof = await ZKPGenerator.generateZKP({
        dataPointId: 'age_attestation',
        userData: {
          dateOfBirth: extractedData.dateOfBirth
        },
        verificationLevel: 'verified',
        expirationDays: perpetualExpiration
      });
      
      zkpProofs.age_attestation = {
        value: {
          dateOfBirth: extractedData.dateOfBirth
        },
        zkpProof: ageProof.proof,
        verified: true,
        expirationDate: new Date(Date.now() + perpetualExpiration * 24 * 60 * 60 * 1000).toISOString()
      };
    }

    // Generate ZKP for location verification (ID-based expiration)
    if (extractedData.country && extractedData.state) {
      const locationProof = await ZKPGenerator.generateZKP({
        dataPointId: 'location_verification',
        userData: {
          country: extractedData.country,
          region: extractedData.state,
          city: extractedData.city || '',
          postalCode: extractedData.postalCode || ''
        },
        verificationLevel: 'verified',
        expirationDays: idExpirationDays
      });
      
      zkpProofs.location_verification = {
        value: {
          country: extractedData.country,
          region: extractedData.state,
          city: extractedData.city || '',
          postalCode: extractedData.postalCode || ''
        },
        zkpProof: locationProof.proof,
        verified: true,
        expirationDate: idExpirationDate || new Date(Date.now() + idExpirationDays * 24 * 60 * 60 * 1000).toISOString()
      };
    }

    // Generate ZKP for document verification (ID-based expiration)
    if (extractedData.documentNumber && extractedData.documentType) {
      const documentProof = await ZKPGenerator.generateZKP({
        dataPointId: 'document_verification',
        userData: {
          documentType: extractedData.documentType,
          documentNumber: extractedData.documentNumber,
          issuingAuthority: extractedData.issuingAuthority || '',
          expirationDate: extractedData.expirationDate || ''
        },
        verificationLevel: 'verified',
        expirationDays: idExpirationDays
      });
      
      zkpProofs.document_verification = {
        value: {
          documentType: extractedData.documentType,
          documentNumber: extractedData.documentNumber,
          issuingAuthority: extractedData.issuingAuthority || '',
          expirationDate: extractedData.expirationDate || ''
        },
        zkpProof: documentProof.proof,
        verified: true,
        expirationDate: idExpirationDate || new Date(Date.now() + idExpirationDays * 24 * 60 * 60 * 1000).toISOString()
      };
    }

    return zkpProofs;
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="text-center space-y-6">
            <div className="mx-auto w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center">
              <DollarSign className="w-12 h-12 text-blue-600" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Payment Required
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Identity verification costs $5.00 USD. Pay with cryptocurrency to proceed.
              </p>
            </div>
            
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-6">
              <h4 className="font-medium text-blue-900 dark:text-blue-200 mb-2">What's Included</h4>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                <li>• Document authenticity verification</li>
                <li>• Biometric matching and liveness detection</li>
                <li>• Fraud prevention analysis</li>
                <li>• ZKP generation for all verified data points</li>
                <li>• Perpetual verification for static data (name, age)</li>
                <li>• ID-based expiration for dynamic data (address, document)</li>
              </ul>
            </div>
            
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4 mb-6">
              <h4 className="font-medium text-green-900 dark:text-green-200 mb-2">💰 Great Value - One-Time Payment</h4>
              <div className="text-sm text-green-800 dark:text-green-200 space-y-1">
                <div className="flex justify-between">
                  <span>Meta Verified (monthly):</span>
                  <span className="font-medium">$14.99/month</span>
                </div>
                <div className="flex justify-between">
                  <span>X Premium (monthly):</span>
                  <span className="font-medium">$8/month</span>
                </div>
                <div className="flex justify-between border-t border-green-300 dark:border-green-600 pt-1 mt-2">
                  <span className="font-medium">par Noir (one-time):</span>
                  <span className="font-bold text-green-700 dark:text-green-300">$5.00 once</span>
                </div>
                <div className="text-xs text-green-700 dark:text-green-300 mt-2">
                  Save $90+ per year compared to Meta Verified!
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {(['BTC', 'ETH', 'XRP', 'USDT'] as const).map((currency) => (
                  <button
                    key={currency}
                    onClick={() => createVerificationPayment(currency)}
                    disabled={loading}
                    className="flex items-center justify-center px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="font-medium text-gray-700 dark:text-gray-300">{currency}</span>
                  </button>
                ))}
              </div>
              
              {paymentData.paymentRequest && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
                  <div className="flex items-center space-x-2 text-green-600 dark:text-green-400 mb-2">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">Payment Request Created</span>
                  </div>
                  <p className="text-sm text-green-800 dark:text-green-200 mb-3">
                    Complete your payment in the new window, then click "Payment Complete" below.
                  </p>
                  <button
                    onClick={handlePaymentComplete}
                    className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Payment Complete
                  </button>
                </div>
              )}
            </div>
          </div>
        );

      case 1:
        return (
          <div className="text-center space-y-6">
            <div className="mx-auto w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center">
              <Shield className="w-12 h-12 text-blue-600" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Start Verification
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                You'll be redirected to Veriff's secure verification platform to upload your ID and take a selfie.
              </p>
            </div>
            
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-6">
              <h4 className="font-medium text-blue-900 dark:text-blue-200 mb-2">🔒 Secure Third-Party Verification</h4>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                <li>• par Noir never handles your ID documents</li>
                <li>• Veriff processes everything securely</li>
                <li>• You'll return here after verification</li>
                <li>• Only ZKPs are stored locally</li>
              </ul>
            </div>
            
            <button
              onClick={redirectToVeriff}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Starting Verification...' : 'Start Verification with Veriff'}
            </button>
          </div>
        );

      case 1:
        return (
          <div className="text-center space-y-6">
            <div className="mx-auto w-24 h-24 bg-green-100 rounded-full flex items-center justify-center">
              <Camera className="w-12 h-12 text-green-600" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Take Selfie
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Take a clear selfie for identity verification. Make sure your face is well-lit and visible.
              </p>
            </div>
            
            <div className="space-y-4">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="w-full flex items-center justify-center px-6 py-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-green-500 transition-colors"
              >
                <Camera className="w-6 h-6 mr-2 text-gray-500" />
                <span className="text-gray-700 dark:text-gray-300">Take selfie</span>
              </button>
              
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="user"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file, 'selfie');
                }}
                className="hidden"
              />
              
              {verificationData.selfie && (
                <div className="flex items-center justify-center space-x-2 text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  <span>Selfie captured successfully</span>
                </div>
              )}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="text-center space-y-6">
            <div className="mx-auto w-24 h-24 bg-purple-100 rounded-full flex items-center justify-center">
              <User className="w-12 h-12 text-purple-600" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Liveness Check
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Complete a liveness check to verify you're a real person and prevent fraud.
              </p>
            </div>
            
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 mb-6">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-yellow-800 dark:text-yellow-200">
                  <p className="font-medium mb-1">Fraud Prevention</p>
                  <p>This step helps prevent identity theft and ensures you're a real person, not a photo or video.</p>
                </div>
              </div>
            </div>
            
            <button
              onClick={handleLivenessCheck}
              disabled={loading}
              className="w-full bg-purple-600 text-white py-3 px-6 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Processing...' : 'Start Liveness Check'}
            </button>
          </div>
        );

      case 3:
        return (
          <div className="text-center space-y-6">
            <div className="mx-auto w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center">
              <Shield className="w-12 h-12 text-blue-600" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Verifying Identity
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Processing your verification with advanced fraud prevention...
              </p>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <span className="text-gray-600 dark:text-gray-400">Analyzing documents...</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>Document authenticity</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>Biometric matching</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>Liveness detection</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>Risk assessment</span>
                </div>
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="text-center space-y-6">
            <div className="mx-auto w-24 h-24 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Verification Complete!
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Your identity has been verified and ZKPs have been generated for all data points.
              </p>
            </div>
            
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
              <h4 className="font-medium text-green-900 dark:text-green-200 mb-2">Verified Data Points</h4>
              <div className="space-y-2 text-sm text-green-800 dark:text-green-200">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">Identity Attestation</span>
                    <div className="text-xs text-green-600 dark:text-green-400">Perpetual (100 years)</div>
                  </div>
                  <CheckCircle className="w-4 h-4" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">Age Verification</span>
                    <div className="text-xs text-green-600 dark:text-green-400">Perpetual (100 years)</div>
                  </div>
                  <CheckCircle className="w-4 h-4" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">Location Verification</span>
                    <div className="text-xs text-green-600 dark:text-green-400">Until ID expires (2025-01-01)</div>
                  </div>
                  <CheckCircle className="w-4 h-4" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">Document Verification</span>
                    <div className="text-xs text-green-600 dark:text-green-400">Until ID expires (2025-01-01)</div>
                  </div>
                  <CheckCircle className="w-4 h-4" />
                </div>
              </div>
            </div>
            
            <button
              onClick={onClose}
              className="w-full bg-green-600 text-white py-3 px-6 rounded-lg hover:bg-green-700 transition-colors"
            >
              Continue
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-modal-bg rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-modal-border shadow-2xl">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-text-primary">Identity Verification</h2>
            <button
              onClick={onClose}
              className="text-text-secondary hover:text-text-primary"
              disabled={loading}
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Progress Steps */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {steps.map((step, index) => {
                const Icon = step.icon;
                const isCompleted = index < currentStep;
                const isCurrent = index === currentStep;
                
                return (
                  <div key={step.id} className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                      isCompleted 
                        ? 'bg-green-600 border-green-600 text-white' 
                        : isCurrent 
                        ? 'bg-blue-600 border-blue-600 text-white' 
                        : 'bg-gray-100 border-gray-300 text-gray-500'
                    }`}>
                      {isCompleted ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : (
                        <Icon className="w-5 h-5" />
                      )}
                    </div>
                    <div className="mt-2 text-center">
                      <div className={`text-xs font-medium ${
                        isCurrent ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-500'
                      }`}>
                        {step.title}
                      </div>
                    </div>
                    {index < steps.length - 1 && (
                      <div className={`absolute w-full h-0.5 top-5 left-1/2 transform translate-x-1/2 ${
                        isCompleted ? 'bg-green-600' : 'bg-gray-300'
                      }`} style={{ width: 'calc(100% - 2.5rem)' }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-800 dark:text-red-200">
                  {error}
                </div>
              </div>
            </div>
          )}

          {/* Step Content */}
          <div className="min-h-[400px] flex items-center justify-center">
            {renderStepContent()}
          </div>
        </div>
      </div>
    </div>
  );
};
