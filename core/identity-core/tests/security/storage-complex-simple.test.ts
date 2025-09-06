import { DIDDocumentManager } from '../../src/distributed/distributedIdentityManager/didDocumentManager';
import { StorageManager } from '../../src/distributed/decentralizedAuth/storageManager';
import { DIDDocument } from '../../src/distributed/distributedIdentityManager/types/distributedIdentityManager';
import { AuthSession } from '../../src/distributed/types/decentralizedAuth';

describe('Complex Storage Tests (Simplified)', () => {
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
});
