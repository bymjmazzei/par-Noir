import React, { useMemo } from 'react';

interface SecurityScoreCardProps {
  threats: any[];
  vulnerabilities: any[];
}

export const SecurityScoreCard: React.FC<SecurityScoreCardProps> = React.memo(({ 
  threats, 
  vulnerabilities 
}) => {
  // Calculate security score
  const securityScore = useMemo(() => {
    let score = 100;
    
    // Deduct points for threats
    score -= threats.filter(t => t.severity === 'high').length * 20;
    score -= threats.filter(t => t.severity === 'medium').length * 10;
    score -= threats.filter(t => t.severity === 'low').length * 5;
    
    // Deduct points for vulnerabilities
    score -= vulnerabilities.length * 15;
    
    return Math.max(0, score);
  }, [threats, vulnerabilities]);

  // Determine security level and styling
  const securityLevel = useMemo(() => {
    if (securityScore >= 90) return { level: 'excellent', color: 'text-green-600', bg: 'bg-green-100' };
    if (securityScore >= 75) return { level: 'good', color: 'text-blue-600', bg: 'bg-blue-100' };
    if (securityScore >= 50) return { level: 'fair', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    return { level: 'poor', color: 'text-red-600', bg: 'bg-red-100' };
  }, [securityScore]);

  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Security Score
        </h3>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${securityLevel.bg} ${securityLevel.color}`}>
          {securityLevel.level.toUpperCase()}
        </div>
      </div>
      
      <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        {securityScore}/100
      </div>
      
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div 
          className={`h-2 rounded-full transition-all ${
            securityScore >= 90 ? 'bg-green-500' :
            securityScore >= 75 ? 'bg-blue-500' :
            securityScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
          }`}
          style={{ width: `${securityScore}%` }}
        />
      </div>
      
      <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
        {securityScore >= 90 && 'Excellent security posture'}
        {securityScore >= 75 && securityScore < 90 && 'Good security practices'}
        {securityScore >= 50 && securityScore < 75 && 'Fair security settings'}
        {securityScore < 50 && 'Security improvements recommended'}
      </div>
    </div>
  );
});

SecurityScoreCard.displayName = 'SecurityScoreCard';
