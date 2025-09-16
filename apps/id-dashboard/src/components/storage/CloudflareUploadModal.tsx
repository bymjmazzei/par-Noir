// Cloudflare R2 Upload Modal
// Handles file uploads to user's own Cloudflare R2 storage

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { X, Upload, Image, Video, FileText, Music, HardDrive, Lock, Globe, Users, CheckCircle, AlertCircle, Settings, RefreshCw } from 'lucide-react';
import { StorageFile, UploadOptions, UploadProgress } from '../../types/storage';
import { cloudflareR2Service, CloudflareR2Config } from '../../services/cloudflareR2Service';
import { CloudflareSetupModal } from './CloudflareSetupModal';
import { IntegrationConfigManager } from '../../utils/integrationConfig';

interface CloudflareUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (file: StorageFile) => void;
}

export const CloudflareUploadModal: React.FC<CloudflareUploadModalProps> = ({
  isOpen,
  onClose,
  onUploadComplete,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [visibility, setVisibility] = useState<'private' | 'public' | 'friends'>('private');
  const [autoOptimize, setAutoOptimize] = useState(true);
  const [encryptFile, setEncryptFile] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [hasCloudflareConfig, setHasCloudflareConfig] = useState(false);
  const [cloudflareConfig, setCloudflareConfig] = useState<CloudflareR2Config | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check for existing Cloudflare configuration
  useEffect(() => {
    if (isOpen) {
      checkCloudflareConfig();
    }
  }, [isOpen]);

  const checkCloudflareConfig = useCallback(() => {
    const apiKey = IntegrationConfigManager.getApiKey('cloudflare-r2', 'API_KEY');
    const apiSecret = IntegrationConfigManager.getApiKey('cloudflare-r2', 'API_SECRET');
    const accountId = IntegrationConfigManager.getApiKey('cloudflare-r2', 'ACCOUNT_ID');
    const bucketName = IntegrationConfigManager.getApiKey('cloudflare-r2', 'BUCKET_NAME');

    if (apiKey && apiSecret && accountId && bucketName) {
      const config: CloudflareR2Config = {
        apiKey,
        apiSecret,
        accountId,
        bucketName,
        region: IntegrationConfigManager.getApiKey('cloudflare-r2', 'REGION') || 'auto'
      };
      
      setCloudflareConfig(config);
      setHasCloudflareConfig(true);
      
      // Initialize the service
      cloudflareR2Service.initialize(config).catch(err => {
        console.error('Failed to initialize Cloudflare R2:', err);
        setError('Failed to connect to your Cloudflare storage. Please check your configuration.');
      });
    } else {
      setHasCloudflareConfig(false);
    }
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
      e.dataTransfer.clearData();
    }
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(prev => [...prev, ...Array.from(e.target.files)]);
    }
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select files to upload.');
      return;
    }

    if (!hasCloudflareConfig || !cloudflareConfig) {
      setError('Please set up your Cloudflare R2 storage first.');
      setShowSetupModal(true);
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress([]);

    for (const file of selectedFiles) {
      const options: UploadOptions = {
        provider: 'cloudflare-r2',
        visibility,
        autoOptimize,
        compressionLevel: 'medium',
        generateThumbnails: true,
        extractMetadata: true,
        pinContent: true // Always pin for permanent storage
      };

      try {
        const uploadedFile = await cloudflareR2Service.uploadFile(
          file, 
          'current-user-did', // TODO: Get from auth context
          options,
          (progress) => {
            setUploadProgress(prev => {
              const existing = prev.find(p => p.fileId === progress.fileId);
              if (existing) {
                return prev.map(p => p.fileId === progress.fileId ? progress : p);
              }
              return [...prev, progress];
            });
          }
        );
        
        onUploadComplete(uploadedFile);
      } catch (err: any) {
        console.error('Upload error:', err);
        setUploadProgress(prev => [...prev, {
          fileId: file.name,
          fileName: file.name,
          progress: 0,
          status: 'error',
          error: err.message || 'Upload failed'
        }]);
        setError(`Failed to upload ${file.name}: ${err.message}`);
      }
    }
    
    setUploading(false);
    
    // Close modal if all uploads successful
    const successfulUploads = uploadProgress.filter(p => p.status === 'completed').length;
    if (successfulUploads === selectedFiles.length) {
      setTimeout(() => onClose(), 1000);
    }
  };

  const handleSetupComplete = useCallback((config: CloudflareR2Config) => {
    setCloudflareConfig(config);
    setHasCloudflareConfig(true);
    setShowSetupModal(false);
    setError(null);
  }, []);

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return <Image className="w-5 h-5 text-blue-400" />;
    if (fileType.startsWith('video/')) return <Video className="w-5 h-5 text-green-400" />;
    if (fileType.startsWith('audio/')) return <Music className="w-5 h-5 text-purple-400" />;
    if (fileType.includes('document') || fileType.includes('pdf') || fileType.includes('text')) return <FileText className="w-5 h-5 text-yellow-400" />;
    return <FileText className="w-5 h-5 text-gray-400" />;
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-modal-bg rounded-lg shadow-xl w-full max-w-2xl p-6 relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-text-secondary hover:text-text-primary">
            <X size={24} />
          </button>
          
          <h2 className="text-2xl font-bold text-text-primary mb-6">Upload to Your Storage</h2>

          {/* Cloudflare Status */}
          <div className="mb-6 p-4 rounded-lg border border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <HardDrive className="w-6 h-6 text-primary" />
                <div>
                  <h3 className="font-semibold text-text-primary">Cloudflare R2 Storage</h3>
                  <p className="text-sm text-text-secondary">
                    {hasCloudflareConfig ? 'Connected to your storage' : 'Not configured'}
                  </p>
                </div>
              </div>
              {hasCloudflareConfig ? (
                <div className="flex items-center space-x-2 text-green-400">
                  <CheckCircle size={20} />
                  <span className="text-sm">Ready</span>
                </div>
              ) : (
                <button
                  onClick={() => setShowSetupModal(true)}
                  className="flex items-center space-x-2 px-3 py-1 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors"
                >
                  <Settings size={16} />
                  <span>Setup</span>
                </button>
              )}
            </div>
          </div>

          {/* File Upload Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center mb-6 transition-colors ${
              dragActive ? 'border-primary bg-primary-light' : 'border-border bg-bg-light'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="w-12 h-12 text-text-secondary mx-auto mb-4" />
            <p className="text-text-primary mb-2">Drag & Drop files here or click to browse</p>
            <input
              type="file"
              multiple
              ref={fileInputRef}
              className="hidden"
              onChange={handleChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors"
            >
              Browse Files
            </button>
          </div>

          {/* Selected Files */}
          {selectedFiles.length > 0 && (
            <div className="mb-6 border-t border-border pt-4">
              <h3 className="text-lg font-semibold text-text-primary mb-3">Selected Files ({selectedFiles.length})</h3>
              <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between bg-bg-light p-3 rounded-md">
                    <div className="flex items-center space-x-3">
                      {getFileIcon(file.type)}
                      <span className="text-text-primary text-sm truncate">{file.name}</span>
                      <span className="text-text-secondary text-xs">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                    </div>
                    <button onClick={() => handleRemoveFile(index)} className="text-red-400 hover:text-red-500">
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Visibility</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as 'private' | 'public' | 'friends')}
                className="w-full p-2 border border-border rounded-md bg-input-bg text-text-primary focus:ring-primary focus:border-primary"
              >
                <option value="private">🔒 Private (Only you)</option>
                <option value="friends">👥 Friends (Shared with connections)</option>
                <option value="public">🌍 Public (Discoverable by anyone)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Storage</label>
              <div className="flex items-center space-x-2 text-text-secondary">
                <HardDrive size={16} />
                <span className="text-sm">Cloudflare R2 (Permanent)</span>
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="flex items-center justify-between mb-4">
            <label htmlFor="encryptFile" className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                id="encryptFile"
                checked={encryptFile}
                onChange={(e) => setEncryptFile(e.target.checked)}
                className="form-checkbox h-5 w-5 text-primary rounded border-border focus:ring-primary"
              />
              <span className="ml-2 text-text-primary">Encrypt File (pN Standard)</span>
            </label>
            <label htmlFor="autoOptimize" className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                id="autoOptimize"
                checked={autoOptimize}
                onChange={(e) => setAutoOptimize(e.target.checked)}
                className="form-checkbox h-5 w-5 text-primary rounded border-border focus:ring-primary"
              />
              <span className="ml-2 text-text-primary">Auto-optimize Media</span>
            </label>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-500/20 text-red-400 p-3 rounded-md flex items-center space-x-2 mb-4">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          {/* Upload Progress */}
          {uploadProgress.length > 0 && (
            <div className="mb-6 border-t border-border pt-4">
              <h3 className="text-lg font-semibold text-text-primary mb-3">Upload Progress</h3>
              <div className="space-y-3 max-h-32 overflow-y-auto pr-2">
                {uploadProgress.map((progress, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    {progress.status === 'completed' && <CheckCircle size={20} className="text-green-500" />}
                    {progress.status === 'error' && <AlertCircle size={20} className="text-red-500" />}
                    {progress.status === 'uploading' && <RefreshCw size={20} className="text-blue-500 animate-spin" />}
                    {progress.status === 'processing' && <RefreshCw size={20} className="text-yellow-500 animate-spin" />}
                    <span className="text-text-primary text-sm">{progress.fileName}: {progress.error || `${progress.progress}%`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-4">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-border rounded-md text-text-primary hover:bg-bg-light transition-colors"
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={selectedFiles.length === 0 || uploading || !hasCloudflareConfig}
            >
              {uploading ? 'Uploading...' : `Upload ${selectedFiles.length} File(s)`}
            </button>
          </div>
        </div>
      </div>

      {/* Cloudflare Setup Modal */}
      <CloudflareSetupModal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        onSetupComplete={handleSetupComplete}
      />
    </>
  );
};
