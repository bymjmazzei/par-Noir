import React, { useState, useEffect } from 'react';
import { StandardDataPoint } from '../types/standardDataPoints';
import { VerificationModal } from './VerificationModal';

interface DataPointInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataPoint: StandardDataPoint;
  existingData?: any;
  /** Parent mints the template's claims and writes the Knowledge doc; it closes the modal on success. */
  onComplete: (userData: Record<string, any>) => Promise<void>;
  identityId?: string;
  /** ML-DSA public key for the unlocked session (often differs from identityId / volume id). */
  identityPublicKey?: string;
}

export const DataPointInputModal: React.FC<DataPointInputModalProps> = ({
  isOpen,
  onClose,
  dataPoint,
  existingData,
  onComplete,
  identityId,
  identityPublicKey
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

    await completeWith(userData);
  };

  const completeWith = async (data: Record<string, any>) => {
    setLoading(true);
    try {
      await onComplete(data);
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
      
      await completeWith(updatedUserData);
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
      case 'prefix': return 'Prefix';
      case 'suffix': return 'Suffix';
      case 'nickname': return 'Nickname';
      case 'documentType': return 'Document type';
      case 'documentNumber': return 'Document number';
      case 'fileId': return 'Document image';
      case 'country': return 'Country';
      case 'region': return 'Region / State';
      case 'city': return 'City';
      case 'postalCode': return 'Postal code';
      default: return field.charAt(0).toUpperCase() + field.slice(1);
    }
  };

  const handleDocumentFile = async (file: File | null) => {
    if (!file) return;
    setLoading(true);
    try {
      const { uploadZkpDocEncrypted } = await import('../services/zkpDocsStorageService');
      const authToken =
        (await import('../services/ownerApiToken')).requireOwnerApiToken();
      const credentials = (await import('@par-noir/identity-crypto')).SecureCredentialManager.getCredentials(
        identityId || ''
      );
      if (!credentials || !identityId) {
        throw new Error('Unlock required to store document images');
      }
      const { deriveCanonicalPnIdentifier } = await import('@par-noir/pqc-crypto/oauth-unlock-proof');
      const pnIdentifier = deriveCanonicalPnIdentifier(identityPublicKey || '');
      const fileId = await uploadZkpDocEncrypted({
        file,
        pnIdentifier,
        authToken,
        key1: credentials.key1,
        key2: credentials.key2,
        sessionId: identityId || undefined
      });
      handleInputChange('fileId', fileId);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Failed to upload document image');
    } finally {
      setLoading(false);
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

          {/* Form Fields */}
          <div className="space-y-4">
            {(dataPoint as { documentImage?: boolean }).documentImage ? (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Image file {(dataPoint.requiredFields || []).includes('fileId') ? '*' : '(Optional)'}
                </label>
                <input
                  type="file"
                  accept="image/*"
                  disabled={loading}
                  onChange={(e) => void handleDocumentFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-text-secondary"
                />
                {userData.fileId ? (
                  <p className="text-xs text-green-400 mt-1">Encrypted image stored</p>
                ) : null}
                {errors.fileId && <p className="text-red-500 text-xs mt-1">{errors.fileId}</p>}
              </div>
            ) : (
              <>
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
              </>
            )}
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
