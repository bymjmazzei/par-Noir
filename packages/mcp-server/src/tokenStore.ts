import { AGENT_MCP_CLIENT_ID } from '@par-noir/standard-data-points';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
  scopes: string[];
  /** The API that issued these tokens; refresh and reads go back to it. */
  apiUrl: string;
}

export interface TokenStore {
  load(): Promise<StoredTokens | null>;
  save(tokens: StoredTokens): Promise<void>;
  clear(): Promise<void>;
}

export function parseStoredTokens(raw: string | null | undefined): StoredTokens | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as Partial<StoredTokens>;
    if (
      typeof t.accessToken !== 'string' ||
      typeof t.refreshToken !== 'string' ||
      typeof t.expiresAt !== 'number' ||
      typeof t.apiUrl !== 'string' ||
      !Array.isArray(t.scopes)
    ) {
      return null;
    }
    return {
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      expiresAt: t.expiresAt,
      apiUrl: t.apiUrl,
      scopes: t.scopes.filter((s): s is string => typeof s === 'string'),
    };
  } catch {
    return null;
  }
}

const KEYCHAIN_SERVICE = 'com.parnoir.mcp';

/** macOS Keychain. The native module loads on first use so tests never touch it. */
export class KeychainTokenStore implements TokenStore {
  private async entry() {
    const { Entry } = await import('@napi-rs/keyring');
    return new Entry(KEYCHAIN_SERVICE, AGENT_MCP_CLIENT_ID);
  }

  async load(): Promise<StoredTokens | null> {
    try {
      return parseStoredTokens((await this.entry()).getPassword());
    } catch {
      return null;
    }
  }

  async save(tokens: StoredTokens): Promise<void> {
    (await this.entry()).setPassword(JSON.stringify(tokens));
  }

  async clear(): Promise<void> {
    try {
      (await this.entry()).deletePassword();
    } catch {
      /* already gone */
    }
  }
}

export class MemoryTokenStore implements TokenStore {
  constructor(private tokens: StoredTokens | null = null) {}

  async load() {
    return this.tokens ? { ...this.tokens, scopes: [...this.tokens.scopes] } : null;
  }

  async save(tokens: StoredTokens) {
    this.tokens = { ...tokens };
  }

  async clear() {
    this.tokens = null;
  }
}
