import keytar from 'keytar';
import type { SecureVolumeIdentity } from '../../shared/ipcChannels';

const SERVICE_NAME = 'com.parnoir.secure-volume';

const buildAccount = ({ authToken, pnName, publicKey }: SecureVolumeIdentity): string => {
  const base = authToken?.trim() || pnName?.trim() || publicKey.trim();
  return `pn-secure-volume::${base}`;
};

export const KeychainService = {
  async save(identity: SecureVolumeIdentity, passcode: string): Promise<void> {
    if (!passcode || !passcode.trim()) {
      return;
    }
    await keytar.setPassword(SERVICE_NAME, buildAccount(identity), passcode);
  },

  async load(identity: SecureVolumeIdentity): Promise<string | null> {
    return keytar.getPassword(SERVICE_NAME, buildAccount(identity));
  },

  async clear(identity: SecureVolumeIdentity): Promise<void> {
    await keytar.deletePassword(SERVICE_NAME, buildAccount(identity));
  }
};

export default KeychainService;
