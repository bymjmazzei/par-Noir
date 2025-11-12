import { promises as fs } from 'fs';
import path from 'path';
import { app } from 'electron';
import type { SecureVolumeIdentity } from '../../shared/ipcChannels';

const TOKEN_FILE_NAME = 'secure-volume-tokens.json';

const getTokenFilePath = (): string => {
  return path.join(app.getPath('userData'), TOKEN_FILE_NAME);
};

const buildAccount = ({ pnIdentifier, pnName, publicKey }: SecureVolumeIdentity): string => {
  const identityKey = pnIdentifier?.trim() || pnName?.trim() || publicKey.trim();
  return `pn-secure-volume::${identityKey}`;
};

interface TokenStore {
  [account: string]: string;
}

const loadTokenStore = async (): Promise<TokenStore> => {
  const filePath = getTokenFilePath();
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as TokenStore;
  } catch {
    return {};
  }
};

const saveTokenStore = async (store: TokenStore): Promise<void> => {
  const filePath = getTokenFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), 'utf-8');
};

export const TokenStorageService = {
  async save(identity: SecureVolumeIdentity, authToken: string): Promise<void> {
    if (!authToken || !authToken.trim()) {
      return;
    }
    const store = await loadTokenStore();
    const account = buildAccount(identity);
    store[account] = authToken.trim();
    await saveTokenStore(store);
  },

  async load(identity: SecureVolumeIdentity): Promise<string | null> {
    const store = await loadTokenStore();
    const account = buildAccount(identity);
    return store[account] || null;
  },

  async clear(identity: SecureVolumeIdentity): Promise<void> {
    const store = await loadTokenStore();
    const account = buildAccount(identity);
    delete store[account];
    await saveTokenStore(store);
  }
};

export default TokenStorageService;

