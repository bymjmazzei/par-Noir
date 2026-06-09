import { VolumeIdGenerator } from '../utils/crypto/volumeIdGenerator';
import { migrateVolumeId } from '../services/recoveryApiService';

/**
 * When legacy passcode-based pn id differs from canonical publicKey id, migrate API storage row.
 */
export async function maybeMigrateVolumeId(params: {
  publicKey: string;
  pnName: string;
  passcode: string;
  authToken: string | null;
  driveFolderId?: string;
}): Promise<string> {
  const canonical = await VolumeIdGenerator.generateCanonicalVolumeId(params.publicKey);
  const legacy = await VolumeIdGenerator.generateVolumeId({
    pnName: params.pnName,
    passcode: params.passcode,
    publicKey: params.publicKey
  });
  if (legacy === canonical || !params.authToken) {
    return canonical;
  }
  try {
    await migrateVolumeId(params.authToken, {
      legacyPnIdentifier: legacy,
      canonicalPnIdentifier: canonical,
      publicKey: params.publicKey,
      driveFolderId: params.driveFolderId
    });
  } catch {
    /* non-blocking */
  }
  return canonical;
}
