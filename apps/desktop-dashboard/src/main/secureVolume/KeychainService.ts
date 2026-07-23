import keytar from 'keytar';
import type { SecureVolumeIdentity } from '../../shared/ipcChannels';

const SERVICE_NAME = 'com.parnoir.secure-volume';
const CLOUD_CREDS_SERVICE = 'com.parnoir.device-cloud-credentials';

const buildAccount = ({ pnIdentifier, pnName, publicKey }: SecureVolumeIdentity): string => {
  const identityKey = pnIdentifier?.trim() || pnName?.trim() || publicKey.trim();
  return `pn-secure-volume::${identityKey}`;
};

export const KeychainService = {
  async save(identity: SecureVolumeIdentity, authToken: string): Promise<void> {
    if (!authToken || !authToken.trim()) {
      return;
    }
    await keytar.setPassword(SERVICE_NAME, buildAccount(identity), authToken);
  },

  async load(identity: SecureVolumeIdentity): Promise<string | null> {
    return keytar.getPassword(SERVICE_NAME, buildAccount(identity));
  },

  async clear(identity: SecureVolumeIdentity): Promise<void> {
    await keytar.deletePassword(SERVICE_NAME, buildAccount(identity));
  },

  /** Persist sealed cloud credential envelope across desktop sessions (device custody). */
  async saveCloudCredentials(identityId: string, sealedJson: string): Promise<void> {
    if (!identityId || !sealedJson) return;
    await keytar.setPassword(CLOUD_CREDS_SERVICE, identityId, sealedJson);
  },

  async loadCloudCredentials(identityId: string): Promise<string | null> {
    if (!identityId) return null;
    return keytar.getPassword(CLOUD_CREDS_SERVICE, identityId);
  },

  async clearCloudCredentials(identityId: string): Promise<void> {
    if (!identityId) return;
    await keytar.deletePassword(CLOUD_CREDS_SERVICE, identityId);
  }
};

export default KeychainService;
