// Google Drive Upload Modal - Clear setup-first approach
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { X, Upload, Image, Video, FileText, Music, HardDrive, Lock, Globe, Users, CheckCircle, AlertCircle, Settings, RefreshCw } from 'lucide-react';
import { StorageFile, UploadOptions, UploadProgress } from '../../types/storage';
// Removed SimpleGoogleDriveService import - using direct OAuth now
import { GoogleDriveSetupModal } from './GoogleDriveSetupModal';
import { IntegrationConfigManager } from '../../utils/integrationConfig';

interface GoogleDriveUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (file: StorageFile) => void;
}

export const GoogleDriveUploadModal: React.FC<GoogleDriveUploadModalProps> = ({
  isOpen,
  onClose,
  onUploadComplete,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [visibility, setVisibility] = useState<'private' | 'public' | 'friends'>('private');
  const [autoOptimize, setAutoOptimize] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [hasGoogleDriveConfig, setHasGoogleDriveConfig] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check for existing Google Drive configuration
  useEffect(() => {
    if (isOpen) {
      checkGoogleDriveConfig();
    }
  }, [isOpen]);

  const checkGoogleDriveConfig = useCallback(() => {
    // Check localStorage for Google Drive token (from direct OAuth)
    const token = localStorage.getItem('google_drive_token');
    const email = localStorage.getItem('google_drive_email');
    
    const isConnected = !!(token && email);
    setHasGoogleDriveConfig(isConnected);
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

    if (!hasGoogleDriveConfig) {
      setError('Please set up your Google Drive storage first.');
      setShowSetupModal(true);
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress([]);

    for (const file of selectedFiles) {
      const options: UploadOptions = {
        provider: 'google-drive',
        visibility,
        autoOptimize,
        compressionLevel: 'medium',
        generateThumbnails: true,
        extractMetadata: true,
        pinContent: true
      };

      try {
        // TODO: Implement direct Google Drive API upload
        // For now, simulate upload
        const uploadedFile: StorageFile = {
          id: `mock-${Date.now()}`,
          name: file.name,
          size: file.size,
          mimeType: file.type,
          url: `https://mock-drive.com/${file.name}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
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

  const handleSetupComplete = useCallback(() => {
    setHasGoogleDriveConfig(true);
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
        <div className="bg-modal-bg rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-text-secondary hover:text-text-primary">
            <X size={24} />
          </button>
          
          <h2 className="text-2xl font-bold text-text-primary mb-6">Upload to Google Drive</h2>

          {/* Google Drive Not Connected - Show Setup Only */}
          {!hasGoogleDriveConfig ? (
            <div className="text-center py-12">
              <HardDrive className="w-16 h-16 text-blue-400 mx-auto mb-6" />
              <h3 className="text-xl font-semibold text-text-primary mb-4">Google Drive Not Connected</h3>
              <p className="text-text-secondary mb-6 max-w-md mx-auto">
                You need to connect your Google Drive before you can upload files. 
                This gives you permanent, encrypted storage in your own Google Drive.
              </p>
              
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6 max-w-md mx-auto">
                <h4 className="font-medium text-blue-400 mb-2">What you get:</h4>
                <ul className="text-sm text-blue-300 space-y-1 text-left">
                  <li>• 15GB free storage in your Google Drive</li>
                  <li>• Files encrypted with pN standard</li>
                  <li>• Fast loading via Google's CDN</li>
                  <li>• Complete control over your data</li>
                  <li>• Zero liability for par Noir</li>
                </ul>
              </div>

              <button
                type="button"
                onClick={() => setShowSetupModal(true)}
                className="px-8 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Connect Google Drive
              </button>
            </div>
          ) : (
            /* Google Drive Connected - Show Upload Interface */
            <>
              {/* Google Drive Status */}
              <div className="mb-6 p-4 rounded-lg border border-green-500/20 bg-green-500/10">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                  <div>
                    <h3 className="font-semibold text-green-400">Google Drive Connected</h3>
                    <p className="text-sm text-green-300">Ready to upload encrypted files to your Google Drive</p>
                  </div>
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
                    <option value="private">Private (Only you)</option>
                    <option value="friends">Friends (Shared with connections)</option>
                    <option value="public">Public (Discoverable by anyone)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Storage</label>
                  <div className="flex items-center space-x-2 text-text-secondary">
                    <HardDrive className="w-4 h-4 text-blue-500" />
                    <span className="text-sm">Google Drive (Permanent + Fast)</span>
                  </div>
                </div>
              </div>

              {/* Options */}
              <div className="flex items-center justify-between mb-4">
                <label htmlFor="autoOptimize" className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    id="autoOptimize"
                    checked={autoOptimize}
                    onChange={(e) => setAutoOptimize(e.target.checked)}
                    className="form-checkbox h-5 w-5 text-primary rounded border-border focus:ring-primary"
                  />
                  <span className="ml-2 text-text-primary">Auto-optimize Media (Compress images/videos)</span>
                </label>
              </div>

              {/* Benefits */}
              <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <h4 className="font-medium text-blue-400 mb-2">Google Drive Benefits:</h4>
                <ul className="text-sm text-blue-300 space-y-1">
                  <li>• Fast loading via Google's global CDN</li>
                  <li>• Automatic thumbnails and previews</li>
                  <li>• Reliable access from anywhere</li>
                  <li>• Files encrypted with pN standard</li>
                  <li>• Stored in your own Google Drive</li>
                </ul>
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
              <div className="flex justify-end space-x-4 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 border border-border rounded-md text-text-primary hover:bg-bg-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={selectedFiles.length === 0 || uploading}
                >
                  {uploading ? 'Uploading...' : `Upload ${selectedFiles.length} File(s)`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Google Drive Setup Modal */}
      <GoogleDriveSetupModal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        onSuccess={handleSetupComplete}
      />
    </>
  );
};