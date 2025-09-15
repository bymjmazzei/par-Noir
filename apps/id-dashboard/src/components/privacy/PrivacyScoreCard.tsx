import React, { useMemo } from 'react';

interface PrivacyScoreCardProps {
  privacySettings: {
    dataSharing: 'private' | 'selective' | 'public';
    analytics: boolean;
    thirdPartyAccess: boolean;
    locationSharing: boolean;
    biometricData: boolean;
    crossPlatformSync: boolean;
    dataRetention: 'minimal' | 'standard' | 'extended';
  };
}

export const PrivacyScoreCard: React.FC<PrivacyScoreCardProps> = React.memo(({ privacySettings }) => {
  // Calculate privacy score based on settings
  const privacyScore = useMemo(() => {
    let score = 100;
    
    // Deduct points for permissive settings
    if (privacySettings.dataSharing === 'public') score -= 30;
    else if (privacySettings.dataSharing === 'selective') score -= 15;
    
    if (privacySettings.analytics) score -= 10;
    if (privacySettings.thirdPartyAccess) score -= 20;
    if (privacySettings.locationSharing) score -= 15;
    if (privacySettings.biometricData) score -= 10;
    if (privacySettings.crossPlatformSync) score -= 10;
    
    if (privacySettings.dataRetention === 'extended') score -= 20;
    else if (privacySettings.dataRetention === 'standard') score -= 10;
    
    return Math.max(0, score);
  }, [privacySettings]);

  // Determine privacy level and styling
  const privacyLevel = useMemo(() => {
    if (privacyScore >= 90) return { level: 'excellent', color: 'text-green-600', bg: 'bg-green-100' };
    if (privacyScore >= 75) return { level: 'good', color: 'text-blue-600', bg: 'bg-blue-100' };
    if (privacyScore >= 50) return { level: 'fair', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    return { level: 'poor', color: 'text-red-600', bg: 'bg-red-100' };
  }, [privacyScore]);

  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Privacy Score
        </h3>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${privacyLevel.bg} ${privacyLevel.color}`}>
          {privacyLevel.level.toUpperCase()}
        </div>
      </div>
      
      <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        {privacyScore}/100
      </div>
      
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div 
          className={`h-2 rounded-full transition-all ${
            privacyScore >= 90 ? 'bg-green-500' :
            privacyScore >= 75 ? 'bg-blue-500' :
            privacyScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
          }`}
          style={{ width: `${privacyScore}%` }}
        />
      </div>
      
      <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
        {privacyScore >= 90 && 'Excellent privacy protection'}
        {privacyScore >= 75 && privacyScore < 90 && 'Good privacy practices'}
        {privacyScore >= 50 && privacyScore < 75 && 'Fair privacy settings'}
        {privacyScore < 50 && 'Privacy improvements recommended'}
      </div>
    </div>
  );
});

PrivacyScoreCard.displayName = 'PrivacyScoreCard';
