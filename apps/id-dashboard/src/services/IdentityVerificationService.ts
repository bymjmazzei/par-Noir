import { IDVerificationResult } from '../components/IDVerificationPopup';
import { VerifiedZKPGenerator } from '../utils/VerifiedZKPGenerator';

export interface ExtractedIDData {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  address?: string;
  licenseNumber?: string;
  expirationDate?: string;
}

export interface FaceMatchResult {
  confidence: number;
  isMatch: boolean;
}

export interface LivenessResult {
  isLive: boolean;
  confidence: number;
  spoofAttempts?: number;
}

export class IdentityVerificationService {
  private jumioApiToken: string;
  private jumioApiSecret: string;

  constructor() {
    // In production, these would come from environment variables
    this.jumioApiToken = process.env.REACT_APP_JUMIO_API_TOKEN || '';
    this.jumioApiSecret = process.env.REACT_APP_JUMIO_API_SECRET || '';
  }

  async verifyIdentity(idFile: File, selfieFile: File, identityId?: string): Promise<IDVerificationResult> {
    try {
      // Step 1: Verify ID document authenticity
      const idVerification = await this.verifyIDDocument(idFile);
      
      if (!idVerification.isValid) {
        return {
          isValid: false,
          error: 'Invalid ID document',
          verificationMethod: 'id_verification'
        };
      }
      
      // Step 2: Extract face from ID
      const idFace = await this.extractFaceFromID(idFile);
      
      // Step 3: Extract face from selfie
      const selfieFace = await this.extractFaceFromSelfie(selfieFile);
      
      // Step 4: Compare faces
      const faceMatch = await this.compareFaces(idFace, selfieFace);
      
      // Step 5: Detect liveness in selfie
      const liveness = await this.detectLiveness(selfieFile);
      
      const isValid = faceMatch.confidence > 0.8 && liveness.isLive;
      
      // If verification is successful and we have an identity ID, generate and store ZKPs
      if (isValid && identityId && idVerification.extractedData) {
        try {
          const verifiedZKPs = await VerifiedZKPGenerator.generateVerifiedZKPs({
            extractedData: idVerification.extractedData,
            verificationMethod: 'id_verification_with_selfie',
            confidence: this.calculateOverallConfidence(faceMatch, liveness),
            identityId
          });
          
          // Store the verified ZKPs
          await VerifiedZKPGenerator.storeVerifiedZKPs(identityId, verifiedZKPs);
          
          return {
            isValid,
            extractedData: idVerification.extractedData,
            confidence: this.calculateOverallConfidence(faceMatch, liveness),
            verificationMethod: 'id_verification_with_selfie',
            verifiedDataPoints: verifiedZKPs.verifiedDataPoints
          };
        } catch (zkpError) {
          console.error('Error generating ZKPs:', zkpError);
          // Still return success even if ZKP generation fails
        }
      }
      
      return {
        isValid,
        extractedData: idVerification.extractedData,
        confidence: this.calculateOverallConfidence(faceMatch, liveness),
        verificationMethod: 'id_verification_with_selfie'
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Verification failed',
        verificationMethod: 'error'
      };
    }
  }

  private async verifyIDDocument(document: File): Promise<{
    isValid: boolean;
    extractedData?: ExtractedIDData;
    confidence?: number;
  }> {
    try {
      // For now, we'll simulate the Jumio API call
      // In production, this would make a real API call to Jumio
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mock successful verification
      const mockExtractedData: ExtractedIDData = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01',
        address: '123 Main St, Anytown, ST 12345',
        licenseNumber: 'D123456789',
        expirationDate: '2025-01-01'
      };
      
      return {
        isValid: true,
        extractedData: mockExtractedData,
        confidence: 0.95
      };
    } catch (error) {
      return {
        isValid: false,
        confidence: 0
      };
    }
  }

  private async extractFaceFromID(idFile: File): Promise<string> {
    // In production, this would use AWS Rekognition or similar service
    // to extract face data from the ID document
    return 'mock_face_id';
  }

  private async extractFaceFromSelfie(selfieFile: File): Promise<string> {
    // In production, this would use AWS Rekognition or similar service
    // to extract face data from the selfie
    return 'mock_selfie_face_id';
  }

  private async compareFaces(idFace: string, selfieFace: string): Promise<FaceMatchResult> {
    try {
      // In production, this would use AWS Rekognition CompareFaces API
      // For now, we'll simulate a successful face match
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return {
        confidence: 0.92, // 92% confidence
        isMatch: true
      };
    } catch (error) {
      return {
        confidence: 0,
        isMatch: false
      };
    }
  }

  private async detectLiveness(imageFile: File): Promise<LivenessResult> {
    try {
      // In production, this would use FaceTec or similar liveness detection service
      // For now, we'll simulate successful liveness detection
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      return {
        isLive: true,
        confidence: 0.88, // 88% confidence
        spoofAttempts: 0
      };
    } catch (error) {
      return {
        isLive: false,
        confidence: 0
      };
    }
  }

  private calculateOverallConfidence(faceMatch: FaceMatchResult, liveness: LivenessResult): number {
    // Calculate weighted confidence score
    const faceWeight = 0.6;
    const livenessWeight = 0.4;
    
    return (faceMatch.confidence * faceWeight) + (liveness.confidence * livenessWeight);
  }

  // Real Jumio API integration (commented out for now)
  /*
  private async verifyWithJumio(document: File): Promise<any> {
    const formData = new FormData();
    formData.append('document', document);
    formData.append('type', 'DRIVERS_LICENSE');
    formData.append('country', 'US');
    
    const response = await fetch('https://netverify.com/api/v4/perform-netverify', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${this.jumioApiToken}:${this.jumioApiSecret}`)}`
      },
      body: formData
    });
    
    return response.json();
  }
  */

  // Real AWS Rekognition integration (commented out for now)
  /*
  private async compareFacesWithAWS(idFace: string, selfieFace: string): Promise<FaceMatchResult> {
    const response = await fetch('/api/compare-faces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idFace,
        selfieFace
      })
    });
    
    return response.json();
  }
  */
}
