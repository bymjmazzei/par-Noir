import { VolumeIdGenerator } from '../utils/crypto/volumeIdGenerator';

/**
 * Returns the credential-bound volume id (pnName:passcode:publicKey).
 * Automatic legacy→canonical API migration is disabled: OAuth, Drive folders, and storage
 * all use this id; migrating the credentials row breaks owner-index and device registry lookups.
 */
export async function maybeMigrateVolumeId(params: {
  publicKey: string;
  pnName: string;
  passcode: string;
  authToken?: string | null;
  driveFolderId?: string;
}): Promise<string> {
  return VolumeIdGenerator.generateVolumeId({
    pnName: params.pnName,
    passcode: params.passcode,
    publicKey: params.publicKey,
  });
}
