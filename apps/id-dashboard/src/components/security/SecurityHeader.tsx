import React from 'react';
import { Shield, RefreshCw } from 'lucide-react';

interface SecurityHeaderProps {
  lastCheck: string;
  isChecking: boolean;
  onCheckSecurity: () => void;
}

export const SecurityHeader: React.FC<SecurityHeaderProps> = React.memo(({ 
  lastCheck, 
  isChecking, 
  onCheckSecurity 
}) => {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <Shield className="w-8 h-8 text-blue-600" />
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Security Status
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Last checked: {new Date(lastCheck).toLocaleString()}
          </p>
        </div>
      </div>
      
      <button
        onClick={onCheckSecurity}
        disabled={isChecking}
        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        <RefreshCw className={`w-4 h-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
        {isChecking ? 'Checking...' : 'Check Security'}
      </button>
    </div>
  );
});

SecurityHeader.displayName = 'SecurityHeader';
