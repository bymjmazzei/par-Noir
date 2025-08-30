// Standardized Data Points System for SDK
// Local copy to avoid circular dependencies

export interface StandardDataPoint {
  id: string;
  name: string;
  description: string;
  category: 'identity' | 'verification' | 'preferences' | 'compliance' | 'location';
  dataType: 'string' | 'number' | 'boolean' | 'date' | 'object';
  zkpType: ZKPType;
  validation?: DataValidation;
  requiredFields?: string[];
  optionalFields?: string[];
  defaultPrivacy: 'public' | 'private' | 'selective';
  examples: string[];
}

export type ZKPType = 
  | 'age_verification'
  | 'email_verification'
  | 'phone_verification'
  | 'location_verification'
  | 'identity_verification'
  | 'identity_attestation'
  | 'preference_disclosure'
  | 'compliance_attestation'
  | 'custom_proof';

export interface DataValidation {
  minValue?: number;
  maxValue?: number;
  pattern?: RegExp;
  required?: boolean;
  custom?: (value: any) => boolean;
}

export interface ZKPGenerationRequest {
  dataPointId: string;
  userData: any;
  verificationLevel: 'basic' | 'enhanced' | 'verified';
  expirationDays?: number;
}

export interface ZKPProof {
  proofId: string;
  dataPointId: string;
  proofType: ZKPType;
  proofData: {
    encryptedData: string;
    zkpToken: string;
    attestedAt: string;
    attestedBy: string;
    dataType: 'attested' | 'verified';
    expiresAt?: string;
  };
  signature: string;
  timestamp: string;
}

// Data Point Proposal System
export interface DataPointProposal {
  id: string;
  name: string;
  description: string;
  category: 'identity' | 'verification' | 'preferences' | 'compliance' | 'location';
  dataType: 'string' | 'number' | 'boolean' | 'date' | 'object';
  requiredFields: string[];
  optionalFields?: string[];
  validation?: DataValidation;
  examples: string[];
  useCase: string;
  proposedBy: string;
  proposedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  votes: {
    upvotes: number;
    downvotes: number;
    voters: string[];
  };
}

// Standard Data Points Registry
export const STANDARD_DATA_POINTS: Record<string, StandardDataPoint> = {
  // Core Identity Verification
  'age_attestation': {
    id: 'age_attestation',
    name: 'Age Attestation',
    description: 'Attest to your age for age-restricted services',
    category: 'verification',
    dataType: 'date',
    zkpType: 'age_verification',
    validation: { required: true },
    requiredFields: ['dateOfBirth'],
    defaultPrivacy: 'selective',
    examples: ['Age-restricted content', 'Age verification services', 'Compliance requirements']
  },

  'identity_attestation': {
    id: 'identity_attestation',
    name: 'Identity Attestation',
    description: 'Attest to your legal identity information',
    category: 'identity',
    dataType: 'object',
    zkpType: 'identity_attestation',
    validation: { required: true },
    requiredFields: ['firstName', 'lastName'],
    optionalFields: ['middleName'],
    defaultPrivacy: 'selective',
    examples: ['Account creation', 'Identity verification', 'Compliance requirements']
  },

  'email_verification': {
    id: 'email_verification',
    name: 'Email Verification',
    description: 'Verify your email address ownership',
    category: 'verification',
    dataType: 'string',
    zkpType: 'email_verification',
    validation: { 
      required: true,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    requiredFields: ['email'],
    defaultPrivacy: 'selective',
    examples: ['Account verification', 'Communication preferences', 'Security notifications']
  },

  'phone_verification': {
    id: 'phone_verification',
    name: 'Phone Verification',
    description: 'Verify your phone number ownership',
    category: 'verification',
    dataType: 'string',
    zkpType: 'phone_verification',
    validation: { required: true },
    requiredFields: ['phoneNumber'],
    defaultPrivacy: 'selective',
    examples: ['Two-factor authentication', 'SMS notifications', 'Account recovery']
  },

  'location_verification': {
    id: 'location_verification',
    name: 'Location Verification',
    description: 'Verify your current or preferred location',
    category: 'location',
    dataType: 'object',
    zkpType: 'location_verification',
    validation: { required: true },
    requiredFields: ['country'],
    optionalFields: ['region', 'city'],
    defaultPrivacy: 'selective',
    examples: ['Localized services', 'Compliance requirements', 'Regional features']
  },

  'communication_preferences': {
    id: 'communication_preferences',
    name: 'Communication Preferences',
    description: 'Your preferred communication channels and frequency',
    category: 'preferences',
    dataType: 'object',
    zkpType: 'preference_disclosure',
    validation: { required: true },
    requiredFields: ['channels'],
    optionalFields: ['frequency', 'language'],
    defaultPrivacy: 'private',
    examples: ['Marketing communications', 'Service updates', 'Support notifications']
  },

  'privacy_preferences': {
    id: 'privacy_preferences',
    name: 'Privacy Preferences',
    description: 'Your privacy and data sharing preferences',
    category: 'preferences',
    dataType: 'object',
    zkpType: 'preference_disclosure',
    validation: { required: true },
    requiredFields: ['dataSharing'],
    optionalFields: ['analytics', 'thirdParty'],
    defaultPrivacy: 'private',
    examples: ['Data sharing controls', 'Privacy settings', 'Consent management']
  },

  'gdpr_consent': {
    id: 'gdpr_consent',
    name: 'GDPR Consent',
    description: 'GDPR-compliant data processing consent',
    category: 'compliance',
    dataType: 'object',
    zkpType: 'compliance_attestation',
    validation: { required: true },
    requiredFields: ['consentGiven', 'purpose'],
    optionalFields: ['withdrawalDate'],
    defaultPrivacy: 'private',
    examples: ['GDPR compliance', 'Data processing consent', 'Legal requirements']
  }
};

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
      proofId: `zkp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      dataPointId: request.dataPointId,
      proofType: dataPoint.zkpType,
      proofData: {
        encryptedData: btoa(JSON.stringify(request.userData)),
        zkpToken: proof,
        attestedAt: new Date().toISOString(),
        attestedBy: 'user_identity',
        dataType: 'attested',
        expiresAt: request.expirationDays ? 
          new Date(Date.now() + request.expirationDays * 24 * 60 * 60 * 1000).toISOString() : 
          undefined
      },
      signature: await this.signProof(proof, request.userData),
      timestamp: new Date().toISOString()
    };

    return zkpProof;
  }

  /**
   * Propose a new standard data point
   */
  static async proposeDataPoint(
    proposal: Omit<DataPointProposal, 'id' | 'proposedAt' | 'status' | 'votes'>
  ): Promise<{ success: boolean; proposalId?: string; error?: string }> {
    try {
      // Validate proposal
      if (!proposal.name || !proposal.description || !proposal.useCase) {
        return { success: false, error: 'Missing required fields' };
      }

      // Check if data point already exists
      const existingDataPoint = Object.values(STANDARD_DATA_POINTS).find(
        dp => dp.name.toLowerCase() === proposal.name.toLowerCase()
      );
      if (existingDataPoint) {
        return { success: false, error: 'Data point already exists' };
      }

      // Generate proposal ID
      const proposalId = `proposal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      return { success: true, proposalId };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to propose data point' 
      };
    }
  }

  /**
   * Vote on a data point proposal
   */
  static async voteOnProposal(
    proposalId: string, 
    voterId: string, 
    vote: 'upvote' | 'downvote'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // In a real implementation, this would update the proposal in storage
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to vote on proposal' 
      };
    }
  }

  /**
   * Get pending proposals
   */
  static getPendingProposals(): DataPointProposal[] {
    // In a real implementation, this would fetch from storage
    return [];
  }

  /**
   * Get proposal by ID
   */
  static getProposal(proposalId: string): DataPointProposal | undefined {
    // In a real implementation, this would fetch from storage
    return undefined;
  }

  /**
   * Get all available data points
   */
  static getAvailableDataPoints(): StandardDataPoint[] {
    return Object.values(STANDARD_DATA_POINTS);
  }

  /**
   * Get data points by category
   */
  static getDataPointsByCategory(category: string): StandardDataPoint[] {
    return Object.values(STANDARD_DATA_POINTS).filter(dp => dp.category === category);
  }

  /**
   * Get data point by ID
   */
  static getDataPoint(id: string): StandardDataPoint | undefined {
    return STANDARD_DATA_POINTS[id];
  }

  // Private helper methods
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

  private static validateField(validation: DataValidation, data: any): void {
    if (validation.required && !data) {
      throw new Error('Field is required');
    }

    if (validation.minValue !== undefined && data < validation.minValue) {
      throw new Error(`Value must be at least ${validation.minValue}`);
    }

    if (validation.maxValue !== undefined && data > validation.maxValue) {
      throw new Error(`Value must be at most ${validation.maxValue}`);
    }

    if (validation.pattern && typeof data === 'string' && !validation.pattern.test(data)) {
      throw new Error('Value does not match required pattern');
    }

    if (validation.custom && !validation.custom(data)) {
      throw new Error('Value failed custom validation');
    }
  }

  private static async generateProofByType(zkpType: ZKPType, userData: any, verificationLevel: string): Promise<string> {
    switch (zkpType) {
      case 'age_verification':
        return this.generateAgeVerificationProof(userData.dateOfBirth, verificationLevel);
      case 'email_verification':
        return this.generateEmailVerificationProof(userData.email, verificationLevel);
      case 'phone_verification':
        return this.generatePhoneVerificationProof(userData.phoneNumber, verificationLevel);
      case 'location_verification':
        return this.generateLocationVerificationProof(userData, verificationLevel);
      case 'identity_verification':
      case 'identity_attestation':
        return this.generateIdentityVerificationProof(userData, verificationLevel);
      case 'preference_disclosure':
        return this.generatePreferenceDisclosureProof(userData, verificationLevel);
      case 'compliance_attestation':
        return this.generateComplianceAttestationProof(userData, verificationLevel);
      case 'custom_proof':
        return this.generateCustomProof(userData, verificationLevel);
      default:
        throw new Error(`Unsupported ZKP type: ${zkpType}`);
    }
  }

  private static async generateAgeVerificationProof(dateOfBirth: string, verificationLevel: string): Promise<string> {
    const proof = {
      type: 'age_verification',
      age: this.calculateAge(dateOfBirth),
      proof: `age_verified_${verificationLevel}`,
      verificationLevel,
      timestamp: new Date().toISOString()
    };
    return btoa(JSON.stringify(proof));
  }

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

  private static async signProof(proof: string, userData: any): Promise<string> {
    // In production, this would use proper cryptographic signing
    const signature = {
      proof: proof,
      userDataHash: btoa(JSON.stringify(userData)),
      timestamp: new Date().toISOString()
    };
    return btoa(JSON.stringify(signature));
  }

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
}
