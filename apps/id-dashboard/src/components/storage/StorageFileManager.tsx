// Reusable File Manager - Shared across all tools
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Grid, 
  List, 
  Search, 
  Filter, 
  MoreVertical, 
  Eye, 
  Share2, 
  Download, 
  Trash2, 
  Info, 
  Image, 
  Video, 
  Music, 
  FileText, 
  File,
  EyeOff,
  Users,
  HardDrive,
  Calendar,
  ArrowUpDown
} from 'lucide-react';
import { StorageFile, StorageProviderType } from '../../types/storage';
import { universalStorageService } from '../../services/universalStorageService';

interface StorageFileManagerProps {
  files: StorageFile[];
  onFileSelect?: (file: StorageFile) => void;
  onFileDelete?: (fileId: string) => void;
  onFileShare?: (file: StorageFile) => void;
  onFileDownload?: (file: StorageFile) => void;
  onFileInfo?: (file: StorageFile) => void;
  config?: {
    defaultView?: 'grid' | 'list';
    showProvider?: boolean;
    showVisibility?: boolean;
    showActions?: boolean;
    selectable?: boolean;
    sortable?: boolean;
    filterable?: boolean;
  };
}

type SortField = 'name' | 'size' | 'uploadedAt' | 'type';
type SortDirection = 'asc' | 'desc';
type FilterType = 'all' | 'image' | 'video' | 'document' | 'audio' | 'other';
type FilterVisibility = 'all' | 'private' | 'public' | 'friends';

export const StorageFileManager: React.FC<StorageFileManagerProps> = ({
  files,
  onFileSelect,
  onFileDelete,
  onFileShare,
  onFileDownload,
  onFileInfo,
  config = {}
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(config.defaultView || 'grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('uploadedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterVisibility, setFilterVisibility] = useState<FilterVisibility>('all');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  // Filter and sort files
  const filteredAndSortedFiles = React.useMemo(() => {
    let filtered = files;

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(file => 
        file.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(file => file.type === filterType);
    }

    // Apply visibility filter
    if (filterVisibility !== 'all') {
      filtered = filtered.filter(file => file.visibility === filterVisibility);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortField) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'size':
          aValue = a.size;
          bValue = b.size;
          break;
        case 'uploadedAt':
          aValue = new Date(a.uploadedAt).getTime();
          bValue = new Date(b.uploadedAt).getTime();
          break;
        case 'type':
          aValue = a.type;
          bValue = b.type;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [files, searchQuery, sortField, sortDirection, filterType, filterVisibility]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleFileSelect = (file: StorageFile) => {
    if (config.selectable) {
      setSelectedFiles(prev => {
        const newSet = new Set(prev);
        if (newSet.has(file.id)) {
          newSet.delete(file.id);
        } else {
          newSet.add(file.id);
        }
        return newSet;
      });
    }
    onFileSelect?.(file);
  };

  const handleSelectAll = () => {
    if (selectedFiles.size === filteredAndSortedFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(filteredAndSortedFiles.map(f => f.id)));
    }
  };

  const getFileIcon = (file: StorageFile) => {
    switch (file.type) {
      case 'image': return <Image className="w-5 h-5" />;
      case 'video': return <Video className="w-5 h-5" />;
      case 'audio': return <Music className="w-5 h-5" />;
      case 'document': return <FileText className="w-5 h-5" />;
      default: return <File className="w-5 h-5" />;
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

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const renderGridView = () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {filteredAndSortedFiles.map(file => (
        <div
          key={file.id}
          className={`bg-secondary rounded-lg p-4 cursor-pointer transition-all hover:bg-secondary/80 ${
            selectedFiles.has(file.id) ? 'ring-2 ring-primary' : ''
          }`}
          onClick={() => handleFileSelect(file)}
        >
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
              {getFileIcon(file)}
            </div>
            <h3 className="text-sm font-medium text-text-primary truncate w-full mb-1">
              {file.name}
            </h3>
            <p className="text-xs text-text-secondary mb-2">
              {formatFileSize(file.size)}
            </p>
            <div className="flex items-center space-x-2 text-xs text-text-secondary">
              {config.showVisibility && getVisibilityIcon(file.visibility)}
              {config.showProvider && getProviderIcon(file.provider)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderListView = () => (
    <div className="space-y-2">
      {filteredAndSortedFiles.map(file => (
        <div
          key={file.id}
          className={`bg-secondary rounded-lg p-4 cursor-pointer transition-all hover:bg-secondary/80 ${
            selectedFiles.has(file.id) ? 'ring-2 ring-primary' : ''
          }`}
          onClick={() => handleFileSelect(file)}
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
                <span>{formatFileSize(file.size)}</span>
                <span>{formatDate(file.uploadedAt)}</span>
                {config.showProvider && (
                  <span className="flex items-center space-x-1">
                    {getProviderIcon(file.provider)}
                    <span>{file.provider}</span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {config.showVisibility && (
                <div className="flex items-center space-x-1 text-text-secondary">
                  {getVisibilityIcon(file.visibility)}
                </div>
              )}
              {config.showActions && (
                <div className="flex items-center space-x-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onFileInfo?.(file);
                    }}
                    className="p-1 text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onFileDownload?.(file);
                    }}
                    className="p-1 text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onFileShare?.(file);
                    }}
                    className="p-1 text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onFileDelete?.(file.id);
                    }}
                    className="p-1 text-text-secondary hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
        {/* Search and Filters */}
        <div className="flex items-center space-x-3">
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
          
          {config.filterable && (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="p-2 bg-secondary border border-border rounded-lg text-text-secondary hover:text-text-primary transition-colors"
            >
              <Filter className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* View Mode and Sort */}
        <div className="flex items-center space-x-3">
          {config.selectable && filteredAndSortedFiles.length > 0 && (
            <button
              onClick={handleSelectAll}
              className="text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              {selectedFiles.size === filteredAndSortedFiles.length ? 'Deselect All' : 'Select All'}
            </button>
          )}
          
          {config.sortable && (
            <div className="flex items-center space-x-2">
              <select
                value={`${sortField}-${sortDirection}`}
                onChange={(e) => {
                  const [field, direction] = e.target.value.split('-');
                  setSortField(field as SortField);
                  setSortDirection(direction as SortDirection);
                }}
                className="px-3 py-2 bg-secondary border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="uploadedAt-desc">Newest First</option>
                <option value="uploadedAt-asc">Oldest First</option>
                <option value="name-asc">Name A-Z</option>
                <option value="name-desc">Name Z-A</option>
                <option value="size-desc">Largest First</option>
                <option value="size-asc">Smallest First</option>
                <option value="type-asc">Type A-Z</option>
                <option value="type-desc">Type Z-A</option>
              </select>
            </div>
          )}

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

      {/* Filters */}
      {showFilters && config.filterable && (
        <div className="bg-secondary rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                File Type
              </label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as FilterType)}
                className="w-full px-3 py-2 bg-modal-bg border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Types</option>
                <option value="image">Images</option>
                <option value="video">Videos</option>
                <option value="document">Documents</option>
                <option value="audio">Audio</option>
                <option value="other">Other</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Visibility
              </label>
              <select
                value={filterVisibility}
                onChange={(e) => setFilterVisibility(e.target.value as FilterVisibility)}
                className="w-full px-3 py-2 bg-modal-bg border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Visibility</option>
                <option value="private">Private</option>
                <option value="public">Public</option>
                <option value="friends">Friends Only</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* File Count */}
      <div className="text-sm text-text-secondary">
        {filteredAndSortedFiles.length} file{filteredAndSortedFiles.length !== 1 ? 's' : ''}
        {selectedFiles.size > 0 && ` (${selectedFiles.size} selected)`}
      </div>

      {/* Files Display */}
      {filteredAndSortedFiles.length === 0 ? (
        <div className="text-center py-12">
          <File className="w-12 h-12 text-text-secondary mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">No files found</h3>
          <p className="text-text-secondary">
            {searchQuery || filterType !== 'all' || filterVisibility !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Upload some files to get started'
            }
          </p>
        </div>
      ) : (
        viewMode === 'grid' ? renderGridView() : renderListView()
      )}
    </div>
  );
};
