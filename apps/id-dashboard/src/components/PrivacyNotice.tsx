import React from 'react';
import { Shield, Lock, Eye, Trash2 } from 'lucide-react';

interface PrivacyNoticeProps {
  className?: string;
}

export const PrivacyNotice: React.FC<PrivacyNoticeProps> = ({ className = '' }) => {
  return (
    <div className={`privacy-notice ${className}`}>
      <div className="privacy-header">
        <Shield className="w-5 h-5 text-green-600" />
        <h4>Privacy & Security</h4>
      </div>
      
      <div className="privacy-features">
        <div className="privacy-feature">
          <Lock className="w-4 h-4 text-blue-600" />
          <span>Files are encrypted during processing</span>
        </div>
        
        <div className="privacy-feature">
          <Eye className="w-4 h-4 text-blue-600" />
          <span>Only extracted text data is stored</span>
        </div>
        
        <div className="privacy-feature">
          <Trash2 className="w-4 h-4 text-blue-600" />
          <span>Images are deleted immediately after verification</span>
        </div>
      </div>
      
      <div className="privacy-guarantee">
        <p>
          <strong>Your ID images are never stored permanently.</strong> 
          They are only used temporarily for verification and then securely deleted.
        </p>
      </div>
    </div>
  );
};
