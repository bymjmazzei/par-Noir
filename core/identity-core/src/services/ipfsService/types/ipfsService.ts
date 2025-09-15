// import { cryptoWorkerManager } from '../../encryption/cryptoWorkerManager';
export interface IPFSConfig {
  apiKey: string;
  apiSecret: string;
  gatewayUrl: string;
  apiUrl: string;
  enabled: boolean;
  pinningEnabled: boolean;
}

export interface IPFSFile {
  cid: string;
  name: string;
  size: number;
  type: string;
  hash: string;
  pinned: boolean;
  uploadedAt: string;
}

export interface IPFSUploadResponse {
  success: boolean;
  cid?: string;
  name?: string;
  size?: number;
  error?: string;
  gatewayUrl?: string;
}

export interface IPFSDownloadResponse {
  success: boolean;
  data?: ArrayBuffer;
  error?: string;
  metadata?: IPFSFile;
}

export interface IPFSPinResponse {
  success: boolean;
  cid?: string;
  pinned?: boolean;
  error?: string;
}

export interface IPFSStats {
  totalFiles: number;
  totalSize: number;
  pinnedFiles: number;
  gatewayRequests: number;
}

export interface IPFSConnectionStatus {
  isConnected: boolean;
  lastConnected?: string;
  connectionErrors: string[];
  gatewayStatus: 'online' | 'offline' | 'degraded';
  apiStatus: 'online' | 'offline' | 'degraded';
}
