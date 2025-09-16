// Reusable Upload Modal - Shared across all tools
import React, { useState, useCallback, useRef } from 'react';
import { X, Upload, File, Image, Video, Music, FileText, Settings, Eye, EyeOff, Users, HardDrive, AlertCircle, CheckCircle } from 'lucide-react';
import { StorageProvider, StorageProviderType, UploadOptions, UploadProgress } from '../../types/storage';
import { universalStorageService } from '../../services/universalStorageService';

interface StorageUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (files: any[]) => void;
  config?: {
    maxFiles?: number;
    allowedTypes?: string[];
    maxFileSize?: number;
    defaultProvider?: StorageProviderType;
    defaultVisibility?: 'private' | 'public' | 'friends';
  };
}

export const StorageUploadModal: React.FC<StorageUploadModalProps> = ({
  isOpen,
  onClose,
  onUploadComplete,
  config = {}
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadOptions, setUploadOptions] = useState<UploadOptions>({
    provider: config.defaultProvider || 'ipfs',
    visibility: config.defaultVisibility || 'private',
    autoOptimize: true,
    compressionLevel: 'medium',
    generateThumbnails: true,
    extractMetadata: true,
    pinContent: false
  });
  const [providers, setProviders] = useState<StorageProvider[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Map<string, UploadProgress>>(new Map());
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Load providers on mount
  React.useEffect(() => {
    if (isOpen) {
      loadProviders();
    }
  }, [isOpen]);

  const loadProviders = async () => {
    try {
      const availableProviders = universalStorageService.getProviders();
      setProviders(availableProviders);
    } catch (error) {
      console.error('Failed to load providers:', error);
    }
  };

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
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const handleFiles = (files: File[]) => {
    setErrors([]);
    const validFiles: File[] = [];
    const newErrors: string[] = [];

    files.forEach(file => {
      // Check file size
      const maxSize = config.maxFileSize || 100 * 1024 * 1024; // 100MB default
      if (file.size > maxSize) {
        newErrors.push(`${file.name}: File too large (max ${Math.round(maxSize / 1024 / 1024)}MB)`);
        return;
      }

      // Check file type
      const allowedTypes = config.allowedTypes || ['image/', 'video/', 'audio/', 'application/pdf', 'text/'];
      const isAllowed = allowedTypes.some(type => file.type.startsWith(type));
      if (!isAllowed) {
        newErrors.push(`${file.name}: File type not allowed`);
        return;
      }

      // Check max files
      if (validFiles.length + selectedFiles.length >= (config.maxFiles || 10)) {
        newErrors.push(`Maximum ${config.maxFiles || 10} files allowed`);
        return;
      }

      validFiles.push(file);
    });

    setSelectedFiles(prev => [...prev, ...validFiles]);
    setErrors(newErrors);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <Image className="w-5 h-5" />;
    if (file.type.startsWith('video/')) return <Video className="w-5 h-5" />;
    if (file.type.startsWith('audio/')) return <Music className="w-5 h-5" />;
    if (file.type === 'application/pdf' || file.type.startsWith('text/')) return <FileText className="w-5 h-5" />;
    return <File className="w-5 h-5" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    setErrors([]);

    try {
      const uploadPromises = selectedFiles.map(file => 
        universalStorageService.uploadFile(file, uploadOptions, (progress) => {
          setUploadProgress(prev => new Map(prev.set(progress.fileId, progress)));
        })
      );

      const uploadedFiles = await Promise.all(uploadPromises);
      onUploadComplete(uploadedFiles);
      
      // Reset state
      setSelectedFiles([]);
      setUploadProgress(new Map());
      onClose();
    } catch (error) {
      setErrors([error.message || 'Upload failed']);
    } finally {
      setIsUploading(false);
    }
  };

  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case 'private': return <EyeOff className="w-4 h-4" />;
      case 'public': return <Eye className="w-4 h-4" />;
      case 'friends': return <Users className="w-4 h-4" />;
      default: return <EyeOff className="w-4 h-4" />;
    }
  };

  const getProviderIcon = (provider: StorageProviderType) => {
    return <HardDrive className="w-4 h-4" />;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-modal-bg rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-semibold text-text-primary">Upload Media</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Upload Area */}
          <div className="p-6">
            <div
              ref={dropZoneRef}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border hover:border-primary/50'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="w-12 h-12 text-text-secondary mx-auto mb-4" />
              <p className="text-text-primary mb-2">
                Drag & drop files here or{' '}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-primary hover:underline"
                >
                  browse files
                </button>
              </p>
              <p className="text-sm text-text-secondary">
                Images, videos, documents, and audio files
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileInput}
                className="hidden"
                accept={config.allowedTypes?.join(',') || 'image/*,video/*,audio/*,.pdf,.txt'}
              />
            </div>

            {/* Errors */}
            {errors.length > 0 && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                {errors.map((error, index) => (
                  <div key={index} className="flex items-center text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    {error}
                  </div>
                ))}
              </div>
            )}

            {/* Selected Files */}
            {selectedFiles.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-medium text-text-primary mb-3">
                  Selected Files ({selectedFiles.length})
                </h3>
                <div className="space-y-2">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                      <div className="flex items-center space-x-3">
                        {getFileIcon(file)}
                        <div>
                          <p className="text-text-primary font-medium">{file.name}</p>
                          <p className="text-text-secondary text-sm">{formatFileSize(file.size)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeFile(index)}
                        className="text-text-secondary hover:text-red-400 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Upload Options */}
          <div className="px-6 pb-6">
            <h3 className="text-lg font-medium text-text-primary mb-4">Upload Options</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Storage Provider */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Storage Provider
                </label>
                <select
                  value={uploadOptions.provider}
                  onChange={(e) => setUploadOptions(prev => ({ 
                    ...prev, 
                    provider: e.target.value as StorageProviderType 
                  }))}
                  className="w-full p-3 bg-secondary border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {providers.map(provider => (
                    <option key={provider.id} value={provider.type}>
                      {provider.name} {provider.isFree ? '(Free)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Visibility */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Visibility
                </label>
                <select
                  value={uploadOptions.visibility}
                  onChange={(e) => setUploadOptions(prev => ({ 
                    ...prev, 
                    visibility: e.target.value as 'private' | 'public' | 'friends'
                  }))}
                  className="w-full p-3 bg-secondary border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="private">Private</option>
                  <option value="friends">Friends Only</option>
                  <option value="public">Public</option>
                </select>
              </div>
            </div>

            {/* Advanced Options */}
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Settings className="w-4 h-4 text-text-secondary" />
                  <span className="text-text-primary">Auto-optimize files</span>
                </div>
                <input
                  type="checkbox"
                  checked={uploadOptions.autoOptimize}
                  onChange={(e) => setUploadOptions(prev => ({ 
                    ...prev, 
                    autoOptimize: e.target.checked 
                  }))}
                  className="w-4 h-4 text-primary bg-secondary border-border rounded focus:ring-primary"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Settings className="w-4 h-4 text-text-secondary" />
                  <span className="text-text-primary">Extract metadata</span>
                </div>
                <input
                  type="checkbox"
                  checked={uploadOptions.extractMetadata}
                  onChange={(e) => setUploadOptions(prev => ({ 
                    ...prev, 
                    extractMetadata: e.target.checked 
                  }))}
                  className="w-4 h-4 text-primary bg-secondary border-border rounded focus:ring-primary"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Settings className="w-4 h-4 text-text-secondary" />
                  <span className="text-text-primary">Pin content</span>
                </div>
                <input
                  type="checkbox"
                  checked={uploadOptions.pinContent}
                  onChange={(e) => setUploadOptions(prev => ({ 
                    ...prev, 
                    pinContent: e.target.checked 
                  }))}
                  className="w-4 h-4 text-primary bg-secondary border-border rounded focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Upload Progress */}
          {uploadProgress.size > 0 && (
            <div className="px-6 pb-6">
              <h3 className="text-lg font-medium text-text-primary mb-4">Upload Progress</h3>
              <div className="space-y-3">
                {Array.from(uploadProgress.values()).map(progress => (
                  <div key={progress.fileId} className="bg-secondary rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-text-primary font-medium">{progress.fileName}</span>
                      <span className="text-text-secondary text-sm">{progress.progress}%</span>
                    </div>
                    <div className="w-full bg-border rounded-full h-2">
                      <div 
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress.progress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-text-secondary text-sm">
                        {progress.status === 'completed' && <CheckCircle className="w-4 h-4 text-green-400 inline mr-1" />}
                        {progress.status === 'error' && <AlertCircle className="w-4 h-4 text-red-400 inline mr-1" />}
                        {progress.status}
                      </span>
                      {progress.cid && (
                        <span className="text-text-secondary text-xs font-mono">
                          {progress.cid.substring(0, 12)}...
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-border">
          <div className="text-sm text-text-secondary">
            {selectedFiles.length > 0 && (
              <span>
                {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
              </span>
            )}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
              disabled={isUploading}
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={selectedFiles.length === 0 || isUploading}
              className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isUploading ? 'Uploading...' : `Upload ${selectedFiles.length} File${selectedFiles.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
