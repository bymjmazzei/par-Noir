// Google Drive Storage Component
// Provides a clean interface for Google Drive file management

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Upload, 
  Download, 
  Trash2, 
  Folder, 
  File, 
  Image, 
  Video, 
  Music, 
  FileText,
  RefreshCw,
  Search,
  Filter,
  Grid,
  List,
  MoreVertical,
  Eye,
  EyeOff,
  Users,
  HardDrive,
  AlertCircle,
  CheckCircle,
  X
} from 'lucide-react';
import { 
  googleDriveService, 
  GoogleDriveFile, 
  GoogleDriveAuthState, 
  UploadProgress,
  defaultGoogleDriveConfig 
} from '../../services/googleDriveService';

interface GoogleDriveStorageProps {
  onClose?: () => void;
}

type ViewMode = 'grid' | 'list';
type SortField = 'name' | 'modifiedTime' | 'size';
type SortDirection = 'asc' | 'desc';

export const GoogleDriveStorage: React.FC<GoogleDriveStorageProps> = ({ onClose }) => {
  const [authState, setAuthState] = useState<GoogleDriveAuthState>({ isSignedIn: false });
  const [files, setFiles] = useState<GoogleDriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortField, setSortField] = useState<SortField>('modifiedTime');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [uploadProgress, setUploadProgress] = useState<Map<string, UploadProgress>>(new Map());
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // Initialize Google Drive service
  useEffect(() => {
    const initializeService = async () => {
      try {
        await googleDriveService.initialize(defaultGoogleDriveConfig);
        
        // Listen for auth state changes
        const unsubscribe = googleDriveService.onAuthStateChange((state) => {
          setAuthState(state);
          if (state.isSignedIn) {
            loadFiles();
          } else {
            setFiles([]);
          }
        });

        // Get initial auth state
        setAuthState(googleDriveService.getAuthState());

        return unsubscribe;
      } catch (error) {
        console.error('Failed to initialize Google Drive service:', error);
        setError(`Failed to initialize Google Drive: ${error.message}`);
      }
    };

    initializeService();
  }, []);

  // Load files from Google Drive
  const loadFiles = useCallback(async () => {
    if (!authState.isSignedIn) return;

    setLoading(true);
    setError(null);

    try {
      const driveFiles = await googleDriveService.listFiles();
      setFiles(driveFiles);
    } catch (error) {
      console.error('Failed to load files:', error);
      setError(`Failed to load files: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [authState.isSignedIn]);

  // Handle sign in
  const handleSignIn = async () => {
    try {
      setError(null);
      await googleDriveService.signIn();
    } catch (error) {
      console.error('Sign in failed:', error);
      setError(`Sign in failed: ${error.message}`);
    }
  };

  // Handle sign out
  const handleSignOut = async () => {
    try {
      setError(null);
      await googleDriveService.signOut();
      setFiles([]);
      setSelectedFiles(new Set());
    } catch (error) {
      console.error('Sign out failed:', error);
      setError(`Sign out failed: ${error.message}`);
    }
  };

  // Handle file upload
  const handleFileUpload = async (files: FileList) => {
    if (!authState.isSignedIn) return;

    setError(null);

    for (const file of Array.from(files)) {
      try {
        await googleDriveService.uploadFile(file, (progress) => {
          setUploadProgress(prev => new Map(prev.set(progress.fileId, progress)));
        });
      } catch (error) {
        console.error('Upload failed:', error);
        setError(`Upload failed for ${file.name}: ${error.message}`);
      }
    }

    // Refresh file list after upload
    await loadFiles();
  };

  // Handle file download
  const handleFileDownload = async (file: GoogleDriveFile) => {
    try {
      setError(null);
      const blob = await googleDriveService.downloadFile(file.id);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      setError(`Download failed: ${error.message}`);
    }
  };

  // Handle file deletion
  const handleFileDelete = async (fileId: string) => {
    try {
      setError(null);
      await googleDriveService.deleteFile(fileId);
      setFiles(prev => prev.filter(f => f.id !== fileId));
      setSelectedFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(fileId);
        return newSet;
      });
    } catch (error) {
      console.error('Delete failed:', error);
      setError(`Delete failed: ${error.message}`);
    }
  };

  // Get file icon based on MIME type
  const getFileIcon = (file: GoogleDriveFile) => {
    if (file.mimeType === 'application/vnd.google-apps.folder') {
      return <Folder className="w-5 h-5" />;
    }
    
    if (file.mimeType.startsWith('image/')) {
      return <Image className="w-5 h-5" />;
    }
    
    if (file.mimeType.startsWith('video/')) {
      return <Video className="w-5 h-5" />;
    }
    
    if (file.mimeType.startsWith('audio/')) {
      return <Music className="w-5 h-5" />;
    }
    
    if (file.mimeType.includes('document') || file.mimeType.includes('text')) {
      return <FileText className="w-5 h-5" />;
    }
    
    return <File className="w-5 h-5" />;
  };

  // Format file size
  const formatFileSize = (bytes: string) => {
    if (!bytes) return 'Unknown size';
    const size = parseInt(bytes);
    if (size === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(size) / Math.log(k));
    return parseFloat((size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  // Filter and sort files
  const filteredAndSortedFiles = React.useMemo(() => {
    let filtered = files;

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(file => 
        file.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortField) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'modifiedTime':
          aValue = new Date(a.modifiedTime).getTime();
          bValue = new Date(b.modifiedTime).getTime();
          break;
        case 'size':
          aValue = parseInt(a.size || '0');
          bValue = parseInt(b.size || '0');
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [files, searchQuery, sortField, sortDirection]);

  // Render authentication section
  const renderAuthSection = () => (
    <div className="text-center py-12">
      <HardDrive className="w-16 h-16 text-primary mx-auto mb-4" />
      <h3 className="text-xl font-semibold text-text-primary mb-2">
        Connect to Google Drive
      </h3>
      <p className="text-text-secondary mb-6 max-w-md mx-auto">
        Sign in to Google Drive to access your files and upload new content securely.
      </p>
      <button
        onClick={handleSignIn}
        className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
      >
        Sign in to Google Drive
      </button>
    </div>
  );

  // Render file grid view
  const renderGridView = () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {filteredAndSortedFiles.map(file => (
        <div
          key={file.id}
          className={`bg-secondary rounded-lg p-4 cursor-pointer transition-all hover:bg-secondary/80 ${
            selectedFiles.has(file.id) ? 'ring-2 ring-primary' : ''
          }`}
          onClick={() => {
            const newSet = new Set(selectedFiles);
            if (newSet.has(file.id)) {
              newSet.delete(file.id);
            } else {
              newSet.add(file.id);
            }
            setSelectedFiles(newSet);
          }}
        >
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
              {getFileIcon(file)}
            </div>
            <h3 className="text-sm font-medium text-text-primary truncate w-full mb-1">
              {file.name}
            </h3>
            <p className="text-xs text-text-secondary mb-2">
              {formatFileSize(file.size || '0')}
            </p>
            <p className="text-xs text-text-secondary">
              {formatDate(file.modifiedTime)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );

  // Render file list view
  const renderListView = () => (
    <div className="space-y-2">
      {filteredAndSortedFiles.map(file => (
        <div
          key={file.id}
          className={`bg-secondary rounded-lg p-4 cursor-pointer transition-all hover:bg-secondary/80 ${
            selectedFiles.has(file.id) ? 'ring-2 ring-primary' : ''
          }`}
          onClick={() => {
            const newSet = new Set(selectedFiles);
            if (newSet.has(file.id)) {
              newSet.delete(file.id);
            } else {
              newSet.add(file.id);
            }
            setSelectedFiles(newSet);
          }}
        >
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              {getFileIcon(file)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-text-primary font-medium truncate">
                {file.name}
              </h3>
              <div className="flex items-center space-x-4 text-sm text-text-secondary">
                <span>{formatFileSize(file.size || '0')}</span>
                <span>{formatDate(file.modifiedTime)}</span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleFileDownload(file);
                }}
                className="p-1 text-text-secondary hover:text-text-primary transition-colors"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleFileDelete(file.id);
                }}
                className="p-1 text-text-secondary hover:text-red-400 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  if (!authState.isSignedIn) {
    return (
      <div className="p-6">
        {renderAuthSection()}
        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <div className="flex items-center text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 mr-2" />
              {error}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <HardDrive className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-xl font-semibold text-text-primary">Google Drive</h2>
            <p className="text-sm text-text-secondary">
              Signed in as {authState.user?.email}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={loadFiles}
            disabled={loading}
            className="p-2 text-text-secondary hover:text-text-primary transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            Sign Out
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-secondary w-4 h-4" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 bg-secondary border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Sort and View Controls */}
        <div className="flex items-center space-x-3">
          <select
            value={`${sortField}-${sortDirection}`}
            onChange={(e) => {
              const [field, direction] = e.target.value.split('-');
              setSortField(field as SortField);
              setSortDirection(direction as SortDirection);
            }}
            className="px-3 py-2 bg-secondary border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="modifiedTime-desc">Newest First</option>
            <option value="modifiedTime-asc">Oldest First</option>
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
            <option value="size-desc">Largest First</option>
            <option value="size-asc">Smallest First</option>
          </select>

          <div className="flex items-center bg-secondary border border-border rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 transition-colors ${
                viewMode === 'grid' 
                  ? 'text-primary bg-primary/10' 
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 transition-colors ${
                viewMode === 'list' 
                  ? 'text-primary bg-primary/10' 
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Upload Area */}
      <div
        className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.multiple = true;
          input.onchange = (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files) {
              handleFileUpload(files);
            }
          };
          input.click();
        }}
      >
        <Upload className="w-12 h-12 text-text-secondary mx-auto mb-4" />
        <p className="text-text-primary mb-2">
          Drag & drop files here or click to browse
        </p>
        <p className="text-sm text-text-secondary">
          Upload files to your Google Drive
        </p>
      </div>

      {/* Upload Progress */}
      {uploadProgress.size > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-medium text-text-primary">Upload Progress</h3>
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
                {progress.error && (
                  <span className="text-red-400 text-xs">{progress.error}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <div className="flex items-center text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 mr-2" />
            {error}
          </div>
        </div>
      )}

      {/* Files Display */}
      {loading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 text-text-secondary mx-auto mb-4 animate-spin" />
          <p className="text-text-secondary">Loading files...</p>
        </div>
      ) : filteredAndSortedFiles.length === 0 ? (
        <div className="text-center py-12">
          <File className="w-12 h-12 text-text-secondary mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">No files found</h3>
          <p className="text-text-secondary">
            {searchQuery ? 'Try adjusting your search' : 'Upload some files to get started'}
          </p>
        </div>
      ) : (
        <>
          <div className="text-sm text-text-secondary">
            {filteredAndSortedFiles.length} file{filteredAndSortedFiles.length !== 1 ? 's' : ''}
            {selectedFiles.size > 0 && ` (${selectedFiles.size} selected)`}
          </div>
          {viewMode === 'grid' ? renderGridView() : renderListView()}
        </>
      )}
    </div>
  );
};
