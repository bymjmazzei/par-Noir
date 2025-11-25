/**
 * Extension Warning Banner Component
 * 
 * Displays warnings to users about potentially suspicious browser extensions.
 */

import React, { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { ExtensionDetector, ExtensionWarning } from '../../utils/security/extensionDetector';

interface ExtensionWarningBannerProps {
  onDismiss?: () => void;
}

export const ExtensionWarningBanner: React.FC<ExtensionWarningBannerProps> = ({ onDismiss }) => {
  const [warnings, setWarnings] = useState<ExtensionWarning[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check for warnings periodically
    const checkWarnings = () => {
      const currentWarnings = ExtensionDetector.getWarnings();
      setWarnings(currentWarnings);
      setIsVisible(currentWarnings.length > 0 && !dismissed);
    };

    // Initial check
    checkWarnings();

    // Check every 30 seconds
    const interval = setInterval(checkWarnings, 30000);

    return () => clearInterval(interval);
  }, [dismissed]);

  const handleDismiss = () => {
    setDismissed(true);
    setIsVisible(false);
    onDismiss?.();
  };

  if (!isVisible || warnings.length === 0) {
    return null;
  }

  // Get highest severity warning
  const highSeverityWarnings = warnings.filter(w => w.severity === 'high');
  const displayWarning = highSeverityWarnings.length > 0 ? highSeverityWarnings[0] : warnings[0];

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3 flex-1">
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
                Security Warning: Browser Extension Detected
              </h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">
                {displayWarning.message}
              </p>
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                <strong>Recommendation:</strong> {displayWarning.recommendation}
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="ml-4 text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200 flex-shrink-0"
            aria-label="Dismiss warning"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

