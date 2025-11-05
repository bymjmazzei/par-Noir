import React, { useState, useEffect } from 'react';
import { HardDrive, Upload, Download, Trash2, File, Folder, RefreshCw, AlertCircle, Play, Image, Video, Music, FileText, Archive, Code, Lock } from 'lucide-react';
import { googleDriveDemoService } from '../../services/googleDriveDemoService';
import { MockGoogleOAuth } from './MockGoogleOAuth';

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
  const [isDemoMode, setIsDemoMode] = useState(true); // still default to demo mode
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedFile, setSelectedFile] = useState<GoogleDriveFile | null>(null);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [showSuccessNotification, setShowSuccessNotification] = useState(false);
  const [storageQuota, setStorageQuota] = useState<{
    limit: number;
    usage: number;
    usageInDrive: number;
    usageInDriveTrash: number;
  } | null>(null);

  useEffect(() => {
    console.log('useEffect called, isDemoMode:', isDemoMode);
    if (isDemoMode) {
      // Setup demo service listeners
      const unsubscribe = googleDriveDemoService.onAuthStateChange((authState) => {
        console.log('Auth state changed:', authState);
        setIsConnected(authState.isSignedIn);
        setUserEmail(authState.user?.email || '');
        if (authState.isSignedIn) {
          console.log('Auth state is signed in, calling loadFiles and loadStorageQuota');
          loadFiles();
          loadStorageQuota();
        } else {
          console.log('Auth state is not signed in, clearing files');
          setFiles([]);
          setStorageQuota(null);
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
      loadStorageQuota();
    }
    }
  }, [isDemoMode]);

  const handleConnect = async () => {
    if (isDemoMode) {
      // Show OAuth modal for demo mode
      setShowOAuthModal(true);
    } else {
      // Use real Google Drive API
      try {
        setIsLoading(true);
        setError(null);
        
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
      } catch (err) {
        setError('Failed to connect to Google Drive');
        console.error('Error connecting:', err);
        setIsLoading(false);
      }
    }
  };

  const loadFiles = async () => {
    try {
      console.log('loadFiles called, isDemoMode:', isDemoMode);
      setIsLoading(true);
      
      if (isDemoMode) {
        console.log('Calling demo service listFiles...');
        const demoFiles = await googleDriveDemoService.listFiles();
        console.log('Demo service returned files:', demoFiles.length);
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
        const email = localStorage.getItem('google_drive_email');
        if (!token || !email) {
          throw new Error('No access token or email found');
        }

        // Get pnIdentifier from authenticated user or use email as fallback
        // In production, this should come from the authenticated pN identity
        const authenticatedUserStr = localStorage.getItem('authenticated_user');
        let pnIdentifier = email.split('@')[0]; // Fallback to email prefix
        let ownerDid = null;
        
        if (authenticatedUserStr) {
          try {
            const authenticatedUser = JSON.parse(authenticatedUserStr);
            pnIdentifier = authenticatedUser.id || authenticatedUser.pnName || pnIdentifier;
            ownerDid = authenticatedUser.id || authenticatedUser.did || null;
          } catch (e) {
            console.warn('Could not parse authenticated user, using fallback');
          }
        }
        
        // Use proxy server endpoint that creates metadata files
        const formData = new FormData();
        formData.append('file', file);
        formData.append('visibility', 'private'); // Default to private
        formData.append('pnIdentifier', pnIdentifier);
        if (ownerDid) {
          formData.append('ownerDid', ownerDid);
        }
        
        // Get proxy server URL - adjust this based on your server setup
        const proxyUrl = process.env.REACT_APP_API_URL || 'http://localhost:3002';
        const response = await fetch(
          `${proxyUrl}/api/google-drive/upload/${encodeURIComponent(email)}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            },
            body: formData
          }
        );
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to upload file');
        }
        
        await loadFiles();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload file');
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
        
        // For demo mode, add metadata to filename for binary files
        if (!blob.type.includes('text')) {
          const file = files.find(f => f.id === fileId);
          if (file) {
            const baseName = fileName.split('.')[0];
            const extension = fileName.split('.').pop();
            a.download = `${baseName}_pN_${file.createdTime.split('T')[0]}.${extension}`;
          } else {
            a.download = fileName;
          }
        } else {
          a.download = fileName;
        }
        
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
    const mimeType = file.mimeType.toLowerCase();
    
    if (mimeType.includes('folder')) {
      return <Folder className="h-5 w-5 text-blue-400" />;
    } else if (mimeType.includes('image')) {
      return <Image className="h-5 w-5 text-green-400" />;
    } else if (mimeType.includes('video')) {
      return <Video className="h-5 w-5 text-purple-400" />;
    } else if (mimeType.includes('audio')) {
      return <Music className="h-5 w-5 text-yellow-400" />;
    } else if (mimeType.includes('pdf') || mimeType.includes('document')) {
      return <FileText className="h-5 w-5 text-red-400" />;
    } else if (mimeType.includes('text') || mimeType.includes('markdown')) {
      return <FileText className="h-5 w-5 text-gray-400" />;
    } else if (mimeType.includes('json') || mimeType.includes('yaml') || mimeType.includes('xml')) {
      return <Code className="h-5 w-5 text-orange-400" />;
    } else if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) {
      return <Archive className="h-5 w-5 text-indigo-400" />;
    } else {
      return <File className="h-5 w-5 text-text-secondary" />;
    }
  };

  const getFileThumbnail = (file: GoogleDriveFile) => {
    const mimeType = file.mimeType.toLowerCase();

    if (mimeType.includes('folder')) {
      return (
        <div className="w-24 h-24 bg-blue-500/20 rounded-lg flex items-center justify-center">
          <Folder className="h-8 w-8 text-blue-400" />
        </div>
      );
    } else if (mimeType.includes('image')) {
      // For images, use actual image data if available
      if (file.fileData) {
        return (
          <div className="w-24 h-24 bg-gray-100 rounded-lg overflow-hidden">
            <img 
              src={file.fileData} 
              alt={file.name}
              className="w-full h-full object-cover"
            />
          </div>
        );
      } else {
        // For demo files, try to load from public directory
        const demoFileMap: { [key: string]: string } = {
          'demo-image-1': '/demo-files/IMG_5431.JPG',
          'demo-video-1': '/demo-files/IMG_1116.MOV',
          'demo-spreadsheet-1': '/demo-files/2024 Wrap Sheet.xlsx',
          'demo-pdf-1': '/demo-files/Halloween Harvest Haunt 2024 Deck (3).pdf',
          'demo-doc-1': '/demo-files/sample-document.txt',
          'demo-config-1': '/demo-files/config.json'
        };
        
        const filePath = demoFileMap[file.id];
        if (filePath) {
          return (
            <div className="w-24 h-24 bg-gray-100 rounded-lg overflow-hidden">
              <img 
                src={filePath} 
                alt={file.name}
                className="w-full h-full object-cover pointer-events-none"
                onError={(e) => {
                  // Fallback to icon if image fails to load
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    parent.innerHTML = '<div class="w-full h-full flex items-center justify-center"><svg class="h-8 w-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>';
                  }
                }}
              />
            </div>
          );
        } else {
          // Fallback to icon for demo files
          return (
            <div className="w-24 h-24 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
              <Image className="h-8 w-8 text-green-400" />
            </div>
          );
        }
      }
    } else if (mimeType.includes('video')) {
      // For videos, use actual video data if available
      if (file.fileData) {
        return (
          <div className="relative w-24 h-24 bg-gray-900 rounded-lg overflow-hidden">
            <video 
              src={file.fileData}
              className="w-full h-full object-cover"
              muted
              preload="metadata"
              onLoadedMetadata={(e) => {
                const video = e.target as HTMLVideoElement;
                video.currentTime = 0.1;
              }}
            />
            <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-1 rounded">
              {file.name.split('.').pop()?.toUpperCase()}
            </div>
            <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/20">
              <div className="bg-black/70 rounded-full p-2">
                <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
            </div>
          </div>
        );
      } else {
        // For demo files, try to load from public directory
        const demoFileMap: { [key: string]: string } = {
          'demo-image-1': '/demo-files/IMG_5431.JPG',
          'demo-video-1': '/demo-files/IMG_1116.MOV',
          'demo-spreadsheet-1': '/demo-files/2024 Wrap Sheet.xlsx',
          'demo-pdf-1': '/demo-files/Halloween Harvest Haunt 2024 Deck (3).pdf',
          'demo-doc-1': '/demo-files/sample-document.txt',
          'demo-config-1': '/demo-files/config.json'
        };
        
        const filePath = demoFileMap[file.id];
        if (filePath) {
          return (
            <div className="relative w-24 h-24 bg-gray-900 rounded-lg overflow-hidden">
            <video 
              src={filePath}
              className="w-full h-full object-cover pointer-events-none"
              muted
              preload="metadata"
                onLoadedMetadata={(e) => {
                  const video = e.target as HTMLVideoElement;
                  video.currentTime = 0.1;
                }}
                onError={(e) => {
                  // Fallback to icon if video fails to load
                  const target = e.target as HTMLVideoElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    parent.innerHTML = '<div class="w-full h-full flex items-center justify-center"><svg class="h-8 w-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg></div>';
                  }
                }}
              />
              <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-1 rounded">
                {file.name.split('.').pop()?.toUpperCase()}
              </div>
              <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/20">
                <div className="bg-black/70 rounded-full p-2">
                  <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
              </div>
            </div>
          );
        } else {
          // Fallback to icon for demo files
          return (
            <div className="w-24 h-24 bg-gray-900 rounded-lg flex items-center justify-center">
              <Video className="h-8 w-8 text-purple-400" />
            </div>
          );
        }
      }
    } else if (mimeType.includes('audio')) {
      return (
        <div className="w-24 h-24 bg-yellow-500/20 rounded-lg flex items-center justify-center">
          <Music className="h-8 w-8 text-yellow-400" />
        </div>
      );
    } else if (mimeType.includes('pdf')) {
      // For PDF files, try to load from public directory
      const demoFileMap: { [key: string]: string } = {
        'demo-image-1': '/demo-files/IMG_5431.JPG',
        'demo-video-1': '/demo-files/IMG_1116.MOV',
        'demo-spreadsheet-1': '/demo-files/2024 Wrap Sheet.xlsx',
        'demo-pdf-1': '/demo-files/Halloween Harvest Haunt 2024 Deck (3).pdf',
        'demo-doc-1': '/demo-files/sample-document.txt',
        'demo-config-1': '/demo-files/config.json'
      };
      
      const filePath = demoFileMap[file.id];
      if (filePath) {
        return (
          <div className="w-24 h-24 bg-red-50 rounded-lg border border-red-200 overflow-hidden">
            <iframe 
              src={filePath}
              className="w-full h-full border-0 pointer-events-none"
              title={file.name}
              onError={(e) => {
                // Fallback to icon if PDF fails to load
                const target = e.target as HTMLIFrameElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                  parent.innerHTML = '<div class="w-full h-full flex items-center justify-center"><div class="text-center"><svg class="h-6 w-6 text-red-600 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg><div class="text-xs text-red-600 font-medium">PDF</div></div></div>';
                }
              }}
            />
          </div>
        );
      } else {
        return (
          <div className="w-24 h-24 bg-red-50 rounded-lg flex items-center justify-center border border-red-200">
            <div className="text-center">
              <FileText className="h-6 w-6 text-red-600 mx-auto mb-1" />
              <div className="text-xs text-red-600 font-medium">PDF</div>
            </div>
          </div>
        );
      }
    } else if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('sheet') || mimeType.includes('csv')) {
      // For CSV files, show content preview if available
      if (file.fileData && mimeType.includes('csv')) {
        return (
          <div className="w-24 h-24 bg-green-50 rounded-lg border border-green-200 overflow-hidden">
            <div className="p-2 text-xs text-green-800 leading-tight">
              <div className="font-mono whitespace-pre-wrap max-h-full overflow-hidden">
                {atob(file.fileData.split(',')[1]).substring(0, 100)}...
              </div>
            </div>
          </div>
        );
      } else {
        return (
          <div className="w-24 h-24 bg-green-50 rounded-lg flex items-center justify-center border border-green-200">
            <div className="text-center">
              <FileText className="h-6 w-6 text-green-600 mx-auto mb-1" />
              <div className="text-xs text-green-600 font-medium">CSV</div>
            </div>
          </div>
        );
      }
    } else if (mimeType.includes('text') || mimeType.includes('markdown')) {
      // For text files, show actual content if available
      if (file.fileData) {
        return (
          <div className="w-24 h-24 bg-blue-50 rounded-lg border border-blue-200 overflow-hidden">
            <div className="p-2 text-xs text-blue-800 leading-tight">
              <div className="font-mono whitespace-pre-wrap max-h-full overflow-hidden">
                {atob(file.fileData.split(',')[1]).substring(0, 100)}...
              </div>
            </div>
          </div>
        );
      } else {
        return (
          <div className="w-24 h-24 bg-blue-50 rounded-lg flex items-center justify-center border border-blue-200">
            <div className="text-center">
              <FileText className="h-6 w-6 text-blue-600 mx-auto mb-1" />
              <div className="text-xs text-blue-600 font-medium">TXT</div>
            </div>
          </div>
        );
      }
    } else if (mimeType.includes('json') || mimeType.includes('yaml') || mimeType.includes('xml')) {
      // For JSON files, show formatted content if available
      if (file.fileData) {
        return (
          <div className="w-24 h-24 bg-orange-50 rounded-lg border border-orange-200 overflow-hidden">
            <div className="p-2 text-xs text-orange-800 leading-tight">
              <div className="font-mono whitespace-pre-wrap max-h-full overflow-hidden">
                {atob(file.fileData.split(',')[1]).substring(0, 100)}...
              </div>
            </div>
          </div>
        );
      } else {
        return (
          <div className="w-24 h-24 bg-orange-50 rounded-lg flex items-center justify-center border border-orange-200">
            <div className="text-center">
              <Code className="h-6 w-6 text-orange-600 mx-auto mb-1" />
              <div className="text-xs text-orange-600 font-medium">JSON</div>
            </div>
          </div>
        );
      }
    } else if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) {
      return (
        <div className="w-24 h-24 bg-indigo-500/20 rounded-lg flex items-center justify-center">
          <Archive className="h-8 w-8 text-indigo-400" />
        </div>
      );
    } else {
      return (
        <div className="w-24 h-24 bg-gray-500/20 rounded-lg flex items-center justify-center">
          <File className="h-8 w-8 text-text-secondary" />
        </div>
      );
    }
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

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const loadStorageQuota = async () => {
    if (isDemoMode) {
      // Mock storage quota data
      setStorageQuota({
        limit: 16106127360, // 15GB
        usage: 5368709120, // ~5GB used
        usageInDrive: 2684354560, // ~2.5GB in Drive
        usageInDriveTrash: 268435456 // ~256MB in Trash
      });
    } else {
      // Real Google Drive API call
      try {
        const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('google_access_token')}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setStorageQuota({
            limit: parseInt(data.storageQuota.limit || '0'),
            usage: parseInt(data.storageQuota.usage || '0'),
            usageInDrive: parseInt(data.storageQuota.usageInDrive || '0'),
            usageInDriveTrash: parseInt(data.storageQuota.usageInDriveTrash || '0')
          });
        }
      } catch (error) {
        console.error('Error loading storage quota:', error);
      }
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const handleFileClick = (file: GoogleDriveFile) => {
    setSelectedFile(file);
    setShowPrivacyModal(true);
  };

  const handlePrivacyChange = (fileId: string, privacy: 'private' | 'public' | 'shared') => {
    // Update file privacy in demo
    setFiles(prevFiles => 
      prevFiles.map(file => 
        file.id === fileId 
          ? { ...file, privacy } 
          : file
      )
    );
    setShowPrivacyModal(false);
    setSelectedFile(null);
  };

  const handleOAuthSuccess = async (token: string, user: { email: string; name: string; picture?: string }) => {
    setShowOAuthModal(false);
    
    // Store token and user info
    localStorage.setItem('google_drive_token', token);
    localStorage.setItem('google_drive_email', user.email);
    localStorage.setItem('google_drive_name', user.name);
    if (user.picture) {
      localStorage.setItem('google_drive_picture', user.picture);
    }
    
    // Use the demo service to properly authenticate
    await googleDriveDemoService.signIn();
    
    // Show success notification
    setShowSuccessNotification(true);
    setTimeout(() => setShowSuccessNotification(false), 3000);
    
    // The auth state change will be handled by the useEffect listener
    // which will call loadFiles() and loadStorageQuota()
  };

  const handleOAuthError = (error: string) => {
    setShowOAuthModal(false);
    setError(error);
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
        </div>
      </div>


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
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

          <div className="flex items-center justify-between">
            <label className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium cursor-pointer transition-colors">
              <Upload className="h-4 w-4 inline mr-2" />
              Upload File
              <input
                type="file"
                onChange={handleUpload}
                className="hidden"
                disabled={isLoading}
              />
            </label>
            
            {/* View Mode Toggle */}
            <div className="flex items-center space-x-2 bg-secondary/50 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'grid' 
                    ? 'bg-blue-600 text-white' 
                    : 'text-text-secondary hover:text-text-primary'
                }`}
                title="Grid View"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'list' 
                    ? 'bg-blue-600 text-white' 
                    : 'text-text-secondary hover:text-text-primary'
                }`}
                title="List View"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>

          {/* Storage Bar */}
          {storageQuota && (
            <div className="bg-secondary/20 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-text-primary">Storage Usage</h3>
                <span className="text-sm text-text-secondary">
                  {formatBytes(storageQuota.usage)} of {formatBytes(storageQuota.limit)}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-300 ${
                    (storageQuota.usage / storageQuota.limit) > 0.9 ? 'bg-red-500' :
                    (storageQuota.usage / storageQuota.limit) > 0.75 ? 'bg-yellow-500' :
                    'bg-blue-500'
                  }`}
                  style={{ 
                    width: `${Math.min((storageQuota.usage / storageQuota.limit) * 100, 100)}%` 
                  }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-text-secondary">
                <span>Drive: {formatBytes(storageQuota.usageInDrive)}</span>
                <span>Trash: {formatBytes(storageQuota.usageInDriveTrash)}</span>
                <span>{Math.round(((storageQuota.limit - storageQuota.usage) / storageQuota.limit) * 100)}% available</span>
              </div>
            </div>
          )}

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
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {files.map((file) => (
            <div
              key={file.id}
              onClick={() => handleFileClick(file)}
              className="bg-secondary/50 rounded-lg p-3 hover:bg-secondary/70 transition-colors cursor-pointer group"
            >
                    {/* File Thumbnail */}
                    {getFileThumbnail(file)}
                    
                    {/* File Info */}
                    <div className="mt-3 space-y-1">
                      <p className="text-text-primary font-medium text-sm truncate" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-text-secondary text-xs">
                        {formatFileSize(file.size || '0')}
                      </p>
                      <p className="text-text-secondary text-xs">
                        {formatDate(file.modifiedTime)}
                      </p>
                      {/* Privacy indicator */}
                      <div className="flex items-center space-x-1">
                        <div className={`w-2 h-2 rounded-full ${
                          (file as any).privacy === 'private' ? 'bg-red-500' :
                          (file as any).privacy === 'shared' ? 'bg-yellow-500' :
                          (file as any).privacy === 'public' ? 'bg-green-500' : 'bg-gray-500'
                        }`}></div>
                        <span className="text-xs text-text-secondary">
                          {(file as any).privacy === 'private' ? 'Private' :
                           (file as any).privacy === 'shared' ? 'Shared' :
                           (file as any).privacy === 'public' ? 'Public' : 'Private'}
                        </span>
                      </div>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex items-center justify-between mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(file.id, file.name);
                          }}
                          className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(file.id);
                        }}
                        className="p-1.5 text-text-secondary hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file.id}
              onClick={() => handleFileClick(file)}
              className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg hover:bg-secondary/70 transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center space-x-3">
                      {getFileIcon(file)}
                      <div className="flex-1">
                        <p className="text-text-primary font-medium">{file.name}</p>
                        <p className="text-text-secondary text-sm">
                          {formatFileSize(file.size || '0')} • {formatDate(file.modifiedTime)}
                        </p>
                        {/* Privacy indicator */}
                        <div className="flex items-center space-x-1 mt-1">
                          <div className={`w-2 h-2 rounded-full ${
                            (file as any).privacy === 'private' ? 'bg-red-500' :
                            (file as any).privacy === 'shared' ? 'bg-yellow-500' :
                            (file as any).privacy === 'public' ? 'bg-green-500' : 'bg-gray-500'
                          }`}></div>
                          <span className="text-xs text-text-secondary">
                            {(file as any).privacy === 'private' ? 'Private' :
                             (file as any).privacy === 'shared' ? 'Shared' :
                             (file as any).privacy === 'public' ? 'Public' : 'Private'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(file.id, file.name);
                        }}
                        className="p-2 text-text-secondary hover:text-text-primary transition-colors"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(file.id);
                        }}
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

      {/* Privacy Settings Modal */}
      {showPrivacyModal && selectedFile && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden">
            <div className="flex h-full">
              {/* File Preview Section */}
              <div className="flex-1 p-6 border-r border-border">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-text-primary">File Preview</h3>
                  <button
                    onClick={() => setShowPrivacyModal(false)}
                    className="text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="mb-4">
                  <p className="text-text-secondary text-sm mb-2">File: {selectedFile.name}</p>
                  <p className="text-text-secondary text-sm">Size: {formatFileSize(selectedFile.size)}</p>
                </div>

                {/* Full File Preview */}
                <div className="w-full h-96 border border-border rounded-lg overflow-hidden bg-gray-50">
                  {selectedFile.mimeType.includes('image') ? (
                    selectedFile.fileData ? (
                      <img 
                        src={selectedFile.fileData}
                        alt={selectedFile.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      (() => {
                        // For demo files, try to load from public directory
                        const demoFileMap: { [key: string]: string } = {
                          'demo-image-1': '/demo-files/IMG_5431.JPG',
                          'demo-video-1': '/demo-files/IMG_1116.MOV',
                          'demo-spreadsheet-1': '/demo-files/2024 Wrap Sheet.xlsx',
                          'demo-pdf-1': '/demo-files/Halloween Harvest Haunt 2024 Deck (3).pdf',
                          'demo-doc-1': '/demo-files/sample-document.txt',
                          'demo-config-1': '/demo-files/config.json'
                        };
                        
                        const filePath = demoFileMap[selectedFile.id];
                        if (filePath) {
                          return (
                            <img 
                              src={filePath}
                              alt={selectedFile.name}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                // Fallback to "not available" if image fails to load
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent) {
                                  parent.innerHTML = '<div class="w-full h-full flex items-center justify-center bg-gray-100"><div class="text-center"><svg class="h-16 w-16 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg><p class="text-gray-500">Image preview not available</p></div></div>';
                                }
                              }}
                            />
                          );
                        } else {
                          return (
                            <div className="w-full h-full flex items-center justify-center bg-gray-100">
                              <div className="text-center">
                                <svg className="h-16 w-16 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <p className="text-gray-500">Image preview not available</p>
                              </div>
                            </div>
                          );
                        }
                      })()
                    )
                  ) : selectedFile.mimeType.includes('video') ? (
                    selectedFile.fileData ? (
                      <video 
                        src={selectedFile.fileData}
                        className="w-full h-full object-contain"
                        controls
                      />
                    ) : (
                      (() => {
                        // For demo files, try to load from public directory
                        const demoFileMap: { [key: string]: string } = {
                          'demo-image-1': '/demo-files/IMG_5431.JPG',
                          'demo-video-1': '/demo-files/IMG_1116.MOV',
                          'demo-spreadsheet-1': '/demo-files/2024 Wrap Sheet.xlsx',
                          'demo-pdf-1': '/demo-files/Halloween Harvest Haunt 2024 Deck (3).pdf',
                          'demo-doc-1': '/demo-files/sample-document.txt',
                          'demo-config-1': '/demo-files/config.json'
                        };
                        
                        const filePath = demoFileMap[selectedFile.id];
                        if (filePath) {
                          return (
                            <video 
                              src={filePath}
                              className="w-full h-full object-contain"
                              controls
                              onError={(e) => {
                                // Fallback to "not available" if video fails to load
                                const target = e.target as HTMLVideoElement;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent) {
                                  parent.innerHTML = '<div class="w-full h-full flex items-center justify-center bg-gray-100"><div class="text-center"><svg class="h-16 w-16 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg><p class="text-gray-500">Video preview not available</p></div></div>';
                                }
                              }}
                            />
                          );
                        } else {
                          return (
                            <div className="w-full h-full flex items-center justify-center bg-gray-100">
                              <div className="text-center">
                                <svg className="h-16 w-16 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                <p className="text-gray-500">Video preview not available</p>
                              </div>
                            </div>
                          );
                        }
                      })()
                    )
                  ) : selectedFile.mimeType.includes('pdf') ? (
                    (() => {
                      // For demo files, try to load from public directory
                      const demoFileMap: { [key: string]: string } = {
                        'demo-image-1': '/demo-files/IMG_5431.JPG',
                        'demo-video-1': '/demo-files/IMG_1116.MOV',
                        'demo-spreadsheet-1': '/demo-files/2024 Wrap Sheet.xlsx',
                        'demo-pdf-1': '/demo-files/Halloween Harvest Haunt 2024 Deck (3).pdf',
                        'demo-doc-1': '/demo-files/sample-document.txt',
                        'demo-config-1': '/demo-files/config.json'
                      };
                      
                      const filePath = demoFileMap[selectedFile.id];
                      if (filePath) {
                        return (
                          <div className="w-full h-full">
                            <iframe 
                              src={filePath}
                              className="w-full h-full border-0"
                              title={selectedFile.name}
                              onError={(e) => {
                                // Fallback to "not available" if PDF fails to load
                                const target = e.target as HTMLIFrameElement;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent) {
                                  parent.innerHTML = '<div class="w-full h-full flex items-center justify-center bg-gray-100"><div class="text-center"><svg class="h-16 w-16 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg><p class="text-gray-500">PDF preview not available</p></div></div>';
                                }
                              }}
                            />
                          </div>
                        );
                      } else {
                        return (
                          <div className="w-full h-full flex items-center justify-center bg-gray-100">
                            <div className="text-center">
                              <svg className="h-16 w-16 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <p className="text-gray-500">PDF preview not available</p>
                            </div>
                          </div>
                        );
                      }
                    })()
                  ) : selectedFile.mimeType.includes('spreadsheet') || selectedFile.mimeType.includes('excel') || selectedFile.mimeType.includes('sheet') || selectedFile.mimeType.includes('csv') ? (
                    <div className="w-full h-full flex items-center justify-center bg-green-50">
                      <div className="text-center p-6">
                        <svg className="h-16 w-16 text-green-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <h3 className="text-lg font-semibold text-green-800 mb-2">Spreadsheet File</h3>
                        <p className="text-green-600 mb-4">This spreadsheet file is encrypted and requires decryption to view.</p>
                        <p className="text-sm text-green-500">Click "Download" to decrypt and view this file in Excel or Google Sheets.</p>
                      </div>
                    </div>
                  ) : selectedFile.mimeType.includes('text') || selectedFile.mimeType.includes('markdown') ? (
                    selectedFile.fileData ? (
                      <div className="w-full h-full p-4 bg-white overflow-auto">
                        <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
                          {atob(selectedFile.fileData.split(',')[1])}
                        </pre>
                      </div>
                    ) : (
                      (() => {
                        // For demo files, try to load from public directory
                        const demoFileMap: { [key: string]: string } = {
                          'demo-image-1': '/demo-files/IMG_5431.JPG',
                          'demo-video-1': '/demo-files/IMG_1116.MOV',
                          'demo-spreadsheet-1': '/demo-files/2024 Wrap Sheet.xlsx',
                          'demo-pdf-1': '/demo-files/Halloween Harvest Haunt 2024 Deck (3).pdf',
                          'demo-doc-1': '/demo-files/sample-document.txt',
                          'demo-config-1': '/demo-files/config.json'
                        };
                        
                        const filePath = demoFileMap[selectedFile.id];
                        if (filePath) {
                          return (
                            <div className="w-full h-full p-4 bg-white overflow-auto">
                              <iframe 
                                src={filePath}
                                className="w-full h-full border-0"
                                title={selectedFile.name}
                                onError={(e) => {
                                  // Fallback to "not available" if file fails to load
                                  const target = e.target as HTMLIFrameElement;
                                  target.style.display = 'none';
                                  const parent = target.parentElement;
                                  if (parent) {
                                    parent.innerHTML = '<div class="w-full h-full flex items-center justify-center bg-gray-100"><div class="text-center"><svg class="h-16 w-16 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg><p class="text-gray-500">Text preview not available</p></div></div>';
                                  }
                                }}
                              />
                            </div>
                          );
                        } else {
                          return (
                            <div className="w-full h-full flex items-center justify-center bg-gray-100">
                              <div className="text-center">
                                <svg className="h-16 w-16 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <p className="text-gray-500">Text preview not available</p>
                              </div>
                            </div>
                          );
                        }
                      })()
                    )
                  ) : selectedFile.mimeType.includes('json') || selectedFile.mimeType.includes('yaml') || selectedFile.mimeType.includes('xml') ? (
                    selectedFile.fileData ? (
                      <div className="w-full h-full p-4 bg-white overflow-auto">
                        <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
                          {JSON.stringify(JSON.parse(atob(selectedFile.fileData.split(',')[1])), null, 2)}
                        </pre>
                      </div>
                    ) : (
                      (() => {
                        // For demo files, try to load from public directory
                        const demoFileMap: { [key: string]: string } = {
                          'demo-image-1': '/demo-files/IMG_5431.JPG',
                          'demo-video-1': '/demo-files/IMG_1116.MOV',
                          'demo-spreadsheet-1': '/demo-files/2024 Wrap Sheet.xlsx',
                          'demo-pdf-1': '/demo-files/Halloween Harvest Haunt 2024 Deck (3).pdf',
                          'demo-doc-1': '/demo-files/sample-document.txt',
                          'demo-config-1': '/demo-files/config.json'
                        };
                        
                        const filePath = demoFileMap[selectedFile.id];
                        if (filePath) {
                          return (
                            <div className="w-full h-full p-4 bg-white overflow-auto">
                              <iframe 
                                src={filePath}
                                className="w-full h-full border-0"
                                title={selectedFile.name}
                                onError={(e) => {
                                  // Fallback to "not available" if file fails to load
                                  const target = e.target as HTMLIFrameElement;
                                  target.style.display = 'none';
                                  const parent = target.parentElement;
                                  if (parent) {
                                    parent.innerHTML = '<div class="w-full h-full flex items-center justify-center bg-gray-100"><div class="text-center"><svg class="h-16 w-16 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg><p class="text-gray-500">JSON preview not available</p></div></div>';
                                  }
                                }}
                              />
                            </div>
                          );
                        } else {
                          return (
                            <div className="w-full h-full flex items-center justify-center bg-gray-100">
                              <div className="text-center">
                                <svg className="h-16 w-16 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                </svg>
                                <p className="text-gray-500">JSON preview not available</p>
                              </div>
                            </div>
                          );
                        }
                      })()
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <div className="text-center">
                        <svg className="h-16 w-16 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-gray-500">Preview not available</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Privacy Settings Section */}
              <div className="w-80 p-6">
                <h3 className="text-lg font-semibold text-text-primary mb-4">Privacy Settings</h3>
                
                <div className="mb-4">
                  <p className="text-text-secondary text-sm mb-2">Current: {(selectedFile as any).privacy || 'Private'}</p>
                </div>

                <div className="space-y-3">
                  <div 
                    className="flex items-center space-x-3 p-3 bg-secondary/20 rounded-lg cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => handlePrivacyChange(selectedFile.id, 'private')}
                  >
                    <div className="w-4 h-4 border-2 border-blue-600 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    </div>
                    <div>
                      <div className="text-text-primary font-medium">Private</div>
                      <div className="text-text-secondary text-sm">Only you can access this file</div>
                    </div>
                  </div>
                  
                  <div 
                    className="flex items-center space-x-3 p-3 bg-secondary/20 rounded-lg cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => handlePrivacyChange(selectedFile.id, 'shared')}
                  >
                    <div className="w-4 h-4 border-2 border-gray-300 rounded-full"></div>
                    <div>
                      <div className="text-text-primary font-medium">Share with specific pN users</div>
                      <div className="text-text-secondary text-sm">Share with selected par Noir users via DID</div>
                    </div>
                  </div>
                  
                  <div 
                    className="flex items-center space-x-3 p-3 bg-secondary/20 rounded-lg cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => handlePrivacyChange(selectedFile.id, 'public')}
                  >
                    <div className="w-4 h-4 border-2 border-gray-300 rounded-full"></div>
                    <div>
                      <div className="text-text-primary font-medium">Public</div>
                      <div className="text-text-secondary text-sm">Anyone with the link can view</div>
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 p-3 bg-blue-600/20 border border-blue-600/30 rounded-lg">
                  <p className="text-blue-400 text-sm">
                    All files remain encrypted with AES-256-GCM. Privacy settings control who can decrypt them.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {showSuccessNotification && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2 animate-in slide-in-from-right duration-300">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Successfully connected to Google Drive!</span>
        </div>
      )}

      {/* OAuth Modal */}
      {showOAuthModal && (
        <MockGoogleOAuth
          onAuthSuccess={handleOAuthSuccess}
          onAuthError={handleOAuthError}
          onClose={() => setShowOAuthModal(false)}
        />
      )}

    </div>
  );
};