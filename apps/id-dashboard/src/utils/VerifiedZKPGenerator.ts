import { ZKPGenerator } from './ZKPGenerator';
import { ZKPProof, ZKPGenerationRequest } from '../types/DataPointTypes';
import { ExtractedIDData } from '../services/IdentityVerificationService';

export interface VerifiedZKPRequest {
  extractedData: ExtractedIDData;
  verificationMethod: string;
  confidence: number;
  identityId: string;
}

export interface VerifiedZKPResult {
  proofs: ZKPProof[];
  verifiedDataPoints: string[];
  overallConfidence: number;
}

export class VerifiedZKPGenerator {
  /**
   * Generate verified ZKPs from ID verification results
   */
  static async generateVerifiedZKPs(request: VerifiedZKPRequest): Promise<VerifiedZKPResult> {
    const proofs: ZKPProof[] = [];
    const verifiedDataPoints: string[] = [];
    
    // Generate ZKP for each verified data point
    if (request.extractedData.firstName && request.extractedData.lastName) {
      const nameProof = await this.generateNameVerificationProof(request);
      proofs.push(nameProof);
      verifiedDataPoints.push('identity_verification');
    }
    
    if (request.extractedData.dateOfBirth) {
      const ageProof = await this.generateAgeVerificationProof(request);
      proofs.push(ageProof);
      verifiedDataPoints.push('age_verification');
    }
    
    if (request.extractedData.address) {
      const addressProof = await this.generateAddressVerificationProof(request);
      proofs.push(addressProof);
      verifiedDataPoints.push('address_verification');
    }
    
    return {
      proofs,
      verifiedDataPoints,
      overallConfidence: request.confidence
    };
  }
  
  /**
   * Generate ZKP for name verification
   */
  private static async generateNameVerificationProof(request: VerifiedZKPRequest): Promise<ZKPProof> {
    const zkpRequest: ZKPGenerationRequest = {
      dataPointId: 'identity_verification',
      userData: {
        firstName: request.extractedData.firstName,
        lastName: request.extractedData.lastName,
        verificationMethod: request.verificationMethod,
        confidence: request.confidence
      },
      verificationLevel: 'verified',
      expirationDays: 365 // 1 year expiration
    };
    
    const proof = await ZKPGenerator.generateZKP(zkpRequest);
    
    // Enhance with verification metadata
    return {
      ...proof,
      metadata: {
        ...proof.metadata,
        verificationMethod: request.verificationMethod,
        verificationConfidence: request.confidence,
        verifiedAt: new Date().toISOString(),
        documentType: 'government_id'
      }
    };
  }
  
  /**
   * Generate ZKP for age verification
   */
  private static async generateAgeVerificationProof(request: VerifiedZKPRequest): Promise<ZKPProof> {
    const zkpRequest: ZKPGenerationRequest = {
      dataPointId: 'age_verification',
      userData: {
        dateOfBirth: request.extractedData.dateOfBirth,
        verificationMethod: request.verificationMethod,
        confidence: request.confidence
      },
      verificationLevel: 'verified',
      expirationDays: 365
    };
    
    const proof = await ZKPGenerator.generateZKP(zkpRequest);
    
    return {
      ...proof,
      metadata: {
        ...proof.metadata,
        verificationMethod: request.verificationMethod,
        verificationConfidence: request.confidence,
        verifiedAt: new Date().toISOString(),
        documentType: 'government_id'
      }
    };
  }
  
  /**
   * Generate ZKP for address verification
   */
  private static async generateAddressVerificationProof(request: VerifiedZKPRequest): Promise<ZKPProof> {
    const zkpRequest: ZKPGenerationRequest = {
      dataPointId: 'address_verification',
      userData: {
        address: request.extractedData.address,
        verificationMethod: request.verificationMethod,
        confidence: request.confidence
      },
      verificationLevel: 'verified',
      expirationDays: 365
    };
    
    const proof = await ZKPGenerator.generateZKP(zkpRequest);
    
    return {
      ...proof,
      metadata: {
        ...proof.metadata,
        verificationMethod: request.verificationMethod,
        verificationConfidence: request.confidence,
        verifiedAt: new Date().toISOString(),
        documentType: 'government_id'
      }
    };
  }
  
  /**
   * Store verified ZKPs in user's identity data
   */
  static async storeVerifiedZKPs(
    identityId: string, 
    verifiedZKPs: VerifiedZKPResult
  ): Promise<void> {
    try {
      // Import the identity core service
      const { IdentityCore } = await import('../utils/identityManager');
      const identityCore = new IdentityCore();
      
      // Get current identity data
      const identityData = await identityCore.getIdentity(identityId);
      
      // Add verified ZKPs to identity data
      if (!identityData.verifiedZKPs) {
        identityData.verifiedZKPs = [];
      }
      
      // Add new proofs
      identityData.verifiedZKPs.push(...verifiedZKPs.proofs);
      
      // Update verified data points
      if (!identityData.verifiedDataPoints) {
        identityData.verifiedDataPoints = [];
      }
      
      // Add new verified data points (avoid duplicates)
      const newDataPoints = verifiedZKPs.verifiedDataPoints.filter(
        point => !identityData.verifiedDataPoints.includes(point)
      );
      identityData.verifiedDataPoints.push(...newDataPoints);
      
      // Update overall verification confidence
      identityData.verificationConfidence = verifiedZKPs.overallConfidence;
      identityData.lastVerifiedAt = new Date().toISOString();
      
      // Save updated identity data
      await identityCore.updateIdentity(identityId, identityData);
      
    } catch (error) {
      console.error('Error storing verified ZKPs:', error);
      throw new Error('Failed to store verified identity data');
    }
  }
  
  /**
   * Get verified data points for a user
   */
  static async getVerifiedDataPoints(identityId: string): Promise<string[]> {
    try {
      const { IdentityCore } = await import('../utils/identityManager');
      const identityCore = new IdentityCore();
      
      const identityData = await identityCore.getIdentity(identityId);
      return identityData.verifiedDataPoints || [];
      
    } catch (error) {
      console.error('Error getting verified data points:', error);
      return [];
    }
  }
}
