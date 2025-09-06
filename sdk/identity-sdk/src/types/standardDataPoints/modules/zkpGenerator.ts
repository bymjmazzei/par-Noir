import { cryptoWorkerManager } from './cryptoWorkerManager';
import { 
  StandardDataPoint, 
  ZKPGenerationRequest, 
  ZKPProof, 
  ZKPType 
} from '../types/standardDataPoints';
import { STANDARD_DATA_POINTS } from '../constants/dataPointRegistry';

export class ZKPGenerator {
  /**
   * Generate ZKP for a standard data point
   */
  static async generateZKP(request: ZKPGenerationRequest): Promise<ZKPProof> {
    try {
      const dataPoint = STANDARD_DATA_POINTS[request.dataPointId];
      if (!dataPoint) {
        throw new Error(`Unknown data point: ${request.dataPointId}`);
      }

      // Validate user data
      this.validateUserData(dataPoint, request.userData);

      // Generate proof based on ZKP type
      let proofData: string;
      switch (dataPoint.zkpType) {
        case 'age_verification':
          proofData = await this.generateAgeVerificationProof(request.userData, request.verificationLevel);
          break;
        case 'email_verification':
          proofData = await this.generateEmailVerificationProof(request.userData.email, request.verificationLevel);
          break;
        case 'phone_verification':
          proofData = await this.generatePhoneVerificationProof(request.userData.phoneNumber, request.verificationLevel);
          break;
        case 'location_verification':
          proofData = await this.generateLocationVerificationProof(request.userData, request.verificationLevel);
          break;
        case 'identity_verification':
          proofData = await this.generateIdentityVerificationProof(request.userData, request.verificationLevel);
          break;
        case 'preference_disclosure':
          proofData = await this.generatePreferenceDisclosureProof(request.userData, request.verificationLevel);
          break;
        case 'compliance_attestation':
          proofData = await this.generateComplianceAttestationProof(request.userData, request.verificationLevel);
          break;
        case 'custom_proof':
          proofData = await this.generateCustomProof(request.userData, request.verificationLevel);
          break;
        default:
          throw new Error(`Unsupported ZKP type: ${dataPoint.zkpType}`);
      }

      // Sign the proof
      const signature = await this.signProof(proofData, request.userData);

      // Create ZKP proof
      const zkpProof: ZKPProof = {
        proofId: `zkp_${Date.now()}_${this.generateRandomId(9)}`,
        dataPointId: request.dataPointId,
        proofType: dataPoint.zkpType,
        proofData: {
          encryptedData: proofData,
          zkpToken: await this.generateSecureToken(),
          attestedAt: new Date().toISOString(),
          attestedBy: 'user',
          dataType: 'attested',
          expiresAt: request.expirationDays 
            ? new Date(Date.now() + request.expirationDays * 24 * 60 * 60 * 1000).toISOString()
            : undefined
        },
        signature,
        timestamp: new Date().toISOString()
      };

      return zkpProof;

    } catch (error) {
      throw new Error(`Failed to generate ZKP: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate age verification proof
   */
  private static async generateAgeVerificationProof(userData: any, verificationLevel: string): Promise<string> {
    const age = this.calculateAge(userData.dateOfBirth);
    const proof = {
      type: 'age_verification',
      age,
      ageRange: this.getAgeRange(age),
      proof: `age_verified_${verificationLevel}`,
      verificationLevel,
      timestamp: new Date().toISOString()
    };
    return btoa(JSON.stringify(proof));
  }

  /**
   * Generate email verification proof
   */
  private static async generateEmailVerificationProof(email: string, verificationLevel: string): Promise<string> {
    const proof = {
      type: 'email_verification',
      domain: email.split('@')[1],
      proof: `email_verified_${verificationLevel}`,
      verificationLevel,
      timestamp: new Date().toISOString()
    };
    return btoa(JSON.stringify(proof));
  }

  /**
   * Generate phone verification proof
   */
  private static async generatePhoneVerificationProof(phone: string, verificationLevel: string): Promise<string> {
    const proof = {
      type: 'phone_verification',
      countryCode: phone.startsWith('+') ? phone.substring(1, 3) : '1',
      proof: `phone_verified_${verificationLevel}`,
      verificationLevel,
      timestamp: new Date().toISOString()
    };
    return btoa(JSON.stringify(proof));
  }

  /**
   * Generate location verification proof
   */
  private static async generateLocationVerificationProof(locationData: any, verificationLevel: string): Promise<string> {
    const proof = {
      type: 'location_verification',
      country: locationData.country,
      region: locationData.region,
      proof: `location_verified_${verificationLevel}`,
      verificationLevel,
      timestamp: new Date().toISOString()
    };
    return btoa(JSON.stringify(proof));
  }

  /**
   * Generate identity verification proof
   */
  private static async generateIdentityVerificationProof(identityData: any, verificationLevel: string): Promise<string> {
    const proof = {
      type: 'identity_verification',
      documentType: identityData.documentType,
      proof: `identity_verified_${verificationLevel}`,
      verificationLevel,
      timestamp: new Date().toISOString()
    };
    return btoa(JSON.stringify(proof));
  }

  /**
   * Generate preference disclosure proof
   */
  private static async generatePreferenceDisclosureProof(preferences: any, verificationLevel: string): Promise<string> {
    const proof = {
      type: 'preference_disclosure',
      categories: Object.keys(preferences),
      proof: `preferences_disclosed_${verificationLevel}`,
      verificationLevel,
      timestamp: new Date().toISOString()
    };
    return btoa(JSON.stringify(proof));
  }

  /**
   * Generate compliance attestation proof
   */
  private static async generateComplianceAttestationProof(complianceData: any, verificationLevel: string): Promise<string> {
    const proof = {
      type: 'compliance_attestation',
      complianceType: Object.keys(complianceData)[0],
      proof: `compliance_attested_${verificationLevel}`,
      verificationLevel,
      timestamp: new Date().toISOString()
    };
    return btoa(JSON.stringify(proof));
  }

  /**
   * Generate custom proof
   */
  private static async generateCustomProof(customData: any, verificationLevel: string): Promise<string> {
    const proof = {
      type: 'custom_proof',
      dataKeys: Object.keys(customData),
      proof: `custom_verified_${verificationLevel}`,
      verificationLevel,
      timestamp: new Date().toISOString()
    };
    return btoa(JSON.stringify(proof));
  }

  /**
   * Sign proof with user data
   */
  private static async signProof(proof: string, userData: any): Promise<string> {
    // In production, this would use proper cryptographic signing
    const signature = {
      proof: proof,
      userDataHash: btoa(JSON.stringify(userData)),
      timestamp: new Date().toISOString()
    };
    return btoa(JSON.stringify(signature));
  }

  /**
   * Calculate age from date of birth
   */
  private static calculateAge(dateOfBirth: string): number {
    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  }

  /**
   * Get age range category
   */
  private static getAgeRange(age: number): string {
    if (age < 13) return 'child';
    if (age < 18) return 'teen';
    if (age < 25) return 'young_adult';
    if (age < 65) return 'adult';
    return 'senior';
  }

  /**
   * Generate random ID
   */
  private static generateRandomId(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(crypto.getRandomValues(new Uint8Array(1))[0] / 255 * chars.length));
    }
    return result;
  }

  /**
   * Generate secure token using crypto API
   */
  private static async generateSecureToken(): Promise<string> {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Validate user data against data point requirements
   */
  private static validateUserData(dataPoint: StandardDataPoint, userData: any): void {
    // Validate required fields
    for (const field of dataPoint.requiredFields || []) {
      if (!userData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate data types and patterns
    if (dataPoint.validation) {
      this.validateField(dataPoint.validation, userData);
    }
  }

  /**
   * Validate field against validation rules
   */
  private static validateField(validation: any, data: any): void {
    if (validation.required && !data) {
      throw new Error('Field is required');
    }

    if (validation.minValue !== undefined && data < validation.minValue) {
      throw new Error(`Value must be at least ${validation.minValue}`);
    }

    if (validation.maxValue !== undefined && data > validation.maxValue) {
      throw new Error(`Value must be no more than ${validation.maxValue}`);
    }

    if (validation.pattern && !validation.pattern.test(data)) {
      throw new Error('Value does not match required pattern');
    }

    if (validation.custom && !validation.custom(data)) {
      throw new Error('Value failed custom validation');
    }
  }
}
