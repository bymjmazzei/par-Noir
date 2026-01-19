/**
 * Types for FileStorageAggregator and storage components.
 */

export interface DriveAccount {
  provider: string;
  accountId: string;
  email?: string;
  displayName?: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  thumbnailLink?: string;
  webViewLink?: string;
  modifiedTime?: string;
  isPublic?: boolean;
  accountId?: string;
  mainFileId?: string;
  isThumbnail?: boolean;
  isUploading?: boolean;
  uploadProgress?: number;
  uploadTaskId?: string;
  displayName?: string;
  [key: string]: unknown;
}
