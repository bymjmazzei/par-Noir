// Identity Sync Types and Interfaces
export interface SyncResult {
  success: boolean;
  cid?: string;
  error?: string;
  timestamp: string;
}

export interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export interface AuditLogEntry {
  timestamp: string;
  event: string;
  details: any;
  userAgent: string;
  deviceId: string;
}

export interface DIDDocumentUpdate {
  service?: Array<{
    id: string;
    type: string;
    serviceEndpoint: string;
    timestamp: string;
    deviceId: string;
  }>;
  updated: string;
}

export interface EncryptedData {
  data: number[];
  iv: number[];
}

export interface IPFSGateway {
  url: string;
  name: string;
}
