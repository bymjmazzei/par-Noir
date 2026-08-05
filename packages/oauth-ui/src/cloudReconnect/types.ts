import type { ApiStorageAccountRef, StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';

export type CloudProviderId =
  | 'google_drive'
  | 'dropbox'
  | 'aws_s3'
  | 'azure_blob'
  | 'onedrive'
  | 'ftp';

export interface CloudReconnectGateConfig {
  enabled: boolean;
  authToken: string | null | undefined;
  pnIdentifier: string | null | undefined;
  apiEndpoint: string;
  /** Load sealed/session local envelope for this identity */
  loadLocalEnvelope: () => Promise<StorageCredentialsEnvelope | null>;
  /** Optional: skip auto-open after user dismisses (sessionStorage key) */
  dismissStorageKey?: string;
  /**
   * Optional: reuse accounts already fetched (e.g. unlock bootstrap) to avoid
   * a second GET /api/storage/accounts on the same unlock.
   */
  preferCachedAccounts?: () => {
    accounts: ApiStorageAccountRef[];
    socialCloudProvider?: string | null;
  } | null;
}

export interface CloudReconnectGateState {
  readiness: 'unknown' | 'ready' | 'linkedInactive' | 'unlinked';
  socialCloudProvider: string | null;
  apiAccounts: ApiStorageAccountRef[];
  promptOpen: boolean;
  panelOpen: boolean;
  checking: boolean;
  error: string | null;
  openPanel: () => void;
  closePanel: () => void;
  dismissPrompt: () => void;
  refresh: () => Promise<void>;
  markReady: () => void;
}

export interface PortableConnectForms {
  aws_s3: {
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    prefix: string;
  };
  azure_blob: {
    accountName: string;
    container: string;
    sasToken: string;
    prefix: string;
  };
  ftp: {
    host: string;
    port: string;
    username: string;
    password: string;
    basePath: string;
    useTls: boolean;
    passiveMode: boolean;
  };
}
