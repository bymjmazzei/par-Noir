import type { SecureVolumeIdentity } from '../../shared/ipcChannels';
import { KeychainService } from './KeychainService';

export const TokenStorageService = {
  async save(identity: SecureVolumeIdentity, authToken: string): Promise<void> {
    await KeychainService.save(identity, authToken);
  },

  async load(identity: SecureVolumeIdentity): Promise<string | null> {
    return KeychainService.load(identity);
  },

  async clear(identity: SecureVolumeIdentity): Promise<void> {
    await KeychainService.clear(identity);
  }
};

export default TokenStorageService;

