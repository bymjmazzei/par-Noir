// DID Method Resolvers - Handles specific DID method resolution
import { DIDDocument } from '../../types';
import { DIDResolutionResult } from '../types/didResolver';
import { FormatValidator } from './formatValidator';

export class DIDMethodResolvers {
  /**
   * Resolve did:key DIDs with enhanced validation
   */
  static async resolveDidKey(did: string): Promise<DIDResolutionResult | null> {
    const keyMatch = did.match(/did:key:(.+)/);
    if (!keyMatch) return null;

    const publicKey = keyMatch[1];
    
    // Validate public key format
    if (!FormatValidator.isValidPublicKeyFormat(publicKey)) {
      throw new Error('Invalid public key format in did:key');
    }
    
    // did:key is self-contained, we can derive the DID document
    const didDoc: DIDDocument = {
      id: did,
      verificationMethod: [{
        id: `${did}#key-1`,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase: publicKey
      }],
      authentication: [`${did}#key-1`],
      assertionMethod: [`${did}#key-1`],
      capabilityInvocation: [`${did}#key-1`],
      capabilityDelegation: [`${did}#key-1`]
    };

    return {
      didDocument: didDoc,
      metadata: {
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      }
    };
  }

  /**
   * Resolve did:web DIDs with enhanced security
   */
  static async resolveDidWeb(did: string): Promise<DIDResolutionResult | null> {
    // This is handled by the web resolution source
    return null;
  }

  /**
   * Resolve did:ion DIDs with enhanced security
   */
  static async resolveDidIon(did: string): Promise<DIDResolutionResult | null> {
    try {
      // ION DIDs are resolved through the ION network
      const ionMatch = did.match(/did:ion:(.+)/);
      if (!ionMatch) return null;

      const suffix = ionMatch[1];
      
      // Validate ION suffix format
      if (!FormatValidator.isValidIONFormat(suffix)) {
        throw new Error('Invalid ION DID format');
      }

      const response = await fetch(`https://ion.tbd.engineering/identifiers/${did}`, {
        headers: {
          'Accept': 'application/did+json, application/json'
        }
      });
      
      if (!response.ok) return null;

      const result = await response.json();
      
      // Validate ION result
      if (!result.didDocument || !FormatValidator.isValidDIDFormat(result.didDocument.id)) {
        throw new Error('Invalid ION DID document');
      }

      return {
        didDocument: result.didDocument,
        metadata: result.metadata
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Resolve DID from blockchain with enhanced security
   */
  static async resolveFromBlockchain(did: string): Promise<DIDResolutionResult | null> {
    try {
      // Support for different blockchain DID methods
      const methods = [
        () => this.resolveDidKey(did),
        () => this.resolveDidWeb(did),
        () => this.resolveDidIon(did)
      ];

      for (const method of methods) {
        try {
          const result = await method();
          if (result) {
            return result;
          }
        } catch (error) {
          // Blockchain resolution failed, continue to next
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }
}
