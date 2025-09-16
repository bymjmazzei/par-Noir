import { cryptoWorkerManager } from '../utils/cryptoWorkerManager';
import { ZKPGenerator } from '../utils/ZKPGenerator';
import { 
  VerifiedIdentityData, 
  VerifiedDataPoint, 
  StoredVerifiedIdentity,
  VerificationRequest,
  VerificationResult,
  VerifiedZKPProof
} from '../types/verifiedIdentity';
import { identityVerificationService } from './identityVerificationService';
import { verificationPaymentHandler } from './verificationPaymentHandler';

// Verified Identity Manager
// Manages verified identity data, ZKP generation, and storage
// Integrates with identity verification services and maintains security standards

export class VerifiedIdentityManager {
  private verifiedIdentities: Map<string, StoredVerifiedIdentity> = new Map();
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize the verified identity manager
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load existing verified identities from storage
      await this.loadVerifiedIdentities();
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize verified identity manager:', error);
      throw error;
    }
  }

  /**
   * Start identity verification process
   */
  async startVerification(request: VerificationRequest): Promise<VerificationResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Check if payment has been confirmed
      const paymentStatus = await verificationPaymentHandler.getPaymentStatus(request.identityId);
      
      if (!paymentStatus.hasPayment || !paymentStatus.isConfirmed) {
        return {
          success: false,
          verificationId: '',
          extractedData: {} as any,
          fraudPrevention: {
            livenessCheck: false,
            documentAuthenticity: false,
            biometricMatch: false,
            riskScore: 1.0,
            fraudIndicators: ['Payment not confirmed'],
            confidence: 0,
            timestamp: new Date().toISOString()
          },
          error: 'Payment not confirmed. Please complete payment before verification.'
        };
      }

      // Perform verification using the identity verification service
      const result = await identityVerificationService.verifyIdentity(request);

      if (result.success) {
        // Generate ZKPs for all verified data points
        const verifiedData = await this.generateVerifiedIdentityData(result, request.identityId);
        
        // Store the verified identity data
        await this.storeVerifiedIdentity(verifiedData);
      }

      return result;
    } catch (error) {
      throw new Error(`Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate verified identity data with ZKPs
   */
  private async generateVerifiedIdentityData(
    verificationResult: VerificationResult,
    identityId: string
  ): Promise<VerifiedIdentityData> {
    const { extractedData, fraudPrevention, verificationId } = verificationResult;
    
    // Generate ZKPs for each data point
    const dataPoints: { [key: string]: VerifiedDataPoint } = {};

    // Identity Attestation ZKP
    if (extractedData.firstName && extractedData.lastName) {
      const identityZKP = await this.generateVerifiedZKP(
        'identity_attestation',
        {
          firstName: extractedData.firstName,
          lastName: extractedData.lastName,
          middleName: extractedData.middleName || ''
        },
        verificationId,
        fraudPrevention.riskScore
      );

      dataPoints.identity_attestation = {
        value: {
          firstName: extractedData.firstName,
          lastName: extractedData.lastName,
          middleName: extractedData.middleName || ''
        },
        zkpProof: identityZKP.proof,
        verified: true,
        verificationLevel: 'verified',
        verifiedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
        dataPointId: 'identity_attestation',
        originalValue: {
          firstName: extractedData.firstName,
          lastName: extractedData.lastName,
          middleName: extractedData.middleName || ''
        }
      };
    }

    // Age Attestation ZKP
    if (extractedData.dateOfBirth) {
      const ageZKP = await this.generateVerifiedZKP(
        'age_attestation',
        {
          dateOfBirth: extractedData.dateOfBirth
        },
        verificationId,
        fraudPrevention.riskScore
      );

      dataPoints.age_attestation = {
        value: {
          dateOfBirth: extractedData.dateOfBirth
        },
        zkpProof: ageZKP.proof,
        verified: true,
        verificationLevel: 'verified',
        verifiedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
        dataPointId: 'age_attestation',
        originalValue: {
          dateOfBirth: extractedData.dateOfBirth
        }
      };
    }

    // Location Verification ZKP
    if (extractedData.country && extractedData.state) {
      const locationZKP = await this.generateVerifiedZKP(
        'location_verification',
        {
          country: extractedData.country,
          region: extractedData.state,
          city: extractedData.city || '',
          postalCode: extractedData.postalCode || ''
        },
        verificationId,
        fraudPrevention.riskScore
      );

      dataPoints.location_verification = {
        value: {
          country: extractedData.country,
          region: extractedData.state,
          city: extractedData.city || '',
          postalCode: extractedData.postalCode || ''
        },
        zkpProof: locationZKP.proof,
        verified: true,
        verificationLevel: 'verified',
        verifiedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
        dataPointId: 'location_verification',
        originalValue: {
          country: extractedData.country,
          region: extractedData.state,
          city: extractedData.city || '',
          postalCode: extractedData.postalCode || ''
        }
      };
    }

    // Document Verification ZKP (custom data point)
    const documentZKP = await this.generateVerifiedZKP(
      'document_verification',
      {
        documentType: extractedData.documentType,
        documentNumber: extractedData.documentNumber,
        issuingAuthority: extractedData.issuingAuthority || '',
        expirationDate: extractedData.expirationDate || ''
      },
      verificationId,
      fraudPrevention.riskScore
    );

    dataPoints.document_verification = {
      value: {
        documentType: extractedData.documentType,
        documentNumber: extractedData.documentNumber,
        issuingAuthority: extractedData.issuingAuthority || '',
        expirationDate: extractedData.expirationDate || ''
      },
      zkpProof: documentZKP.proof,
      verified: true,
      verificationLevel: 'verified',
      verifiedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
      dataPointId: 'document_verification',
      originalValue: {
        documentType: extractedData.documentType,
        documentNumber: extractedData.documentNumber,
        issuingAuthority: extractedData.issuingAuthority || '',
        expirationDate: extractedData.expirationDate || ''
      }
    };

    return {
      id: identityId,
      verificationId,
      verificationLevel: 'verified',
      verifiedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
      dataPoints,
      fraudPrevention: {
        ...fraudPrevention,
        timestamp: new Date().toISOString()
      },
      provider: 'veriff', // This would come from the verification result
      metadata: {
        documentType: extractedData.documentType,
        documentNumber: extractedData.documentNumber,
        issuingAuthority: extractedData.issuingAuthority,
        expirationDate: extractedData.expirationDate,
        verificationProvider: 'veriff',
        providerVerificationId: verificationId,
        quality: {
          document: 0.95,
          biometric: 0.92,
          overall: 0.93
        },
        securityFeatures: ['watermark', 'hologram', 'microprint']
      }
    };
  }

  /**
   * Generate verified ZKP with enhanced security
   */
  private async generateVerifiedZKP(
    dataPointId: string,
    userData: any,
    verificationId: string,
    riskScore: number
  ): Promise<VerifiedZKPProof> {
    // Generate standard ZKP
    const standardZKP = await ZKPGenerator.generateZKP({
      dataPointId,
      userData,
      verificationLevel: 'verified',
      expirationDays: 365
    });

    // Enhance with verification-specific metadata
    const verifiedZKP: VerifiedZKPProof = {
      ...standardZKP,
      proofType: this.mapDataPointToProofType(dataPointId),
      metadata: {
        ...standardZKP.metadata,
        verificationId,
        fraudPreventionScore: riskScore,
        provider: 'veriff'
      }
    };

    return verifiedZKP;
  }

  /**
   * Map data point ID to proof type
   */
  private mapDataPointToProofType(dataPointId: string): VerifiedZKPProof['proofType'] {
    switch (dataPointId) {
      case 'identity_attestation':
        return 'identity_verification';
      case 'age_attestation':
        return 'age_verification';
      case 'location_verification':
        return 'location_verification';
      case 'document_verification':
        return 'document_verification';
      default:
        return 'identity_verification';
    }
  }

  /**
   * Store verified identity data
   */
  private async storeVerifiedIdentity(verifiedData: VerifiedIdentityData): Promise<void> {
    const storedIdentity: StoredVerifiedIdentity = {
      id: `verified_${verifiedData.id}_${Date.now()}`,
      identityId: verifiedData.id,
      verificationData: verifiedData,
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      accessCount: 0,
      isActive: true
    };

    this.verifiedIdentities.set(storedIdentity.id, storedIdentity);
    
    // In real implementation, this would save to secure storage
    await this.saveVerifiedIdentities();
  }

  /**
   * Get verified identity data
   */
  async getVerifiedIdentity(identityId: string): Promise<VerifiedIdentityData | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Find the most recent verified identity for this identity ID
    let latestIdentity: StoredVerifiedIdentity | null = null;
    
    for (const [id, storedIdentity] of this.verifiedIdentities) {
      if (storedIdentity.identityId === identityId && storedIdentity.isActive) {
        if (!latestIdentity || new Date(storedIdentity.createdAt) > new Date(latestIdentity.createdAt)) {
          latestIdentity = storedIdentity;
        }
      }
    }

    if (latestIdentity) {
      // Update access count and last accessed
      latestIdentity.accessCount++;
      latestIdentity.lastAccessed = new Date().toISOString();
      await this.saveVerifiedIdentities();
      
      return latestIdentity.verificationData;
    }

    return null;
  }

  /**
   * Get specific verified data point
   */
  async getVerifiedDataPoint(identityId: string, dataPointId: string): Promise<VerifiedDataPoint | null> {
    const verifiedIdentity = await this.getVerifiedIdentity(identityId);
    
    if (!verifiedIdentity) {
      return null;
    }

    return verifiedIdentity.dataPoints[dataPointId] || null;
  }

  /**
   * Check if identity is verified
   */
  async isIdentityVerified(identityId: string): Promise<boolean> {
    const verifiedIdentity = await this.getVerifiedIdentity(identityId);
    return verifiedIdentity !== null && verifiedIdentity.verificationLevel === 'verified';
  }

  /**
   * Get verification status
   */
  async getVerificationStatus(identityId: string): Promise<{
    isVerified: boolean;
    verificationLevel: 'basic' | 'enhanced' | 'verified' | null;
    verifiedAt: string | null;
    expiresAt: string | null;
    dataPoints: string[];
  }> {
    const verifiedIdentity = await this.getVerifiedIdentity(identityId);
    
    if (!verifiedIdentity) {
      return {
        isVerified: false,
        verificationLevel: null,
        verifiedAt: null,
        expiresAt: null,
        dataPoints: []
      };
    }

    return {
      isVerified: true,
      verificationLevel: verifiedIdentity.verificationLevel,
      verifiedAt: verifiedIdentity.verifiedAt,
      expiresAt: verifiedIdentity.expiresAt || null,
      dataPoints: Object.keys(verifiedIdentity.dataPoints)
    };
  }

  /**
   * Revoke verification
   */
  async revokeVerification(identityId: string): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    let revoked = false;
    
    for (const [id, storedIdentity] of this.verifiedIdentities) {
      if (storedIdentity.identityId === identityId) {
        storedIdentity.isActive = false;
        revoked = true;
      }
    }

    if (revoked) {
      await this.saveVerifiedIdentities();
    }

    return revoked;
  }

  /**
   * Load verified identities from storage
   */
  private async loadVerifiedIdentities(): Promise<void> {
    try {
      // In real implementation, this would load from secure storage
      // For now, we'll use an empty map
      this.verifiedIdentities.clear();
    } catch (error) {
      console.error('Failed to load verified identities:', error);
      throw error;
    }
  }

  /**
   * Save verified identities to storage
   */
  private async saveVerifiedIdentities(): Promise<void> {
    try {
      // In real implementation, this would save to secure storage
      // For now, we'll just log the action
      console.log(`Saving ${this.verifiedIdentities.size} verified identities`);
    } catch (error) {
      console.error('Failed to save verified identities:', error);
      throw error;
    }
  }

  /**
   * Get all verified identities (for admin/debugging purposes)
   */
  async getAllVerifiedIdentities(): Promise<StoredVerifiedIdentity[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return Array.from(this.verifiedIdentities.values());
  }

  /**
   * Clean up expired verifications
   */
  async cleanupExpiredVerifications(): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const now = new Date();
    let cleanedCount = 0;

    for (const [id, storedIdentity] of this.verifiedIdentities) {
      if (storedIdentity.verificationData.expiresAt) {
        const expiresAt = new Date(storedIdentity.verificationData.expiresAt);
        if (expiresAt < now) {
          storedIdentity.isActive = false;
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      await this.saveVerifiedIdentities();
    }

    return cleanedCount;
  }
}

// Export singleton instance
export const verifiedIdentityManager = new VerifiedIdentityManager();
