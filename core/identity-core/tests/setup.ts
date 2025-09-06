// Test setup file
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Add TextEncoder and TextDecoder support for Node.js environment
import { TextEncoder, TextDecoder } from 'util';

// Make TextEncoder and TextDecoder available globally
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Also make them available on window for browser-like environment
if (typeof global.window !== 'undefined') {
  global.window.TextEncoder = TextEncoder;
  global.window.TextDecoder = TextDecoder;
}

// Ensure they're available in the global scope
Object.defineProperty(global, 'TextEncoder', {
  value: TextEncoder,
  writable: true,
  configurable: true
});

Object.defineProperty(global, 'TextDecoder', {
  value: TextDecoder,
  writable: true,
  configurable: true
});

// Mock crypto for testing
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: vi.fn((arr) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    }),
    subtle: {
      digest: vi.fn(async (algorithm, data) => {
        // Simple mock hash function
        const encoder = new TextEncoder();
        const dataStr = encoder.encode(data.toString());
        const hash = new ArrayBuffer(32);
        const view = new Uint8Array(hash);
        for (let i = 0; i < dataStr.length && i < 32; i++) {
          view[i] = dataStr[i] ^ (i + 1);
        }
        return hash;
      }),
      generateKey: vi.fn(async () => ({
        publicKey: new ArrayBuffer(32),
        privateKey: new ArrayBuffer(32)
      })),
      importKey: vi.fn(async () => new ArrayBuffer(32)),
      exportKey: vi.fn(async () => new ArrayBuffer(32)),
      encrypt: vi.fn(async () => new ArrayBuffer(64)),
      decrypt: vi.fn(async () => new ArrayBuffer(32)),
      sign: vi.fn(async () => new ArrayBuffer(64)),
      verify: vi.fn(async () => true),
      deriveKey: vi.fn(async () => new ArrayBuffer(32))
    }
  }
});

// Mock IndexedDB with persistent storage simulation
const mockIndexedDB = (() => {
  let stores: { [storeName: string]: { [key: string]: any } } = {};
  
  return {
    open: vi.fn(() => {
      const request = {
        onupgradeneeded: null as any,
        onsuccess: null as any,
        onerror: null as any,
        result: {
          createObjectStore: vi.fn((storeName: string) => {
            if (!stores[storeName]) {
              stores[storeName] = {};
            }
          }),
          transaction: vi.fn((storeNames: string[]) => ({
            objectStore: vi.fn((storeName: string) => ({
              put: vi.fn((data) => {
                const request = {
                  onsuccess: null as any,
                  onerror: null as any,
                  result: data
                };
                // Store the data
                if (!stores[storeName]) {
                  stores[storeName] = {};
                }
                // Use did as the key if available, otherwise use id
                const key = data.did || data.id;
                stores[storeName][key] = data;
                // Simulate async success
                setTimeout(() => {
                  if (request.onsuccess) request.onsuccess({ target: { result: data } });
                }, 10);
                return request;
              }),
              get: vi.fn((key) => {
                const request = {
                  onsuccess: null as any,
                  onerror: null as any,
                  result: null as any
                };
                // Simulate async success with stored data
                setTimeout(() => {
                  if (request.onsuccess) {
                    request.result = stores[storeName]?.[key] || null;
                    request.onsuccess({ target: { result: request.result } });
                  }
                }, 10);
                return request;
              }),
              delete: vi.fn((key) => {
                const request = {
                  onsuccess: null as any,
                  onerror: null as any
                };
                // Delete the data
                if (stores[storeName]) {
                  delete stores[storeName][key];
                }
                // Simulate async success
                setTimeout(() => {
                  if (request.onsuccess) request.onsuccess({ target: {} });
                }, 10);
                return request;
              }),
              getAll: vi.fn(() => {
                const request = {
                  onsuccess: null as any,
                  onerror: null as any,
                  result: [] as any[]
                };
                // Simulate async success with all stored data
                setTimeout(() => {
                  if (request.onsuccess) {
                    request.result = Object.values(stores[storeName] || {});
                    request.onsuccess({ target: { result: request.result } });
                  }
                }, 10);
                return request;
              })
            }))
          }))
        }
      };
      // Simulate async success
      setTimeout(() => {
        if (request.onsuccess) request.onsuccess({ target: { result: request.result } });
      }, 10);
      return request;
    })
  };
})();

Object.defineProperty(global, 'indexedDB', {
  value: mockIndexedDB
});

// Mock localStorage with actual storage simulation
const mockLocalStorage = (() => {
  let store: { [key: string]: string } = {};
  
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null)
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage
});

// Mock sessionStorage with actual storage simulation
const mockSessionStorage = (() => {
  let store: { [key: string]: string } = {};
  
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null)
  };
})();

Object.defineProperty(global, 'sessionStorage', {
  value: mockSessionStorage
});

// Mock navigator
Object.defineProperty(global, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (Test Browser)',
    language: 'en-US'
  }
});

// Mock screen
Object.defineProperty(global, 'screen', {
  value: {
    width: 1920,
    height: 1080
  }
});

// Mock window (only if not already defined)
if (typeof global.window === 'undefined') {
  Object.defineProperty(global, 'window', {
    value: {
      crypto: global.crypto,
      indexedDB: global.indexedDB,
      localStorage: global.localStorage,
      sessionStorage: global.sessionStorage
    },
    writable: true
  });
}

