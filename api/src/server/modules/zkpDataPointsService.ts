/**
 * ZKP Data Points Service
 * Manages verified ZKP data points for users
 * Returns ZKP proofs without revealing actual identity data
 * Stores data in Google Drive Metadata folder (same pattern as preferences and connections)
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
  private static readonly ZKP_FILE_NAME = 'zkp-data-points.json';

  /**
   * Get ZKP data points file from user's Google Drive
   */
  static async getZKPDataPointsFile(
    accessToken: string,
    metadataFolderId: string
  ): Promise<Record<string, ZKPDataPoint> | null> {
    try {
      // Search for zkp-data-points.json in metadata folder
      const searchQuery = `name='${this.ZKP_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id)&pageSize=1`;
      
      const searchResponse = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!searchResponse.ok || searchResponse.status === 404) {
        return null;
      }

      const searchData = await searchResponse.json() as { files?: Array<{ id: string }> };
      
      if (!searchData.files || searchData.files.length === 0) {
        return null;
      }

      // Download zkp-data-points.json file
      const fileId = searchData.files[0].id;
      const getResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );

      if (!getResponse.ok) {
        return null;
      }

      try {
        const data = await getResponse.json() as { dataPoints?: Record<string, ZKPDataPoint> };
        return data.dataPoints || null;
      } catch {
        return null;
      }
    } catch (error) {
      console.error('Error getting ZKP data points file:', error);
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
    const dataPoints = await this.getZKPDataPointsFile(accessToken, metadataFolderId);
    
    if (!dataPoints) {
      return null;
    }

    const dataPoint = dataPoints[dataPointId];
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
    // Get existing data points
    let existingDataPoints = await this.getZKPDataPointsFile(accessToken, metadataFolderId) || {};
    
    // Update or add the data point
    existingDataPoints[dataPoint.dataPointId] = dataPoint;

    const fileContent = {
      identifier,
      updatedAt: new Date().toISOString(),
      dataPoints: existingDataPoints
    };

    const fileContentJson = JSON.stringify(fileContent, null, 2);

    try {
      // Search for existing zkp-data-points.json
      const searchQuery = `name='${this.ZKP_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id)&pageSize=1`;
      
      const searchResponse = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json() as { files?: Array<{ id: string }> };
        
        if (searchData.files && searchData.files.length > 0) {
          // Update existing file
          const fileId = searchData.files[0].id;
          const updateResponse = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json; charset=UTF-8'
            },
            body: fileContentJson
          });
          
          if (!updateResponse.ok) {
            const errorText = await updateResponse.text();
            console.error('Failed to update ZKP data points file:', updateResponse.status, errorText);
            throw new Error(`Failed to update ZKP data points file: ${errorText}`);
          }
          
          console.log('Successfully updated ZKP data points file:', fileId);
          return;
        }
      }

      // Create new file
      const boundary = `----WebKitFormBoundary${Date.now()}`;
      const metadataPart = JSON.stringify({
        name: this.ZKP_FILE_NAME,
        parents: [metadataFolderId]
      });

      const multipartBody = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="metadata"',
        'Content-Type: application/json',
        '',
        metadataPart,
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="zkp-data-points.json"',
        'Content-Type: application/json',
        '',
        fileContentJson,
        `--${boundary}--`
      ].join('\r\n');

      const createResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body: multipartBody
      });
      
      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error('Failed to create ZKP data points file:', createResponse.status, errorText);
        throw new Error(`Failed to create ZKP data points file: ${errorText}`);
      }
      
      const createdFile = await createResponse.json() as { id: string };
      console.log('Successfully created ZKP data points file:', createdFile.id);
    } catch (error) {
      console.error('Error storing ZKP data point:', error);
      throw error;
    }
  }
}

