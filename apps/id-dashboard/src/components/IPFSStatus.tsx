import React, { useState, useEffect } from 'react';
import { ipfsClient } from '../utils/ipfs';

interface IPFSStats {
  mode: string;
  filesCount: number;
  isConnected: boolean;
}

export const IPFSStatus: React.FC = () => {
  const [stats, setStats] = useState<IPFSStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadIPFSStats();
  }, []);

  const loadIPFSStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const ipfsStats = await ipfsClient.getStats();
      setStats(ipfsStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load IPFS stats');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = () => {
    if (!stats) return 'text-gray-500';
    if (stats.isConnected) return 'text-green-500';
    return 'text-red-500';
  };

  const getStatusIcon = () => {
    if (!stats) return '🌐';
    if (stats.isConnected) return '✅';
    return '❌';
  };

  const getModeBadge = () => {
    if (!stats) return null;
    
    const isProduction = stats.mode === 'production';
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        isProduction 
          ? 'bg-green-100 text-green-800' 
          : 'bg-yellow-100 text-yellow-800'
      }`}>
        {isProduction ? '🚀 Production' : '🔧 Development'}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center space-x-2 text-sm text-gray-600">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
        <span>Loading IPFS status...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center space-x-2 text-sm text-red-600">
        <span>❌</span>
        <span>IPFS Error: {error}</span>
        <button 
          onClick={loadIPFSStats}
          className="text-blue-500 hover:text-blue-700 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-3 text-sm">
      <div className="flex items-center space-x-1">
        <span className={getStatusColor()}>{getStatusIcon()}</span>
        <span className="text-gray-700">IPFS</span>
      </div>
      
      {getModeBadge()}
      
      {stats && (
        <div className="flex items-center space-x-2 text-xs text-gray-500">
          <span>Files: {stats.filesCount}</span>
          <span>•</span>
          <span className={stats.isConnected ? 'text-green-600' : 'text-red-600'}>
            {stats.isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      )}
      
      <button 
        onClick={loadIPFSStats}
        className="text-blue-500 hover:text-blue-700 text-xs underline"
        title="Refresh IPFS status"
      >
        Refresh
      </button>
    </div>
  );
};

export default IPFSStatus;
