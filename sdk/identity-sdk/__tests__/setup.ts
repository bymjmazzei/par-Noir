import '@testing-library/jest-dom';
import type { SDKConfig } from '../src/types';

jest.mock('@par-noir/oauth-ui', () => ({
  buildOAuthConsentUrl: jest.fn(() => 'https://api.test/oauth'),
  startPnOAuthPopup: jest.fn(),
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
