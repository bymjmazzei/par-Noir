import React, { useState, useEffect } from 'react';
import { HardDrive, Upload, Download, Trash2, File, Folder, RefreshCw, AlertCircle, Play, Settings } from 'lucide-react';
import { googleDriveDemoService } from '../../services/googleDriveDemoService';

interface GoogleDriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
  mimeType: string;
}

export const GoogleDriveStorage: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState<GoogleDriveFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [isDemoMode, setIsDemoMode] = useState(true); // Default to demo mode
  const [showDemoControls, setShowDemoControls] = useState(false);

  useEffect(() => {
    if (isDemoMode) {
      // Setup demo service listeners
      const unsubscribe = googleDriveDemoService.onAuthStateChange((authState) => {
        setIsConnected(authState.isSignedIn);
        setUserEmail(authState.user?.email || '');
        if (authState.isSignedIn) {
          loadFiles();
        } else {
          setFiles([]);
        }
      });
      
      return unsubscribe;
    } else {
      // Check if already connected (real mode)
      const token = localStorage.getItem('google_drive_token');
      const email = localStorage.getItem('google_drive_email');
      if (token && email) {
        setIsConnected(true);
        setUserEmail(email);
        loadFiles();
      }
    }
  }, [isDemoMode]);

  const handleConnect = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      if (isDemoMode) {
        // Use demo service
        await googleDriveDemoService.signIn();
      } else {
        // Use real Google Drive API
        const clientId = '43740774041-fo57a1gqenc9dmggkcrhjl5cvrp40gnq.apps.googleusercontent.com';
        const redirectUri = window.location.origin;
        const scope = 'https://www.googleapis.com/auth/drive.file';
        
        const authUrl = `https://accounts.google.com/oauth/authorize?` +
          `client_id=${clientId}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `scope=${encodeURIComponent(scope)}&` +
          `response_type=token&` +
          `access_type=offline`;
        
        // Open popup window
        const popup = window.open(
          authUrl,
          'google-auth',
          'width=500,height=600,scrollbars=yes,resizable=yes'
        );
        
        if (!popup) {
          throw new Error('Popup blocked. Please allow popups for this site.');
        }
        
        // Listen for the popup to close or receive the token
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            setIsLoading(false);
            // Check if we have a token in localStorage
            const token = localStorage.getItem('google_drive_token');
            const email = localStorage.getItem('google_drive_email');
            if (token && email) {
              setIsConnected(true);
              setUserEmail(email);
              loadFiles();
            }
          }
        }, 1000);
      }
    } catch (err) {
      setError('Failed to connect to Google Drive');
      console.error('Error connecting:', err);
      setIsLoading(false);
    }
  };

  const loadFiles = async () => {
    try {
      setIsLoading(true);
      
      if (isDemoMode) {
        const demoFiles = await googleDriveDemoService.listFiles();
        setFiles(demoFiles);
      } else {
        const token = localStorage.getItem('google_drive_token');
        if (!token) {
          throw new Error('No access token found');
        }
        
        const response = await fetch(
          'https://www.googleapis.com/drive/v3/files?fields=files(id,name,modifiedTime,size,mimeType)',
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (!response.ok) {
          throw new Error('Failed to fetch files');
        }
        
        const data = await response.json();
        setFiles(data.files || []);
      }
    } catch (err) {
      setError('Failed to load files');
      console.error('Error loading files:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      if (isDemoMode) {
        await googleDriveDemoService.signOut();
      } else {
        localStorage.removeItem('google_drive_token');
        localStorage.removeItem('google_drive_email');
        setIsConnected(false);
        setUserEmail('');
        setFiles([]);
      }
    } catch (err) {
      console.error('Error disconnecting:', err);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsLoading(true);
      
      if (isDemoMode) {
        await googleDriveDemoService.uploadFile(file, (progress) => {
          // Handle upload progress in demo mode
          console.log(`Upload progress: ${progress.progress}%`);
        });
        await loadFiles();
      } else {
        const token = localStorage.getItem('google_drive_token');
        if (!token) {
          throw new Error('No access token found');
        }
        
        const formData = new FormData();
        formData.append('metadata', JSON.stringify({
          name: file.name,
          parents: []
        }));
        formData.append('file', file);
        
        const response = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            },
            body: formData
          }
        );
        
        if (!response.ok) {
          throw new Error('Failed to upload file');
        }
        
        await loadFiles();
      }
    } catch (err) {
      setError('Failed to upload file');
      console.error('Error uploading:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      if (isDemoMode) {
        const blob = await googleDriveDemoService.downloadFile(fileId);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const token = localStorage.getItem('google_drive_token');
        if (!token) {
          throw new Error('No access token found');
        }
        
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );
        
        if (!response.ok) {
          throw new Error('Failed to download file');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      setError('Failed to download file');
      console.error('Error downloading:', err);
    }
  };

  const handleDelete = async (fileId: string) => {
    try {
      if (isDemoMode) {
        await googleDriveDemoService.deleteFile(fileId);
        await loadFiles();
      } else {
        const token = localStorage.getItem('google_drive_token');
        if (!token) {
          throw new Error('No access token found');
        }
        
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );
        
        if (!response.ok) {
          throw new Error('Failed to delete file');
        }
        
        await loadFiles();
      }
    } catch (err) {
      setError('Failed to delete file');
      console.error('Error deleting:', err);
    }
  };

  const getFileIcon = (file: GoogleDriveFile) => {
    if (file.mimeType === 'application/vnd.google-apps.folder') {
      return <Folder className="h-5 w-5" />;
    }
    return <File className="h-5 w-5" />;
  };

  const formatFileSize = (bytes: string) => {
    if (!bytes) return 'Unknown size';
    const size = parseInt(bytes);
    if (size === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(size) / Math.log(k));
    return parseFloat((size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <HardDrive className="h-8 w-8 text-primary" />
          <div>
            <h2 className="text-2xl font-bold text-text-primary">Google Drive Storage</h2>
            <p className="text-text-secondary">Access and manage your Google Drive files</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {isDemoMode && (
            <div className="flex items-center space-x-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full">
              <Play className="h-4 w-4 text-blue-400" />
              <span className="text-blue-400 text-sm font-medium">DEMO MODE</span>
            </div>
          )}
          <button
            onClick={() => setShowDemoControls(!showDemoControls)}
            className="p-2 text-text-secondary hover:text-text-primary transition-colors"
            title="Demo Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showDemoControls && (
        <div className="bg-secondary/50 border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-medium text-text-primary">Demo Mode Controls</h3>
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={isDemoMode}
                onChange={(e) => {
                  setIsDemoMode(e.target.checked);
                  setShowDemoControls(false);
                }}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm text-text-secondary">Enable Demo Mode</span>
            </label>
            {isDemoMode && (
              <button
                onClick={() => {
                  googleDriveDemoService.resetDemoData();
                  setFiles([]);
                  setIsConnected(false);
                  setUserEmail('');
                }}
                className="px-3 py-1 bg-primary/10 text-primary text-sm rounded-lg hover:bg-primary/20 transition-colors"
              >
                Reset Demo Data
              </button>
            )}
          </div>
          {isDemoMode && (
            <p className="text-xs text-text-secondary">
              Demo mode uses simulated data and interactions for demonstration purposes.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <span className="text-red-400 text-sm">{error}</span>
          </div>
        </div>
      )}

      {!isConnected ? (
        <div className="text-center space-y-6 py-12">
          <div className="mx-auto w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center">
            <HardDrive className="h-12 w-12 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-text-primary mb-2">Connect to Google Drive</h3>
            <p className="text-text-secondary mb-6">
              Sign in to Google Drive to access your files and upload new content securely.
            </p>
            <button
              onClick={handleConnect}
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Connecting...' : (isDemoMode ? 'Start Demo Connection' : 'Connect to Google Drive')}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="h-3 w-3 bg-green-500 rounded-full"></div>
              <span className="text-text-primary font-medium">
                {isDemoMode ? 'Demo Connected to Google Drive' : 'Connected to Google Drive'}
              </span>
              <span className="text-text-secondary text-sm">({userEmail})</span>
            </div>
            <div className="flex items-center space-x-2">
              {isDemoMode && (
                <div className="text-xs text-text-secondary bg-blue-500/10 px-2 py-1 rounded">
                  Demo Data: {googleDriveDemoService.getDemoStats().totalFiles} files
                </div>
              )}
              <button
                onClick={loadFiles}
                disabled={isLoading}
                className="p-2 text-text-secondary hover:text-text-primary transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleDisconnect}
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <label className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg font-medium cursor-pointer transition-colors">
              <Upload className="h-4 w-4 inline mr-2" />
              Upload File
              <input
                type="file"
                onChange={handleUpload}
                className="hidden"
                disabled={isLoading}
              />
            </label>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-text-primary">Your Files</h3>
            {isLoading ? (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 text-text-secondary mx-auto mb-4 animate-spin" />
                <p className="text-text-secondary">Loading files...</p>
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-8 text-text-secondary">
                <Folder className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No files found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      {getFileIcon(file)}
                      <div>
                        <p className="text-text-primary font-medium">{file.name}</p>
                        <p className="text-text-secondary text-sm">
                          {formatFileSize(file.size || '0')} • {formatDate(file.modifiedTime)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleDownload(file.id, file.name)}
                        className="p-2 text-text-secondary hover:text-text-primary transition-colors"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(file.id)}
                        className="p-2 text-text-secondary hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};