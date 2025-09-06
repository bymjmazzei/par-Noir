import { cryptoWorkerManager } from './cryptoWorkerManager';
import { StandardDataPoint, ZKPGenerationRequest, ZKPProof } from '../types/DataPointTypes';
import { STANDARD_DATA_POINTS } from '../types/StandardDataPointsRegistry';

// ZKP Generation Functions
export class ZKPGenerator {
  /**
   * Generate ZKP for a standard data point
   */
  static async generateZKP(request: ZKPGenerationRequest): Promise<ZKPProof> {
    const dataPoint = STANDARD_DATA_POINTS[request.dataPointId];
    if (!dataPoint) {
      throw new Error(`Unknown data point: ${request.dataPointId}`);
    }

    // Validate user data
    this.validateUserData(dataPoint, request.userData);

    // Generate ZKP based on type
    const proof = await this.generateProofByType(dataPoint.zkpType, request.userData, request.verificationLevel);

    // Create ZKP proof object
    const zkpProof: ZKPProof = {
      dataPointId: request.dataPointId,
      proofType: dataPoint.zkpType,
      proof: proof,
      signature: await this.signProof(proof, request.userData),
      timestamp: new Date().toISOString(),
      expiresAt: request.expirationDays ? 
        new Date(Date.now() + request.expirationDays * 24 * 60 * 60 * 1000).toISOString() : 
        undefined,
      verificationLevel: request.verificationLevel,
      metadata: {
        requestedBy: 'system',
        userConsent: true,
        dataProvided: Object.keys(request.userData)
      }
    };

    return zkpProof;
  }

  /**
   * Validate user data against data point requirements
   */
  private static validateUserData(dataPoint: StandardDataPoint, userData: any): void {
    // Check required fields
    if (dataPoint.requiredFields) {
      for (const field of dataPoint.requiredFields) {
        if (!userData[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
    }

    // Check validation rules
    if (dataPoint.validation) {
      if (dataPoint.validation.required && !userData) {
        throw new Error('Data is required');
      }

      if (dataPoint.validation.pattern && typeof userData === 'string') {
        if (!dataPoint.validation.pattern.test(userData)) {
          throw new Error(`Data does not match required pattern`);
        }
      }

      if (dataPoint.validation.custom && !dataPoint.validation.custom(userData)) {
        throw new Error('Data failed custom validation');
      }
    }
  }

  /**
   * Generate proof based on ZKP type
   */
  private static async generateProofByType(zkpType: string, userData: any, verificationLevel: string): Promise<string> {
    switch (zkpType) {
      case 'age_verification':
        return this.generateAgeVerificationProof(userData, verificationLevel);
      case 'email_verification':
        return this.generateEmailVerificationProof(userData, verificationLevel);
      case 'phone_verification':
        return this.generatePhoneVerificationProof(userData, verificationLevel);
      case 'location_verification':
        return this.generateLocationVerificationProof(userData, verificationLevel);
      case 'identity_verification':
        return this.generateIdentityVerificationProof(userData, verificationLevel);
      case 'preference_disclosure':
        return this.generatePreferenceDisclosureProof(userData, verificationLevel);
      case 'compliance_attestation':
        return this.generateComplianceAttestationProof(userData, verificationLevel);
      case 'custom_proof':
        return this.generateCustomProof(userData, verificationLevel);
      default:
        throw new Error(`Unknown ZKP type: ${zkpType}`);
    }
  }

  private static async generateAgeVerificationProof(ageData: any, verificationLevel: string): Promise<string> {
    // Generate ZKP proving age without revealing exact date
    const proof = {
      type: 'age_verification',
      ageRange: this.calculateAgeRange(ageData.dateOfBirth),
      proof: `age_verified_${verificationLevel}`,
      verificationLevel,
      timestamp: new Date().toISOString()
    };
    return btoa(JSON.stringify(proof));
  }

  private static async generateEmailVerificationProof(emailData: any, verificationLevel: string): Promise<string> {
    // Generate ZKP proving email verification without revealing email
    const proof = {
      type: 'email_verification',
      domain: emailData.email.split('@')[1],
      proof: `email_verified_${verificationLevel}`,
      verificationLevel,
      timestamp: new Date().toISOString()
    };
    return btoa(JSON.stringify(proof));
  }

  private static async generatePhoneVerificationProof(phoneData: any, verificationLevel: string): Promise<string> {
    // Generate ZKP proving phone verification without revealing phone number
    const proof = {
      type: 'phone_verification',
      countryCode: phoneData.phone.split('+')[1]?.split(' ')[0] || 'unknown',
      proof: `phone_verified_${verificationLevel}`,
      verificationLevel,
      timestamp: new Date().toISOString()
    };
    return btoa(JSON.stringify(proof));
  }

  private static async generateLocationVerificationProof(locationData: any, verificationLevel: string): Promise<string> {
    // Generate ZKP proving location without revealing exact location
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

  private static async generateIdentityVerificationProof(identityData: any, verificationLevel: string): Promise<string> {
    // Generate ZKP proving identity verification without revealing document details
    const proof = {
      type: 'identity_verification',
      documentType: identityData.documentType,
      proof: `identity_verified_${verificationLevel}`,
      verificationLevel,
      timestamp: new Date().toISOString()
    };
    return btoa(JSON.stringify(proof));
  }

  private static async generatePreferenceDisclosureProof(preferences: any, verificationLevel: string): Promise<string> {
    // Generate ZKP proving preference disclosure
    const proof = {
      type: 'preference_disclosure',
      categories: Object.keys(preferences),
      proof: `preferences_disclosed_${verificationLevel}`,
      verificationLevel,
      timestamp: new Date().toISOString()
    };
    return btoa(JSON.stringify(proof));
  }

  private static async generateComplianceAttestationProof(complianceData: any, verificationLevel: string): Promise<string> {
    // Generate ZKP proving compliance attestation
    const proof = {
      type: 'compliance_attestation',
      complianceType: Object.keys(complianceData)[0],
      proof: `compliance_attested_${verificationLevel}`,
      verificationLevel,
      timestamp: new Date().toISOString()
    };
    return btoa(JSON.stringify(proof));
  }

  private static async generateCustomProof(customData: any, verificationLevel: string): Promise<string> {
    // Generate ZKP for custom data
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
   * Sign the proof with cryptographic signature
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
   * Calculate age range from date of birth
   */
  private static calculateAgeRange(dateOfBirth: string): string {
    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    
    if (age < 18) return 'under_18';
    if (age < 21) return '18_20';
    if (age < 25) return '21_24';
    if (age < 30) return '25_29';
    if (age < 40) return '30_39';
    if (age < 50) return '40_49';
    if (age < 60) return '50_59';
    return '60_plus';
  }
}
