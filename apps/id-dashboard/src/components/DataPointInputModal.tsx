import React, { useState, useEffect } from 'react';
import { StandardDataPoint, ZKPGenerationRequest } from '../types/standardDataPoints';
import type { EncryptedIdentity } from '../types/crypto';
import { VerificationModal } from './VerificationModal';

interface DataPointInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataPoint: StandardDataPoint;
  existingData?: any;
  onComplete: (proofs: any[], userData: any) => void;
  identityId?: string;
  /** ML-DSA public key for the unlocked session (often differs from identityId / volume id). */
  identityPublicKey?: string;
  encryptedIdentity?: EncryptedIdentity;
  /** Same SimpleStorage/SecureStorage loader used for owner API tokens after unlock. */
  loadEncryptedIdentity?: (
    identityPublicKeyOrId: string
  ) => Promise<{ encryptedData: string; iv: string; salt: string } | null>;
}

export const DataPointInputModal: React.FC<DataPointInputModalProps> = ({
  isOpen,
  onClose,
  dataPoint,
  existingData,
  onComplete,
  identityId,
  identityPublicKey,
  encryptedIdentity,
  loadEncryptedIdentity
}) => {
  const [userData, setUserData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationData, setVerificationData] = useState<{
    type: 'email' | 'phone' | 'location';
    target: string;
    dataPointId: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      console.log('🔄 [DataPointInputModal] Modal opened', {
        dataPointId: dataPoint.id,
        dataPointName: dataPoint.name,
        hasExistingData: !!existingData
      });
      // Initialize with existing data or empty values
      const initialData: Record<string, any> = {};
      dataPoint.requiredFields?.forEach(field => {
        initialData[field] = existingData?.[field] || '';
      });
      dataPoint.optionalFields?.forEach(field => {
        initialData[field] = existingData?.[field] || '';
      });
      setUserData(initialData);
      setErrors({});
      console.log('🔄 [DataPointInputModal] Initialized userData:', initialData);
    } else {
      console.log('🔄 [DataPointInputModal] Modal closed');
    }
  }, [isOpen, dataPoint, existingData]);

  const handleInputChange = (field: string, value: any) => {
    setUserData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateData = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    dataPoint.requiredFields?.forEach(field => {
      const value = userData[field];
      if (!value) {
        newErrors[field] = `${field} is required`;
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    console.log('🔄 [DataPointInputModal] handleSubmit called', { 
      dataPointId: dataPoint.id,
      userData,
      hasValidation: true
    });
    
    if (!validateData()) {
      console.warn('⚠️ [DataPointInputModal] Validation failed');
      return;
    }

    console.log('✅ [DataPointInputModal] Validation passed');

    // Check if verification is required for this data point
    const requiresVerification = ['email_verification', 'phone_verification', 'location_verification'].includes(dataPoint.id);
    
    if (requiresVerification) {
      console.log('🔄 [DataPointInputModal] Requires verification, showing verification modal');
      // Determine verification type and target
      let verificationType: 'email' | 'phone' | 'location' = 'email';
      let target = '';
      
      if (dataPoint.id === 'email_verification') {
        verificationType = 'email';
        target = userData.email;
      } else if (dataPoint.id === 'phone_verification') {
        verificationType = 'phone';
        target = userData.phone;
      } else if (dataPoint.id === 'location_verification') {
        verificationType = 'location';
        target = 'device';
      }
      
      // Set verification data and show verification modal
      setVerificationData({
        type: verificationType,
        target,
        dataPointId: dataPoint.id
      });
      setShowVerificationModal(true);
      return;
    }

    console.log('🔄 [DataPointInputModal] No verification required, generating ZKP');
    // For non-verification data points, proceed with normal ZKP generation
    await generateZKPAndComplete();
  };

  const generateZKPAndComplete = async () => {
    console.log('🔄 [DataPointInputModal] generateZKPAndComplete called', {
      dataPointId: dataPoint.id,
      userData
    });
    
    setLoading(true);

    try {
      let resolved: EncryptedIdentity | undefined = encryptedIdentity;
      if (
        !resolved?.encryptedData ||
        !resolved?.iv ||
        !resolved?.salt ||
        !resolved?.publicKey
      ) {
        const keys = [identityPublicKey, identityId].filter(
          (k): k is string => typeof k === 'string' && k.trim().length > 0
        );
        let partial: { encryptedData: string; iv: string; salt: string } | null = null;
        if (loadEncryptedIdentity) {
          for (const key of keys) {
            partial = await loadEncryptedIdentity(key);
            if (partial?.encryptedData && partial.iv && partial.salt) break;
          }
        }
        if (partial?.encryptedData && partial.iv && partial.salt) {
          const publicKey =
            identityPublicKey ||
            (typeof encryptedIdentity?.publicKey === 'string' ? encryptedIdentity.publicKey : '') ||
            keys[0] ||
            '';
          if (publicKey) {
            resolved = {
              publicKey,
              mlKemPublicKey: encryptedIdentity?.mlKemPublicKey,
              encryptedData: partial.encryptedData,
              iv: partial.iv,
              salt: partial.salt,
            };
          }
        }
      }

      if (!identityId || !resolved?.encryptedData || !resolved.iv || !resolved.salt || !resolved.publicKey) {
        alert('Unlock your identity to generate ZK proofs. Session credentials or the stored pN file are unavailable.');
        return;
      }

      const zkpRequest: ZKPGenerationRequest = {
        dataPointId: dataPoint.id,
        userData: userData,
        verificationLevel: 'basic',
        expirationDays: 365,
        identityId,
        encryptedIdentity: resolved
      };

      console.log('🔄 [DataPointInputModal] Generating ZKP with request:', {
        dataPointId: zkpRequest.dataPointId,
        identityId: zkpRequest.identityId,
        hasEncryptedIdentity: !!zkpRequest.encryptedIdentity,
      });
      const { ZKPGenerator } = await import('../utils/ZKPGenerator');
      const proof = await ZKPGenerator.generateZKP(zkpRequest);
      console.log('✅ [DataPointInputModal] ZKP generated successfully', { proof });
      
      console.log('🔄 [DataPointInputModal] Calling onComplete callback');
      onComplete([proof], userData);
      console.log('✅ [DataPointInputModal] onComplete called, closing modal');
      onClose();
    } catch (error) {
      console.error('❌ [DataPointInputModal] Error generating ZKP:', error);
      alert('Error generating proof. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerificationComplete = async (success: boolean, verifiedData: any) => {
    if (success) {
      // Add verification data to user data
      const updatedUserData = {
        ...userData,
        verified: true,
        verifiedAt: verifiedData.verifiedAt,
        verificationType: verifiedData.type
      };
      
      setUserData(updatedUserData);
      
      // Generate ZKP with verified data
      await generateZKPAndComplete();
    }
    // If verification failed, user can try again
  };

  const getInputType = (field: string): string => {
    if (field === 'dateOfBirth') return 'date';
    if (field === 'email') return 'email';
    if (field === 'phone') return 'tel';
    return 'text';
  };

  const getFieldLabel = (field: string): string => {
    switch (field) {
      case 'dateOfBirth': return 'Date of Birth';
      case 'email': return 'Email Address';
      case 'phone': return 'Phone Number';
      case 'firstName': return 'First Name';
      case 'middleName': return 'Middle Name';
      case 'lastName': return 'Last Name';
      default: return field.charAt(0).toUpperCase() + field.slice(1);
    }
  };

  if (!isOpen) {
    console.log('🔄 [DataPointInputModal] Modal not open, returning null');
    return null;
  }

  console.log('🔄 [DataPointInputModal] Rendering modal', {
    dataPointId: dataPoint.id,
    loading,
    userDataKeys: Object.keys(userData)
  });

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-modal-bg rounded-lg max-w-md w-full border border-modal-border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-text-primary">
              {existingData ? 'Edit' : 'Add'} {dataPoint.name}
            </h2>
            <button
              onClick={onClose}
              className="text-text-secondary hover:text-text-primary"
              disabled={loading}
            >
              ✕
            </button>
          </div>

          {/* Description */}
          <p className="text-text-secondary text-sm mb-6">
            {dataPoint.description}
          </p>

          {/* Form Fields */}
          <div className="space-y-4">
            {dataPoint.requiredFields?.map(field => (
              <div key={field}>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  {getFieldLabel(field)} *
                </label>
                <input
                  type={getInputType(field)}
                  value={userData[field] || ''}
                  onChange={(e) => handleInputChange(field, e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-input-bg text-text-primary placeholder-text-secondary ${
                    errors[field] ? 'border-red-500' : 'border-input-border'
                  }`}
                  placeholder={`Enter ${getFieldLabel(field).toLowerCase()}`}
                  disabled={loading}
                />
                {errors[field] && (
                  <p className="text-red-500 text-xs mt-1">{errors[field]}</p>
                )}
              </div>
            ))}

            {dataPoint.optionalFields?.map(field => (
              <div key={field}>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  {getFieldLabel(field)} (Optional)
                </label>
                <input
                  type={getInputType(field)}
                  value={userData[field] || ''}
                  onChange={(e) => handleInputChange(field, e.target.value)}
                  className="w-full px-3 py-2 border border-input-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-input-bg text-text-primary placeholder-text-secondary"
                  placeholder={`Enter ${getFieldLabel(field).toLowerCase()}`}
                  disabled={loading}
                />
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 mt-6">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-text-secondary border border-border rounded-md hover:bg-secondary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🔄 [DataPointInputModal] Save button clicked');
                handleSubmit();
              }}
              disabled={loading}
              className="px-4 py-2 bg-primary text-bg-primary rounded-md hover:bg-primary/80 disabled:opacity-50 font-medium transition-colors border border-primary"
            >
              {loading ? 'Saving...' : (existingData ? 'Update' : 'Save')}
            </button>
          </div>
        </div>
      </div>

      {/* Verification Modal */}
      {showVerificationModal && verificationData && (
        <VerificationModal
          isOpen={showVerificationModal}
          onClose={() => setShowVerificationModal(false)}
          dataPointId={verificationData.dataPointId}
          dataPointName={dataPoint.name}
          verificationType={verificationData.type}
          target={verificationData.target}
          identityId={identityId || "current"}
          onVerificationComplete={handleVerificationComplete}
        />
      )}
    </div>
  );
};
