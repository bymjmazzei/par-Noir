import React from 'react';
import { CheckCircle, Clock, Shield } from 'lucide-react';

export const ProcessingStep: React.FC = () => {
  return (
    <div className="processing-step">
      <div className="processing-animation">
        <div className="spinner"></div>
      </div>
      
      <div className="processing-content">
        <h4>Verifying Your Identity</h4>
        <p>This may take a few moments...</p>
        
        <div className="processing-steps">
          <div className="processing-step-item completed">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span>Uploading documents</span>
          </div>
          
          <div className="processing-step-item completed">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span>Authenticating document</span>
          </div>
          
          <div className="processing-step-item active">
            <Clock className="w-5 h-5 text-blue-600 animate-pulse" />
            <span>Extracting data</span>
          </div>
          
          <div className="processing-step-item">
            <Shield className="w-5 h-5 text-gray-400" />
            <span>Generating verification</span>
          </div>
        </div>
        
        <div className="processing-info">
          <p className="text-sm text-gray-600">
            We're using advanced AI to verify your identity and extract data from your documents.
            This process is secure and your data is encrypted.
          </p>
        </div>
      </div>
    </div>
  );
};
