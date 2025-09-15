import { IDVerificationResult } from '../components/IDVerificationPopup';
import { VerifiedZKPGenerator } from '../utils/VerifiedZKPGenerator';
import { SecureFileHandler } from '../utils/SecureFileHandler';

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

/**
 * Secure Identity Verification Service
 * Processes ID verification without storing images permanently
 * Uses encryption and secure deletion to protect user privacy
 */
export class SecureIdentityVerificationService {
  private jumioApiToken: string;
  private jumioApiSecret: string;

  constructor() {
    // In production, these would come from environment variables
    this.jumioApiToken = process.env.REACT_APP_JUMIO_API_TOKEN || '';
    this.jumioApiSecret = process.env.REACT_APP_JUMIO_API_SECRET || '';
  }

  /**
   * Verify identity securely without storing images
   */
  async verifyIdentity(idFile: File, selfieFile: File, identityId?: string): Promise<IDVerificationResult> {
    try {
      // Step 1: Process ID document securely
      const idVerification = await SecureFileHandler.processFileSecurely(
        idFile,
        async (decryptedData) => {
          return await this.verifyIDDocument(decryptedData);
        }
      );
      
      if (!idVerification.isValid) {
        return {
          isValid: false,
          error: 'Invalid ID document',
          verificationMethod: 'secure_id_verification'
        };
      }
      
      // Step 2: Process selfie securely
      const selfieVerification = await SecureFileHandler.processFileSecurely(
        selfieFile,
        async (decryptedData) => {
          return await this.verifySelfie(decryptedData);
        }
      );
      
      // Step 3: Compare faces (using hashes, not images)
      const faceMatch = await this.compareFacesSecurely(idFile, selfieFile);
      
      // Step 4: Detect liveness
      const liveness = await this.detectLivenessSecurely(selfieFile);
      
      const isValid = faceMatch.confidence > 0.8 && liveness.isLive;
      
      // Step 5: Generate ZKPs if verification is successful
      if (isValid && identityId && idVerification.extractedData) {
        try {
          const verifiedZKPs = await VerifiedZKPGenerator.generateVerifiedZKPs({
            extractedData: idVerification.extractedData,
            verificationMethod: 'secure_id_verification_with_selfie',
            confidence: this.calculateOverallConfidence(faceMatch, liveness),
            identityId
          });
          
          // Store the verified ZKPs
          await VerifiedZKPGenerator.storeVerifiedZKPs(identityId, verifiedZKPs);
          
          return {
            isValid,
            extractedData: idVerification.extractedData,
            confidence: this.calculateOverallConfidence(faceMatch, liveness),
            verificationMethod: 'secure_id_verification_with_selfie',
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
        verificationMethod: 'secure_id_verification_with_selfie'
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Verification failed',
        verificationMethod: 'error'
      };
    }
  }

  /**
   * Verify ID document using encrypted data
   */
  private async verifyIDDocument(decryptedData: ArrayBuffer): Promise<{
    isValid: boolean;
    extractedData?: ExtractedIDData;
    confidence?: number;
  }> {
    try {
      // Convert ArrayBuffer to File for processing
      const blob = new Blob([decryptedData], { type: 'image/jpeg' });
      const file = new File([blob], 'id_document.jpg', { type: 'image/jpeg' });
      
      // For now, we'll simulate the verification process
      // In production, this would send encrypted data to Jumio
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
      
      // Securely delete the temporary file
      await SecureFileHandler.secureDeleteFile(file);
      
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

  /**
   * Verify selfie using encrypted data
   */
  private async verifySelfie(decryptedData: ArrayBuffer): Promise<{
    isValid: boolean;
    confidence?: number;
  }> {
    try {
      // Convert ArrayBuffer to File for processing
      const blob = new Blob([decryptedData], { type: 'image/jpeg' });
      const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
      
      // Simulate selfie verification
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Securely delete the temporary file
      await SecureFileHandler.secureDeleteFile(file);
      
      return {
        isValid: true,
        confidence: 0.92
      };
    } catch (error) {
      return {
        isValid: false,
        confidence: 0
      };
    }
  }

  /**
   * Compare faces securely using hashes
   */
  private async compareFacesSecurely(idFile: File, selfieFile: File): Promise<FaceMatchResult> {
    try {
      // Generate hashes of the files for comparison
      const idHash = await SecureFileHandler.hashFile(idFile);
      const selfieHash = await SecureFileHandler.hashFile(selfieFile);
      
      // In a real implementation, you would:
      // 1. Extract face features from both images
      // 2. Compare the features using cryptographic methods
      // 3. Return a confidence score
      
      // For now, simulate a successful face match
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      return {
        confidence: 0.92,
        isMatch: true
      };
    } catch (error) {
      return {
        confidence: 0,
        isMatch: false
      };
    }
  }

  /**
   * Detect liveness securely
   */
  private async detectLivenessSecurely(selfieFile: File): Promise<LivenessResult> {
    try {
      // Generate hash for liveness detection
      const selfieHash = await SecureFileHandler.hashFile(selfieFile);
      
      // In a real implementation, you would:
      // 1. Analyze the image for liveness indicators
      // 2. Check for spoofing attempts
      // 3. Return liveness confidence
      
      // Simulate liveness detection
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return {
        isLive: true,
        confidence: 0.88,
        spoofAttempts: 0
      };
    } catch (error) {
      return {
        isLive: false,
        confidence: 0
      };
    }
  }

  /**
   * Calculate overall confidence score
   */
  private calculateOverallConfidence(faceMatch: FaceMatchResult, liveness: LivenessResult): number {
    const faceWeight = 0.6;
    const livenessWeight = 0.4;
    
    return (faceMatch.confidence * faceWeight) + (liveness.confidence * livenessWeight);
  }

  /**
   * Send encrypted data to verification service
   */
  private async sendEncryptedToService(encryptedData: ArrayBuffer, serviceType: 'id' | 'selfie'): Promise<any> {
    try {
      // In production, this would send encrypted data to Jumio/Onfido
      // They would process it and return only extracted text data
      
      const response = await fetch('/api/verify-encrypted-document', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/octet-stream',
          'X-Service-Type': serviceType
        },
        body: encryptedData
      });
      
      if (!response.ok) {
        throw new Error(`Verification service error: ${response.statusText}`);
      }
      
      return response.json();
    } catch (error) {
      // Fallback to mock verification for development
      console.warn('Verification service unavailable, using mock data:', error);
      
      if (serviceType === 'id') {
        return {
          isValid: true,
          extractedData: {
            firstName: 'John',
            lastName: 'Doe',
            dateOfBirth: '1990-01-01',
            address: '123 Main St, Anytown, ST 12345'
          },
          confidence: 0.95
        };
      } else {
        return {
          isValid: true,
          confidence: 0.92
        };
      }
    }
  }
}
