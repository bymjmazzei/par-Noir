import keytar from 'keytar';
import type { SecureVolumeIdentity } from '../../shared/ipcChannels';

const SERVICE_NAME = 'com.parnoir.secure-volume';

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
  }
};

export default KeychainService;
