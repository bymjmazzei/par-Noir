import React, { useState, useEffect } from 'react';

interface OfflineModeToggleProps {
  className?: string;
  onModeChange?: (isOfflineMode: boolean) => void;
}

export const OfflineModeToggle: React.FC<OfflineModeToggleProps> = ({ 
  className = '',
  onModeChange
}) => {
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // Load saved offline mode preference
    const savedOfflineMode = localStorage.getItem('offlineMode') === 'true';
    setIsOfflineMode(savedOfflineMode);
    
    // Check network status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleToggle = () => {
    const newMode = !isOfflineMode;
    setIsOfflineMode(newMode);
    localStorage.setItem('offlineMode', newMode.toString());
    onModeChange?.(newMode);
  };

  // Update offline mode when online status changes
  useEffect(() => {
    if (!isOnline && !isOfflineMode) {
      setIsOfflineMode(true);
      onModeChange?.(true);
    }
  }, [isOnline, isOfflineMode, onModeChange]);




  return (
    <div className={`offline-mode-toggle ${className}`}>
      <button
        onClick={handleToggle}
        disabled={!isOnline}
        className={`relative inline-flex h-8 w-16 items-center rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
          isOfflineMode 
            ? 'bg-red-500' 
            : 'bg-green-500'
        } ${
          !isOnline 
            ? 'opacity-50 cursor-not-allowed' 
            : 'cursor-pointer hover:shadow-md'
        }`}
        data-offline-mode={isOfflineMode}
        data-online={isOnline}
        title={!isOnline ? 'Cannot toggle while offline' : 'Toggle offline mode'}
      >
        {/* ON/OFF Labels */}
        <div className="absolute inset-0 flex items-center justify-between px-2 text-xs font-bold text-white">
          <span className={`transition-opacity duration-300 ${isOfflineMode ? 'opacity-100' : 'opacity-50'}`}>
            OFF
          </span>
          <span className={`transition-opacity duration-300 ${!isOfflineMode ? 'opacity-100' : 'opacity-50'}`}>
            ON
          </span>
        </div>
        
        {/* Toggle Handle */}
        <span
          className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-300 ${
            isOfflineMode ? 'translate-x-9' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
};

export default OfflineModeToggle;