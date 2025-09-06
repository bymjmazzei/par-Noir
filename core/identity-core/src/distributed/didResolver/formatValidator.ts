// Format Validator - Handles various format validation methods for DID resolution
import { DIDValidator } from '../../utils/didValidator';

export class FormatValidator {
  /**
   * Validate DID format using standardized validator
   */
  static isValidDIDFormat(did: string): boolean {
    const validation = DIDValidator.validateDID(did);
    return validation.isValid;
  }

  /**
   * Validate CID format using standardized validator
   */
  static isValidCIDFormat(cid: string): boolean {
    return DIDValidator.validateCID(cid);
  }

  /**
   * Validate domain format using standardized validator
   */
  static isValidDomainFormat(domain: string): boolean {
    return DIDValidator.validateDomain(domain);
  }

  /**
   * Validate public key format using standardized validator
   */
  static isValidPublicKeyFormat(key: string): boolean {
    // Use the standardized public key validation
    const validation = DIDValidator.validateDID(`did:key:${key}`);
    return validation.isValid;
  }

  /**
   * Validate ION format using standardized validator
   */
  static isValidIONFormat(suffix: string): boolean {
    const validation = DIDValidator.validateDID(`did:ion:${suffix}`);
    return validation.isValid;
  }
}
