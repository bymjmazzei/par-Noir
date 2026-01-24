/**
 * ZKP Data Points Service
 * Manages verified ZKP data points for users
 * Returns ZKP proofs without revealing actual identity data
 * Stores data in Google Sheets (replaces zkp-data-points.json for better scalability)
 * Stored in Google Drive (decentralized) - users own their data
 */

export interface ZKPDataPoint {
  dataPointId: string;
  proofType: 'age_verification' | 'identity_verification' | 'location_verification' | 'document_verification';
  zkpProof: string; // Encrypted ZKP proof
  signature: string;
  verifiedAt: string;
  expiresAt?: string;
  verificationLevel: 'basic' | 'enhanced' | 'verified';
  metadata: {
    provider: string;
    fraudPreventionScore?: number;
  };
  // Encrypted userData for editing purposes (client-side encryption)
  encryptedUserData?: string;
}

export interface ZKPVerificationResult {
  isValid: boolean;
  condition?: string; // e.g., "age >= 18"
  verifiedAt?: string;
  expiresAt?: string;
  error?: string;
}

export class ZKPDataPointsService {
  /**
   * Get ZKP data points from Google Sheets
   * Returns all data points as a Record
   */
  static async getZKPDataPointsFile(
    accessToken: string,
    metadataFolderId: string
  ): Promise<Record<string, ZKPDataPoint> | null> {
    try {
      const { ZKPDataPointsSheetsService } = await import('./zkpDataPointsSheetsService');
      const spreadsheetId = await ZKPDataPointsSheetsService.getZKPDataPointsSheet(
        accessToken,
        metadataFolderId
      );
      
      const dataPoints = await ZKPDataPointsSheetsService.getZKPDataPoints(
        accessToken,
        spreadsheetId
      );
      
      return Object.keys(dataPoints).length > 0 ? dataPoints : null;
    } catch (error) {
      console.error('Error getting ZKP data points from sheets:', error);
      return null;
    }
  }

  /**
   * Get all available ZKP data points for a user
   * Returns only proof metadata, NOT actual data
   */
  static async getAvailableDataPoints(
    accessToken: string,
    metadataFolderId: string
  ): Promise<Array<{
    dataPointId: string;
    proofType: string;
    verifiedAt: string;
    expiresAt?: string;
    verificationLevel: string;
  }>> {
    const dataPoints = await this.getZKPDataPointsFile(accessToken, metadataFolderId);
    
    if (!dataPoints) {
      return [];
    }

    // Return only metadata, never the actual data or proof
    return Object.entries(dataPoints).map(([dataPointId, dataPoint]) => ({
      dataPointId,
      proofType: dataPoint.proofType,
      verifiedAt: dataPoint.verifiedAt,
      expiresAt: dataPoint.expiresAt,
      verificationLevel: dataPoint.verificationLevel
    }));
  }

  /**
   * Get a specific ZKP data point proof
   * Returns ONLY the ZKP proof, NOT the actual data
   */
  static async getDataPointProof(
    accessToken: string,
    metadataFolderId: string,
    dataPointId: string
  ): Promise<ZKPDataPoint | null> {
    try {
      const { ZKPDataPointsSheetsService } = await import('./zkpDataPointsSheetsService');
      const spreadsheetId = await ZKPDataPointsSheetsService.getZKPDataPointsSheet(
        accessToken,
        metadataFolderId
      );
      
      const dataPoint = await ZKPDataPointsSheetsService.getZKPDataPoint(
        accessToken,
        spreadsheetId,
        dataPointId
      );
      
      if (!dataPoint) {
        return null;
      }

      // Check if expired
      if (dataPoint.expiresAt && new Date(dataPoint.expiresAt) < new Date()) {
        return null;
      }

      // Return the proof and encrypted userData (for editing purposes)
      // Ensure encryptedUserData is always a string (if it exists)
      let encryptedUserDataString: string | undefined;
      if (dataPoint.encryptedUserData) {
        if (typeof dataPoint.encryptedUserData === 'string') {
          encryptedUserDataString = dataPoint.encryptedUserData;
        } else if (typeof dataPoint.encryptedUserData === 'object') {
          // If it's an object (from JSON parsing), stringify it
          encryptedUserDataString = JSON.stringify(dataPoint.encryptedUserData);
        }
      }
      
      return {
        dataPointId: dataPoint.dataPointId,
        proofType: dataPoint.proofType,
        zkpProof: dataPoint.zkpProof,
        signature: dataPoint.signature,
        verifiedAt: dataPoint.verifiedAt,
        expiresAt: dataPoint.expiresAt,
        verificationLevel: dataPoint.verificationLevel,
        metadata: dataPoint.metadata,
        encryptedUserData: encryptedUserDataString // Include encrypted userData for editing (always as string)
      };
    } catch (error) {
      console.error('Error getting ZKP data point proof from sheets:', error);
      return null;
    }
  }

  /**
   * Verify a ZKP proof against a condition
   * e.g., verify "age >= 18" without revealing actual age
   * 
   * NOTE: This is a basic implementation. In production, you would use
   * a proper ZKP verification library to cryptographically verify the proof.
   */
  static async verifyProof(
    zkpProof: string,
    condition: string
  ): Promise<ZKPVerificationResult> {
    try {
      // Parse the ZKP proof (it's base64 encoded JSON)
      const proofData = JSON.parse(atob(zkpProof));
      console.log('[ZKP Verify] Proof data structure:', {
        type: proofData.type,
        proofType: proofData.proofType,
        verificationLevel: proofData.verificationLevel,
        ageRange: proofData.ageRange,
        hasAgeRange: !!proofData.ageRange,
        keys: Object.keys(proofData)
      });
      
      // Basic verification logic
      // In production, this would use proper cryptographic ZKP verification
      if (condition.startsWith('age >= ')) {
        const minAge = parseInt(condition.replace('age >= ', ''), 10);
        console.log('[ZKP Verify] Checking age condition:', { condition, minAge });
        
        // Check if proof type matches
        if (proofData.type === 'age_verification' || proofData.proofType === 'age_verification') {
          // Verify the proof cryptographically (simplified for now)
          // In production, use proper ZKP verification library
          const calculatedAge = this.calculateAgeFromRange(proofData.ageRange);
          // Accept 'basic' or 'verified' verification levels for age attestation
          // 'basic' means the user attested their age, which is sufficient for content filtering
          const hasValidVerificationLevel = proofData.verificationLevel === 'verified' || 
                                          proofData.verificationLevel === 'basic' ||
                                          proofData.verificationLevel === 'enhanced';
          const isValid = hasValidVerificationLevel && 
                         proofData.ageRange && 
                         calculatedAge >= minAge;
          
          console.log('[ZKP Verify] Age verification result:', {
            verificationLevel: proofData.verificationLevel,
            ageRange: proofData.ageRange,
            calculatedAge,
            minAge,
            hasValidVerificationLevel,
            isValid
          });
          
          return {
            isValid,
            condition,
            verifiedAt: proofData.timestamp || proofData.verifiedAt,
            expiresAt: proofData.expiresAt
          };
        } else {
          console.log('[ZKP Verify] Proof type mismatch:', {
            expected: 'age_verification',
            actualType: proofData.type,
            actualProofType: proofData.proofType
          });
        }
      }

      // For other conditions, return basic validation
      // Accept 'basic', 'enhanced', or 'verified' verification levels
      const isValid = proofData.verificationLevel === 'verified' || 
                     proofData.verificationLevel === 'basic' ||
                     proofData.verificationLevel === 'enhanced';
      console.log('[ZKP Verify] General verification result:', {
        verificationLevel: proofData.verificationLevel,
        isValid
      });
      
      return {
        isValid,
        condition,
        verifiedAt: proofData.timestamp || proofData.verifiedAt,
        expiresAt: proofData.expiresAt
      };
    } catch (error: any) {
      console.error('[ZKP Verify] Error verifying ZKP proof:', error);
      return {
        isValid: false,
        condition,
        error: error.message || 'Invalid proof format'
      };
    }
  }

  /**
   * Calculate age from age range in proof
   * Helper function for age verification
   */
  private static calculateAgeFromRange(ageRange: any): number {
    // If ageRange is a number, return it
    if (typeof ageRange === 'number') {
      return ageRange;
    }
    
    // If ageRange is an object with min/max, use min
    if (ageRange && typeof ageRange === 'object') {
      return ageRange.min || ageRange.max || 0;
    }
    
    // If ageRange is a string like "30_39", parse it
    if (typeof ageRange === 'string') {
      // Handle formats like "30_39", "18_24", etc.
      const parts = ageRange.split('_');
      if (parts.length === 2) {
        const min = parseInt(parts[0], 10);
        if (!isNaN(min)) {
          return min; // Use the minimum age from the range
        }
      }
      // Try parsing as a single number
      const parsed = parseInt(ageRange, 10);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
    
    // Default to 0 if can't determine
    return 0;
  }

  /**
   * Store or update ZKP data point
   */
  static async storeDataPoint(
    accessToken: string,
    metadataFolderId: string,
    identifier: string,
    dataPoint: ZKPDataPoint
  ): Promise<void> {
    try {
      const { ZKPDataPointsSheetsService } = await import('./zkpDataPointsSheetsService');
      const spreadsheetId = await ZKPDataPointsSheetsService.getZKPDataPointsSheet(
        accessToken,
        metadataFolderId
      );
      
      await ZKPDataPointsSheetsService.addZKPDataPoint(
        accessToken,
        spreadsheetId,
        dataPoint
      );
      
      console.log('Successfully stored ZKP data point in sheets:', dataPoint.dataPointId);
    } catch (error) {
      console.error('Error storing ZKP data point in sheets:', error);
      throw error;
    }
  }
}

