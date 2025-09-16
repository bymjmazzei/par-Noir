// Dashboard Storage Tab - Uses reusable components
import React, { useState, useEffect } from 'react';
import { 
  Upload, 
  Settings, 
  HardDrive, 
  Plus, 
  BarChart3, 
  Info,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { StorageFile, StorageProvider, StorageStats } from '../../types/storage';
import { universalStorageService } from '../../services/universalStorageService';
import { CloudflareUploadModal } from './CloudflareUploadModal';
import { StorageFileManager } from './StorageFileManager';

export const StorageTab: React.FC = () => {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [providers, setProviders] = useState<StorageProvider[]>([]);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showProviderSettings, setShowProviderSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load storage data on mount
  useEffect(() => {
    loadStorageData();
  }, []);

  const loadStorageData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      await universalStorageService.initialize();
      
      const [filesData, providersData, statsData] = await Promise.all([
        universalStorageService.getFiles(),
        universalStorageService.getProviders(),
        universalStorageService.getStorageStats()
      ]);
      
      setFiles(filesData);
      setProviders(providersData);
      setStats(statsData);
    } catch (err) {
      setError(err.message || 'Failed to load storage data');
      console.error('Storage data loading error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadComplete = (uploadedFiles: StorageFile[]) => {
    setFiles(prev => [...prev, ...uploadedFiles]);
    loadStorageData(); // Refresh stats
  };

  const handleFileDelete = async (fileId: string) => {
    try {
      await universalStorageService.deleteFile(fileId);
      setFiles(prev => prev.filter(f => f.id !== fileId));
      loadStorageData(); // Refresh stats
    } catch (err) {
      console.error('Failed to delete file:', err);
    }
  };

  const handleFileShare = (file: StorageFile) => {
    // TODO: Implement file sharing
    console.log('Share file:', file);
  };

  const handleFileDownload = (file: StorageFile) => {
    // Open file URL in new tab
    window.open(file.url, '_blank');
  };

  const handleFileInfo = (file: StorageFile) => {
    // TODO: Show file info modal
    console.log('File info:', file);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStorageUsagePercentage = () => {
    if (!stats) return 0;
    const totalLimit = providers.reduce((sum, p) => sum + p.storageLimit, 0);
    if (totalLimit === 0) return 0;
    return Math.min((stats.totalSize / totalLimit) * 100, 100);
  };

  const getActiveProvider = () => {
    return providers.find(p => p.status === 'active') || providers[0];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading storage...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">Storage Error</h3>
          <p className="text-text-secondary mb-4">{error}</p>
          <button
            onClick={loadStorageData}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Storage</h3>
          <p className="text-text-secondary">Manage your media files and storage providers</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowProviderSettings(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-secondary text-text-primary rounded-lg hover:bg-secondary/80 transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span>Providers</span>
          </button>
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>Upload</span>
          </button>
        </div>
      </div>

      {/* Storage Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Storage Usage */}
        <div className="bg-secondary rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium text-text-primary">Storage Usage</h4>
            <HardDrive className="w-5 h-5 text-text-secondary" />
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-text-secondary">Used</span>
                <span className="text-text-primary">{formatBytes(stats?.totalSize || 0)}</span>
              </div>
              <div className="w-full bg-border rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${getStorageUsagePercentage()}%` }}
                />
              </div>
            </div>
            <div className="text-sm text-text-secondary">
              {stats?.totalFiles || 0} files across {providers.length} provider{providers.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Active Provider */}
        <div className="bg-secondary rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium text-text-primary">Active Provider</h4>
            <CheckCircle className="w-5 h-5 text-green-400" />
          </div>
          <div className="space-y-2">
            <div className="text-lg font-medium text-text-primary">
              {getActiveProvider()?.name || 'No Provider'}
            </div>
            <div className="text-sm text-text-secondary">
              {getActiveProvider()?.isFree ? 'Free Plan' : 'Paid Plan'}
            </div>
            {getActiveProvider() && (
              <div className="text-sm text-text-secondary">
                {formatBytes(getActiveProvider()!.storageUsed)} / {formatBytes(getActiveProvider()!.storageLimit)}
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-secondary rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium text-text-primary">Quick Stats</h4>
            <BarChart3 className="w-5 h-5 text-text-secondary" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Images</span>
              <span className="text-text-primary">{stats?.byType.image.count || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Videos</span>
              <span className="text-text-primary">{stats?.byType.video.count || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Documents</span>
              <span className="text-text-primary">{stats?.byType.document.count || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Audio</span>
              <span className="text-text-primary">{stats?.byType.audio.count || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Provider Status */}
      {providers.length > 0 && (
        <div className="bg-secondary rounded-lg p-6">
          <h4 className="font-medium text-text-primary mb-4">Storage Providers</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {providers.map(provider => (
              <div key={provider.id} className="bg-modal-bg rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-medium text-text-primary">{provider.name}</h5>
                  <div className={`w-2 h-2 rounded-full ${
                    provider.status === 'active' ? 'bg-green-400' : 
                    provider.status === 'error' ? 'bg-red-400' : 'bg-yellow-400'
                  }`} />
                </div>
                <div className="text-sm text-text-secondary space-y-1">
                  <div>{provider.isFree ? 'Free' : 'Paid'} Plan</div>
                  <div>{formatBytes(provider.storageUsed)} / {formatBytes(provider.storageLimit)}</div>
                  <div className="capitalize">{provider.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File Manager */}
      <div className="bg-secondary rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h4 className="font-medium text-text-primary">Your Files</h4>
          <div className="text-sm text-text-secondary">
            {files.length} file{files.length !== 1 ? 's' : ''}
          </div>
        </div>
        
        <StorageFileManager
          files={files}
          onFileSelect={handleFileInfo}
          onFileDelete={handleFileDelete}
          onFileShare={handleFileShare}
          onFileDownload={handleFileDownload}
          onFileInfo={handleFileInfo}
          config={{
            defaultView: 'grid',
            showProvider: true,
            showVisibility: true,
            showActions: true,
            selectable: false,
            sortable: true,
            filterable: true
          }}
        />
      </div>

      {/* Upload Modal */}
      <CloudflareUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadComplete={handleUploadComplete}
      />

      {/* Provider Settings Modal - TODO: Implement */}
      {showProviderSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-modal-bg rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">Storage Providers</h3>
              <button
                onClick={() => setShowProviderSettings(false)}
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                ×
              </button>
            </div>
            <div className="text-center py-8">
              <Settings className="w-12 h-12 text-text-secondary mx-auto mb-4" />
              <p className="text-text-secondary">Provider settings coming soon...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
