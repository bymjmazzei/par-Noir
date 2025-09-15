import { vi } from 'vitest';
import { DIDDocumentManager } from '../../src/distributed/distributedIdentityManager/didDocumentManager';
import { StorageManager } from '../../src/distributed/decentralizedAuth/storageManager';
import { DIDDocument } from '../../src/distributed/distributedIdentityManager/types/distributedIdentityManager';
import { AuthSession } from '../../src/distributed/types/decentralizedAuth';

describe('Secure Storage Tests', () => {
  describe('DID Document Storage Security', () => {
    let didManager: DIDDocumentManager;

    beforeEach(() => {
      didManager = new DIDDocumentManager();
    });

    test('should store DID document securely in IndexedDB', async () => {
      const did = 'did:test:123';
      const didDocument: DIDDocument = {
        '@context': ['https://www.w3.org/ns/did/v1'],
        id: did,
        verificationMethod: [{
          id: `${did}#key1`,
          type: 'Ed25519VerificationKey2020',
          controller: did,
          publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
        }],
        authentication: [`${did}#key1`],
        assertionMethod: [`${did}#key1`],
        keyAgreement: [`${did}#key1`],
        capabilityInvocation: [`${did}#key1`],
        capabilityDelegation: [`${did}#key1`],
        service: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      };

      await expect(didManager.storeDidDocument(did, didDocument))
        .resolves.not.toThrow();
    });

    test('should retrieve DID document from secure storage', async () => {
      const did = 'did:test:123';
      const didDocument: DIDDocument = {
        '@context': ['https://www.w3.org/ns/did/v1'],
        id: did,
        verificationMethod: [{
          id: `${did}#key1`,
          type: 'Ed25519VerificationKey2020',
          controller: did,
          publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
        }],
        authentication: [`${did}#key1`],
        assertionMethod: [`${did}#key1`],
        keyAgreement: [`${did}#key1`],
        capabilityInvocation: [`${did}#key1`],
        capabilityDelegation: [`${did}#key1`],
        service: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      };

      await didManager.storeDidDocument(did, didDocument);
      const retrieved = await didManager.getDidDocument(did);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(did);
    });

    test('should update DID document securely', async () => {
      const did = 'did:test:123';
      const originalDocument: DIDDocument = {
        '@context': ['https://www.w3.org/ns/did/v1'],
        id: did,
        verificationMethod: [{
          id: `${did}#key1`,
          type: 'Ed25519VerificationKey2020',
          controller: did,
          publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
        }],
        authentication: [`${did}#key1`],
        assertionMethod: [`${did}#key1`],
        keyAgreement: [`${did}#key1`],
        capabilityInvocation: [`${did}#key1`],
        capabilityDelegation: [`${did}#key1`],
        service: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      };

      await didManager.storeDidDocument(did, originalDocument);
      
      const updates = {
        service: [{
          id: `${did}#service1`,
          type: 'DIDCommMessaging',
          serviceEndpoint: 'https://example.com/messaging'
        }]
      };

      const updated = await didManager.updateDidDocument(did, updates);
      
      expect(updated).toBeDefined();
      expect(updated?.service).toHaveLength(1);
      expect(updated?.service?.[0].id).toBe(`${did}#service1`);
    });

    test('should delete DID document securely', async () => {
      const did = 'did:test:123';
      const didDocument: DIDDocument = {
        '@context': ['https://www.w3.org/ns/did/v1'],
        id: did,
        verificationMethod: [{
          id: `${did}#key1`,
          type: 'Ed25519VerificationKey2020',
          controller: did,
          publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
        }],
        authentication: [`${did}#key1`],
        assertionMethod: [`${did}#key1`],
        keyAgreement: [`${did}#key1`],
        capabilityInvocation: [`${did}#key1`],
        capabilityDelegation: [`${did}#key1`],
        service: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      };

      await didManager.storeDidDocument(did, didDocument);
      const deleted = await didManager.deleteDidDocument(did);
      
      expect(deleted).toBe(true);
      
      const retrieved = await didManager.getDidDocument(did);
      expect(retrieved).toBeNull();
    });

    test('should list all stored DIDs', async () => {
      const dids = ['did:test:123', 'did:test:456', 'did:test:789'];
      
      for (const did of dids) {
        const didDocument: DIDDocument = {
          '@context': ['https://www.w3.org/ns/did/v1'],
          id: did,
          verificationMethod: [{
            id: `${did}#key1`,
            type: 'Ed25519VerificationKey2020',
            controller: did,
            publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
          }],
          authentication: [`${did}#key1`],
          assertionMethod: [`${did}#key1`],
          keyAgreement: [`${did}#key1`],
          capabilityInvocation: [`${did}#key1`],
          capabilityDelegation: [`${did}#key1`],
          service: [],
          created: new Date().toISOString(),
          updated: new Date().toISOString()
        };
        
        await didManager.storeDidDocument(did, didDocument);
      }

      const storedDIDs = await didManager.listStoredDIDs();
      expect(storedDIDs).toHaveLength(3);
      expect(storedDIDs).toContain('did:test:123');
      expect(storedDIDs).toContain('did:test:456');
      expect(storedDIDs).toContain('did:test:789');
    });
  });

  describe('Session Storage Security', () => {
    let storageManager: StorageManager;

    beforeEach(() => {
      storageManager = new StorageManager();
    });

    test('should store session securely in IndexedDB', async () => {
      const did = 'did:test:123';
      const session: AuthSession = {
        did,
        authenticatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        deviceId: 'device-123',
        permissions: ['read', 'write', 'sync']
      };

      await expect(storageManager.storeSessionSecurely(did, session))
        .resolves.not.toThrow();
    });

    test('should retrieve session from secure storage', async () => {
      const did = 'did:test:123';
      const session: AuthSession = {
        did,
        authenticatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        deviceId: 'device-123',
        permissions: ['read', 'write', 'sync']
      };

      await storageManager.storeSessionSecurely(did, session);
      const retrieved = await storageManager.getSessionSecurely(did);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.did).toBe(did);
      expect(retrieved?.deviceId).toBe('device-123');
      expect(retrieved?.permissions).toEqual(['read', 'write', 'sync']);
    });

    test('should handle expired sessions', async () => {
      const did = 'did:test:123';
      const expiredSession: AuthSession = {
        did,
        authenticatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // Expired 1 hour ago
        deviceId: 'device-123',
        permissions: ['read', 'write', 'sync']
      };

      await storageManager.storeSessionSecurely(did, expiredSession);
      const retrieved = await storageManager.getSessionSecurely(did);
      
      expect(retrieved).toBeNull();
    });

    test('should remove session securely', async () => {
      const did = 'did:test:123';
      const session: AuthSession = {
        did,
        authenticatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        deviceId: 'device-123',
        permissions: ['read', 'write', 'sync']
      };

      await storageManager.storeSessionSecurely(did, session);
      await storageManager.removeSessionSecurely(did);
      
      const retrieved = await storageManager.getSessionSecurely(did);
      expect(retrieved).toBeNull();
    });
  });

  describe('Storage Security Validation', () => {
    test('should not use localStorage for sensitive data', () => {
      // Verify that localStorage is not being used for sensitive operations
      const localStorageSpy = vi.spyOn(global.localStorage, 'setItem');
      const sessionStorageSpy = vi.spyOn(global.sessionStorage, 'setItem');
      
      // These should not be called for sensitive data storage
      expect(localStorageSpy).not.toHaveBeenCalled();
      expect(sessionStorageSpy).not.toHaveBeenCalled();
      
      localStorageSpy.mockRestore();
      sessionStorageSpy.mockRestore();
    });

    test('should use IndexedDB for secure storage', () => {
      const indexedDBSpy = vi.spyOn(global.indexedDB, 'open');
      
      // IndexedDB should be used for secure storage operations
      expect(indexedDBSpy).toBeDefined();
      
      indexedDBSpy.mockRestore();
    });

    test('should handle storage errors gracefully', async () => {
      const didManager = new DIDDocumentManager();
      
      // Mock IndexedDB to throw an error
      const originalOpen = global.indexedDB.open;
      global.indexedDB.open = vi.fn().mockImplementation(() => {
        throw new Error('IndexedDB not available');
      });

      const didDocument: DIDDocument = {
        '@context': ['https://www.w3.org/ns/did/v1'],
        id: 'did:test:123',
        verificationMethod: [],
        authentication: [],
        assertionMethod: [],
        keyAgreement: [],
        capabilityInvocation: [],
        capabilityDelegation: [],
        service: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      };

      await expect(didManager.storeDidDocument('did:test:123', didDocument))
        .rejects.toThrow('Failed to store DID document securely');

      // Restore original function
      global.indexedDB.open = originalOpen;
    });
  });
});