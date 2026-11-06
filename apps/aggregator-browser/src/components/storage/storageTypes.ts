/**
 * Types for FileStorageAggregator and storage components.
 */

export interface DriveAccount {
  provider: string;
  accountId: string;
  email?: string;
  displayName?: string;
}
