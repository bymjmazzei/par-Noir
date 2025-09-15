// DID Document Validator - Handles DID document structure and content validation
import { DIDDocument } from '../../types';
import { DIDValidationResult } from '../types/didResolver';

export class DIDDocumentValidator {
  /**
   * Validate DID document structure and content
   */
  static validateDIDDocument(didDoc: DIDDocument): DIDValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check required fields
      if (!didDoc.id) {
        errors.push('Missing DID identifier');
      }

      if (!didDoc.verificationMethod || !Array.isArray(didDoc.verificationMethod)) {
        errors.push('Missing or invalid verification methods');
      }

      if (!didDoc.authentication || !Array.isArray(didDoc.authentication)) {
        errors.push('Missing or invalid authentication methods');
      }

      // Validate verification methods
      if (didDoc.verificationMethod) {
        for (const vm of didDoc.verificationMethod) {
          if (!vm.id || !vm.type || !vm.controller) {
            errors.push('Invalid verification method structure');
            break;
          }
        }
      }

      // Check for suspicious patterns
      if (didDoc.service) {
        for (const service of didDoc.service) {
          if (service.serviceEndpoint && typeof service.serviceEndpoint === 'string') {
            // Check for suspicious URLs
            if (service.serviceEndpoint.includes('javascript:') || 
                service.serviceEndpoint.includes('data:') ||
                service.serviceEndpoint.includes('vbscript:')) {
              errors.push('Suspicious service endpoint detected');
            }
          }
        }
      }

      // Check for reasonable size limits
      const docSize = JSON.stringify(didDoc).length;
      if (docSize > 10000) { // 10KB limit
        warnings.push('DID document size exceeds recommended limit');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };

    } catch (error) {
      return {
        isValid: false,
        errors: ['Failed to validate DID document structure'],
        warnings: []
      };
    }
  }
}
