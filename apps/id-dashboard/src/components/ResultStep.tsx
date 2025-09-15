import React from 'react';
import { CheckCircle, XCircle, AlertCircle, RotateCcw } from 'lucide-react';
import { IDVerificationResult } from './IDVerificationPopup';

interface ResultStepProps {
  result: IDVerificationResult;
  onClose: () => void;
  onComplete: () => void;
}

export const ResultStep: React.FC<ResultStepProps> = ({ 
  result, 
  onClose, 
  onComplete 
}) => {
  if (result.isValid) {
    return (
      <div className="result-step success">
        <div className="result-icon">
          <CheckCircle className="w-16 h-16 text-green-600" />
        </div>
        
        <div className="result-content">
          <h4>Identity Verified!</h4>
          <p>Your identity has been successfully verified</p>
          
          {result.extractedData && (
            <div className="verified-data">
              <h5>Verified Data Points:</h5>
              <div className="data-points-grid">
                {Object.entries(result.extractedData).map(([key, value]) => (
                  <div key={key} className="data-point-item">
                    <span className="data-label">{formatDataLabel(key)}:</span>
                    <span className="data-value">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {result.confidence && (
            <div className="confidence-score">
              <span className="confidence-label">Verification Confidence:</span>
              <span className="confidence-value">{Math.round(result.confidence * 100)}%</span>
            </div>
          )}
        </div>
        
        <div className="result-actions">
          <button onClick={() => {
            onComplete();
            onClose();
          }} className="btn-primary">
            CONTINUE
          </button>
        </div>
      </div>
    );
  } else {
    return (
      <div className="result-step error">
        <div className="result-icon">
          <XCircle className="w-16 h-16 text-red-600" />
        </div>
        
        <div className="result-content">
          <h4>Verification Failed</h4>
          <p>{result.error || 'Unable to verify your identity'}</p>
          
          <div className="error-suggestions">
            <h5>Please try:</h5>
            <ul>
              <li>Ensure the image is clear and readable</li>
              <li>Check that all text is visible</li>
              <li>Use a government-issued ID</li>
              <li>Try a different photo angle</li>
              <li>Ensure good lighting</li>
            </ul>
          </div>
        </div>
        
        <div className="result-actions">
          <button onClick={onClose} className="btn-secondary">
            <RotateCcw className="w-4 h-4 mr-2" />
            TRY AGAIN
          </button>
        </div>
      </div>
    );
  }
};

const formatDataLabel = (key: string): string => {
  const labels: { [key: string]: string } = {
    firstName: 'First Name',
    lastName: 'Last Name',
    dateOfBirth: 'Date of Birth',
    address: 'Address',
    licenseNumber: 'License Number',
    expirationDate: 'Expiration Date'
  };
  
  return labels[key] || key;
};
