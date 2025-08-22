import React from 'react';
import { config, isDev, getEnvironmentInfo } from '../config/environment';

interface DevelopmentModeIndicatorProps {
  className?: string;
}

export const DevelopmentModeIndicator: React.FC<DevelopmentModeIndicatorProps> = ({ className = '' }) => {
  if (!isDev()) {
    return null; // Don't show in production
  }

  const envInfo = getEnvironmentInfo();

  return (
    <div className={`fixed bottom-4 right-4 z-50 bg-yellow-500 text-black px-3 py-2 rounded-lg text-xs font-mono shadow-lg ${className}`}>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        <span>DEV MODE</span>
      </div>
      <div className="text-xs opacity-75 mt-1">
        {envInfo.hostname}:{envInfo.port}
      </div>
      <div className="text-xs opacity-75">
        {config.features.enableWebSocket ? 'WS: ON' : 'WS: OFF'} | 
        {config.features.enableCloudSync ? ' SYNC: ON' : ' SYNC: OFF'}
      </div>
    </div>
  );
};

