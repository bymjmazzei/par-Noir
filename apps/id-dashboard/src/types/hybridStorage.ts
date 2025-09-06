import { cryptoWorkerManager } from './cryptoWorkerManager';
// Hybrid Storage Types and Interfaces
export interface StorageConfig {
  mode: 'pwa' | 'webapp' | 'auto';
  encryptionEnabled: boolean;
  syncEnabled: boolean;
  maxStorageSize: number; // in bytes
}

export interface StorageStats {
  totalSize: number;
  usedSize: number;
  availableSize: number;
  itemCount: number;
  lastSync: string;
  syncStatus: 'synced' | 'pending' | 'error';
}
