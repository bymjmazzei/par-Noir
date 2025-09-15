// Export all modular App components
export { useAppState } from './AppStateManager';
export { useIdentityManagement } from './IdentityManagement';
export { useExportTransferManager } from './ExportTransferManager';
export { useRecoveryCustodianManager } from './RecoveryCustodianManager';
export { usePerformanceMonitoring } from './PerformanceMonitor';
export { AppMain } from './AppMain';

// Re-export types
export type {
  DIDInfo,
  RecoveryCustodian,
  RecoveryRequest,
  RecoveryKey,
  SyncedDevice,
  CustodianInvitationForm,
  DeviceSyncData,
  ExportAuthData,
  TransferSetupData,
  RecoveryData,
  CustodianInvitationData,
  DeepLinkData,
  OfflineSyncStatus,
  PWAState,
  PWAHandlers,
  IdentityData,
  AuthSession
} from '../types/app';
