// Test setup file

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
      generateKey: jest.fn().mockImplementation((algorithm, extractable, keyUsages) => {
        // Generate unique keys for each call
        const keyId = Math.random().toString(36).substring(7);
        return Promise.resolve({
          publicKey: { 
            type: 'public', 
            algorithm: { name: 'ECDSA' },
            keyId: `pub-${keyId}`
          },
          privateKey: { 
            type: 'private', 
            algorithm: { name: 'ECDSA' },
            keyId: `priv-${keyId}`
          }
        });
      }),
      importKey: jest.fn().mockResolvedValue({ type: 'secret', algorithm: { name: 'AES-GCM' } }),
      exportKey: jest.fn().mockImplementation((format, key) => {
        // Return different key data for each call
        const keyData = new Uint8Array(32);
        for (let i = 0; i < keyData.length; i++) {
          keyData[i] = Math.floor(Math.random() * 256);
        }
        return Promise.resolve(keyData.buffer);
      }),
      encrypt: jest.fn().mockImplementation((algorithm, key, data) => {
        // Return encrypted data that can be decrypted
        const encoder = new TextEncoder();
        const input = encoder.encode(typeof data === 'string' ? data : 'test');
        const encrypted = new Uint8Array(input.length + 16); // Add space for tag
        encrypted.set(input, 0);
        // Add a simple "tag" at the end
        for (let i = 0; i < 16; i++) {
          encrypted[input.length + i] = i;
        }
        return Promise.resolve(encrypted.buffer);
      }),
      decrypt: jest.fn().mockImplementation((algorithm, key, data) => {
        // Return the original data for decryption
        const encrypted = new Uint8Array(data);
        const decrypted = encrypted.slice(0, encrypted.length - 16); // Remove tag
        return Promise.resolve(decrypted);
      }),
      sign: jest.fn().mockResolvedValue(new ArrayBuffer(64)),
      verify: jest.fn().mockResolvedValue(true),
      digest: jest.fn().mockImplementation((algorithm, data) => {
        // Return different hash for different data
        const encoder = new TextEncoder();
        const input = encoder.encode(typeof data === 'string' ? data : 'test');
        const hash = new Uint8Array(64);
        // Create a deterministic but different hash for different inputs
        const inputStr = typeof data === 'string' ? data : 'test';
        for (let i = 0; i < hash.length; i++) {
          hash[i] = (inputStr.charCodeAt(i % inputStr.length) + i) % 256;
        }
        return Promise.resolve(hash.buffer);
      }),
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
          result: {
            id: 'test-id',
            username: 'testuser',
            encryptedData: 'encrypted-data',
            security: { checksum: 'test-checksum' }
          }
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
            result: {
              id: 'test-id',
              username: 'testuser',
              encryptedData: 'encrypted-data',
              security: { checksum: 'test-checksum' }
            }
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

// Mock window.crypto for browser environment
Object.defineProperty(global, 'window', {
  value: {
    crypto: global.crypto
  },
  writable: true,
});

// Suppress console warnings in tests
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = jest.fn();
});

afterAll(() => {
  console.warn = originalWarn;
});
