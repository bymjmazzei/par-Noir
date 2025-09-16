// Google Drive Storage Tab - Clean implementation focused on Google Drive
import React, { useState, useEffect } from 'react';
import { 
  Upload, 
  Settings, 
  HardDrive, 
  Plus, 
  BarChart3, 
  Info,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Lock,
  Globe,
  Users,
  Image,
  Video,
  FileText,
  Music
} from 'lucide-react';
import { StorageFile } from '../../types/storage';
import { GoogleDriveUploadModal } from './GoogleDriveUploadModal';
import { StorageFileManager } from './StorageFileManager';
import { IntegrationConfigManager } from '../../utils/integrationConfig';
import { googleDriveService } from '../../services/googleDriveService';

export const StorageTab: React.FC = () => {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGoogleDriveConnected, setIsGoogleDriveConnected] = useState(false);
  const [storageStats, setStorageStats] = useState({
    totalFiles: 0,
    totalSize: 0,
    byType: {
      image: 0,
      video: 0,
      document: 0,
      audio: 0,
      other: 0
    }
  });

  // Check Google Drive connection status
  useEffect(() => {
    checkGoogleDriveStatus();
  }, []);

  const checkGoogleDriveStatus = () => {
    const accessToken = IntegrationConfigManager.getApiKey('google-drive', 'ACCESS_TOKEN');
    const clientId = IntegrationConfigManager.getApiKey('google-drive', 'CLIENT_ID');
    
    const isConnected = !!(accessToken && clientId);
    setIsGoogleDriveConnected(isConnected);
    
    if (isConnected) {
      loadGoogleDriveFiles();
    } else {
      setLoading(false);
    }
  };

  const loadGoogleDriveFiles = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const accessToken = IntegrationConfigManager.getApiKey('google-drive', 'ACCESS_TOKEN');
      const clientId = IntegrationConfigManager.getApiKey('google-drive', 'CLIENT_ID');
      const refreshToken = IntegrationConfigManager.getApiKey('google-drive', 'REFRESH_TOKEN');

      if (accessToken && clientId) {
        await googleDriveService.initialize({
          clientId,
          accessToken,
          refreshToken
        });

        const driveFiles = await googleDriveService.listFiles('current-user-did');
        setFiles(driveFiles);
        
        // Calculate stats
        const stats = {
          totalFiles: driveFiles.length,
          totalSize: driveFiles.reduce((sum, file) => sum + file.size, 0),
          byType: {
            image: driveFiles.filter(f => f.type === 'image').length,
            video: driveFiles.filter(f => f.type === 'video').length,
            document: driveFiles.filter(f => f.type === 'document').length,
            audio: driveFiles.filter(f => f.type === 'audio').length,
            other: driveFiles.filter(f => f.type === 'other').length
          }
        };
        setStorageStats(stats);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load Google Drive files');
      console.error('Google Drive loading error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadComplete = (uploadedFile: StorageFile) => {
    setFiles(prev => [...prev, uploadedFile]);
    setStorageStats(prev => ({
      totalFiles: prev.totalFiles + 1,
      totalSize: prev.totalSize + uploadedFile.size,
      byType: {
        ...prev.byType,
        [uploadedFile.type]: prev.byType[uploadedFile.type] + 1
      }
    }));
  };

  const handleFileDelete = async (fileId: string) => {
    try {
      await googleDriveService.deleteFile(fileId, 'current-user-did');
      const deletedFile = files.find(f => f.id === fileId);
      if (deletedFile) {
        setFiles(prev => prev.filter(f => f.id !== fileId));
        setStorageStats(prev => ({
          totalFiles: prev.totalFiles - 1,
          totalSize: prev.totalSize - deletedFile.size,
          byType: {
            ...prev.byType,
            [deletedFile.type]: prev.byType[deletedFile.type] - 1
          }
        }));
      }
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
    const limit = 15 * 1024 * 1024 * 1024; // 15GB
    return Math.min((storageStats.totalSize / limit) * 100, 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading Google Drive...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">Google Drive Error</h3>
          <p className="text-text-secondary mb-4">{error}</p>
          <button
            onClick={checkGoogleDriveStatus}
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
          <h3 className="text-lg font-semibold text-text-primary">Google Drive Storage</h3>
          <p className="text-text-secondary">Permanent, encrypted storage in your Google Drive</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>Upload</span>
          </button>
        </div>
      </div>

      {/* Google Drive Status */}
      <div className="bg-secondary rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <HardDrive className="w-6 h-6 text-blue-500" />
            <div>
              <h4 className="font-semibold text-text-primary">Google Drive</h4>
              <p className="text-sm text-text-secondary">
                {isGoogleDriveConnected ? 'Connected and ready' : 'Not connected'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {isGoogleDriveConnected ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-sm text-green-400">Active</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-400">Setup Required</span>
              </>
            )}
          </div>
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
                <span className="text-text-primary">{formatBytes(storageStats.totalSize)}</span>
              </div>
              <div className="w-full bg-border rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${getStorageUsagePercentage()}%` }}
                />
              </div>
            </div>
            <div className="text-sm text-text-secondary">
              {storageStats.totalFiles} files • 15GB free limit
            </div>
          </div>
        </div>

        {/* File Types */}
        <div className="bg-secondary rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium text-text-primary">File Types</h4>
            <BarChart3 className="w-5 h-5 text-text-secondary" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary flex items-center">
                <Image className="w-4 h-4 mr-1" />
                Images
              </span>
              <span className="text-text-primary">{storageStats.byType.image}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary flex items-center">
                <Video className="w-4 h-4 mr-1" />
                Videos
              </span>
              <span className="text-text-primary">{storageStats.byType.video}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary flex items-center">
                <FileText className="w-4 h-4 mr-1" />
                Documents
              </span>
              <span className="text-text-primary">{storageStats.byType.document}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary flex items-center">
                <Music className="w-4 h-4 mr-1" />
                Audio
              </span>
              <span className="text-text-primary">{storageStats.byType.audio}</span>
            </div>
          </div>
        </div>

        {/* Benefits */}
        <div className="bg-secondary rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium text-text-primary">Benefits</h4>
            <CheckCircle className="w-5 h-5 text-green-400" />
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center text-text-secondary">
              <Lock className="w-4 h-4 mr-2 text-blue-400" />
              pN encrypted
            </div>
            <div className="flex items-center text-text-secondary">
              <Globe className="w-4 h-4 mr-2 text-green-400" />
              Fast CDN
            </div>
            <div className="flex items-center text-text-secondary">
              <Users className="w-4 h-4 mr-2 text-purple-400" />
              User-owned
            </div>
            <div className="flex items-center text-text-secondary">
              <ExternalLink className="w-4 h-4 mr-2 text-orange-400" />
              Portable
            </div>
          </div>
        </div>
      </div>

      {/* Setup Message (if not connected) */}
      {!isGoogleDriveConnected && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-6">
          <div className="text-center">
            <HardDrive className="w-12 h-12 text-blue-400 mx-auto mb-4" />
            <h4 className="text-lg font-semibold text-blue-400 mb-2">Setup Google Drive Storage</h4>
            <p className="text-blue-300 mb-4">
              Connect your Google Drive for permanent, encrypted storage. Files are encrypted with pN standard 
              so Google can't read them, but you get fast loading via Google's CDN.
            </p>
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Setup Google Drive
            </button>
          </div>
        </div>
      )}

      {/* File Manager */}
      {isGoogleDriveConnected && (
        <div className="bg-secondary rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h4 className="font-medium text-text-primary">Your Files</h4>
            <div className="text-sm text-text-secondary">
              {files.length} file{files.length !== 1 ? 's' : ''}
            </div>
          </div>
          
          {files.length === 0 ? (
            <div className="text-center py-12">
              <Upload className="w-12 h-12 text-text-secondary mx-auto mb-4" />
              <h5 className="text-lg font-medium text-text-primary mb-2">No files yet</h5>
              <p className="text-text-secondary mb-4">Upload your first file to get started</p>
              <button
                onClick={() => setShowUploadModal(true)}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
              >
                Upload Files
              </button>
            </div>
          ) : (
            <StorageFileManager
              files={files}
              onFileSelect={handleFileInfo}
              onFileDelete={handleFileDelete}
              onFileShare={handleFileShare}
              onFileDownload={handleFileDownload}
              onFileInfo={handleFileInfo}
              config={{
                defaultView: 'grid',
                showProvider: false, // Always Google Drive
                showVisibility: true,
                showActions: true,
                selectable: false,
                sortable: true,
                filterable: true
              }}
            />
          )}
        </div>
      )}

      {/* Upload Modal */}
      <GoogleDriveUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadComplete={handleUploadComplete}
      />
    </div>
  );
};