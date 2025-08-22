// Test setup for dashboard
import '@testing-library/jest-dom';

// Mock crypto API for tests
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: jest.fn((arr) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    }),
    subtle: {
      generateKey: jest.fn().mockResolvedValue({
        publicKey: { type: 'public', algorithm: { name: 'ECDSA' } },
        privateKey: { type: 'private', algorithm: { name: 'ECDSA' } }
      }),
      importKey: jest.fn().mockResolvedValue({ type: 'secret', algorithm: { name: 'AES-GCM' } }),
      exportKey: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
      encrypt: jest.fn().mockResolvedValue(new ArrayBuffer(64)),
      decrypt: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
      sign: jest.fn().mockResolvedValue(new ArrayBuffer(64)),
      verify: jest.fn().mockResolvedValue(true),
      digest: jest.fn().mockResolvedValue(new ArrayBuffer(64)),
      deriveKey: jest.fn().mockResolvedValue({ type: 'secret', algorithm: { name: 'AES-GCM' } }),
      deriveBits: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
    },
  },
  writable: true,
});

// Mock IndexedDB
const mockIndexedDB = {
  open: jest.fn().mockReturnValue({
    onerror: null,
    onsuccess: null,
    onupgradeneeded: null,
    result: {
      objectStoreNames: ['dids'],
      createObjectStore: jest.fn().mockReturnValue({
        createIndex: jest.fn(),
        put: jest.fn().mockReturnValue({
          onsuccess: null,
          onerror: null,
          result: 'test-id'
        }),
        get: jest.fn().mockReturnValue({
          onsuccess: null,
          onerror: null,
          result: null
        }),
        delete: jest.fn().mockReturnValue({
          onsuccess: null,
          onerror: null
        }),
        getAll: jest.fn().mockReturnValue({
          onsuccess: null,
          onerror: null,
          result: []
        })
      }),
      transaction: jest.fn().mockReturnValue({
        objectStore: jest.fn().mockReturnValue({
          put: jest.fn().mockReturnValue({
            onsuccess: null,
            onerror: null
          }),
          get: jest.fn().mockReturnValue({
            onsuccess: null,
            onerror: null,
            result: null
          }),
          delete: jest.fn().mockReturnValue({
            onsuccess: null,
            onerror: null
          }),
          getAll: jest.fn().mockReturnValue({
            onsuccess: null,
            onerror: null,
            result: []
          })
        })
      })
    }
  })
};

Object.defineProperty(global, 'indexedDB', {
  value: mockIndexedDB,
  writable: true,
});

// Mock window.crypto for browser environment (only if window doesn't exist)
if (typeof window === 'undefined') {
  Object.defineProperty(global, 'window', {
    value: {
      crypto: global.crypto
    },
    writable: true,
  });
}

// Suppress console warnings in tests
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = jest.fn();
});

afterAll(() => {
  console.warn = originalWarn;
});
