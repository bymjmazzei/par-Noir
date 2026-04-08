import '@testing-library/jest-dom';
import type { SDKConfig } from '../src/types';

jest.mock('@par-noir/oauth-ui', () => ({
  buildOAuthConsentUrl: jest.fn(() => 'https://api.test/oauth'),
  startPnOAuthPopup: jest.fn(),
}));

/** Avoid loading @noble/post-quantum ESM in JSDOM; unit tests assert wiring only. */
const mockV1Envelope = (s: string) =>
  typeof s === 'string' && s.length > 40
    ? {
        format_version: 1,
        zk_proof_version: 1,
        zk_proof_type: 'modp_fs_nizk_ml_dsa_binding_v1',
        hash_policy: 'SHA3-384',
        context: 'c',
        nonce: 'n',
        expires_at_ms: Date.now() + 60_000,
        public_inputs: {},
        sigma: {
          group: 'rfc5114_modp_1024_160',
          y_hex: '1',
          t_hex: '1',
          s_hex: '1',
          challenge_hex: '1',
        },
        ml_dsa_public_key_b64: 'a',
        ml_dsa_signature_b64: 'b',
      }
    : null;

jest.mock('@par-noir/zk-protocol-v1', () => ({
  verifyZkProofEnvelopeV1: jest.fn((s: string) =>
    typeof s === 'string' && s.length > 40 ? { ok: true } : { ok: false, reason: 'mock' }
  ),
  decodeEnvelopeFromProofString: jest.fn((s: string) => mockV1Envelope(s)),
  isZkProofEnvelopeV1: jest.fn((env: unknown) => !!(env && (env as { format_version?: number }).format_version === 1)),
  ageBucketMeetsMinimum: jest.fn(() => false),
  generateZkProofEnvelopeV1: jest.fn(() => {
    throw new Error('use id-dashboard for proof generation');
  }),
  ZK_PROOF_TYPE_V1: 'modp_fs_nizk_ml_dsa_binding_v1',
}));

jest.mock('@par-noir/zk-protocol-v2', () => ({
  verifyZkProofEnvelopeV2: jest.fn(() => ({ ok: false, reason: 'mock' })),
  isZkProofEnvelopeV2: jest.fn(() => false),
  generateZkProofEnvelopeV2: jest.fn(() => {
    throw new Error('use id-dashboard for proof generation');
  }),
  ZK_PROOF_TYPE_V2: 'stark_genstark_sha256_ml_dsa_binding_v2',
}));

// Mock crypto worker manager
jest.mock('@identity-protocol/identity-core/src/encryption/cryptoWorkerManager', () => ({
  cryptoWorkerManager: {
    isHealthy: jest.fn(() => true),
    encrypt: jest.fn(),
    decrypt: jest.fn(),
    generateKey: jest.fn(),
    sign: jest.fn(),
    verify: jest.fn(),
    hash: jest.fn(),
    generateRandom: jest.fn((arr) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    })
  }
}));

// Mock standard data points - removed due to path issues

// Mock Web Crypto API
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      generateKey: jest.fn(),
      importKey: jest.fn(),
      exportKey: jest.fn(),
      encrypt: jest.fn(),
      decrypt: jest.fn(),
      sign: jest.fn(),
      verify: jest.fn(),
      digest: jest.fn(),
      deriveBits: jest.fn()
    },
    getRandomValues: jest.fn((arr) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    })
  }
});

// Mock IndexedDB
const mockIndexedDB = {
  open: jest.fn(() => ({
    result: {
      createObjectStore: jest.fn(),
      transaction: jest.fn(() => ({
        objectStore: jest.fn(() => ({
          add: jest.fn(),
          get: jest.fn(),
          put: jest.fn(),
          delete: jest.fn(),
          clear: jest.fn()
        }))
      }))
    },
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null
  }))
};

Object.defineProperty(global, 'indexedDB', {
  value: mockIndexedDB
});

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn()
};

Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage
});

// Mock sessionStorage
const mockSessionStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn()
};

Object.defineProperty(global, 'sessionStorage', {
  value: mockSessionStorage
});

// Mock window (only if not already defined)
if (!global.window) {
  Object.defineProperty(global, 'window', {
    value: {
      dispatchEvent: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      CustomEvent: jest.fn()
    }
  });
}

// Mock process.env
process.env.NODE_ENV = 'test';

/** Shared mock OAuth configuration for unit tests (also assigned to `global` below). */
export function createMockSDKConfig(): SDKConfig {
  return {
    identityProvider: {
      name: 'Test Provider',
      type: 'oauth2',
      config: {
        name: 'Test Provider',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: 'http://localhost:3000/callback',
        scopes: ['openid', 'profile', 'email'],
        endpoints: {
          authorization: 'https://test.com/oauth/authorize',
          token: 'https://test.com/oauth/token',
          userInfo: 'https://test.com/oauth/userinfo',
          revocation: 'https://test.com/oauth/revoke',
        },
      },
      metadata: {
        logo: 'https://test.com/logo.png',
        description: 'Test identity provider',
      },
    },
    storage: 'memory',
    autoRefresh: true,
    debug: false,
  };
}

export function createMockSession() {
  return {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresAt: Date.now() + 3600000,
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
    },
  };
}

// Global test utilities (legacy tests rely on globals)
(globalThis as unknown as { createMockSDKConfig: typeof createMockSDKConfig }).createMockSDKConfig =
  createMockSDKConfig;
(globalThis as unknown as { createMockSession: typeof createMockSession }).createMockSession =
  createMockSession;

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
