/**
 * Age ZKP Check Service
 * Checks if user has age_attestation ZKP data point set up
 */

import { SecureMetadataStorage } from '../utils/secureMetadataStorage';
import { AttestedDataPoint } from '../utils/secureMetadata';
import { API_ENDPOINT } from '../config/api';

export class AgeZKPCheckService {
  /**
   * Check if user has age_attestation ZKP data point
   * @param identityId - The identity ID to check
   * @param passcode - The passcode to decrypt metadata
   * @returns Promise<boolean> - True if age ZKP exists and is valid
   */
  static async checkAgeZKPExists(
    identityId: string,
    passcode: string
  ): Promise<boolean> {
    try {
      const storage = new SecureMetadataStorage();
      await storage.init();
      
      // Load metadata for the identity
      const metadata = await storage.getMetadata(identityId);
      if (!metadata) {
        return false;
      }
      
      // Decrypt metadata to access data points
      // Note: This requires the passcode, which should be available in the dashboard context
      const { SecureMetadataCrypto } = await import('../utils/secureMetadata');
      
      // Get the username/pnName from identity (we need to pass it)
      // For now, we'll try to decrypt with just the passcode
      // This is a simplified check - in production, we'd need the full identity context
      
      // Check if age_attestation exists in metadata
      // Since we can't easily decrypt here, we'll check via the API endpoint
      // that's used by the browser OAuth flow
      return false; // Placeholder - will implement via API check
    } catch (error) {
      console.warn('Failed to check age ZKP:', error);
      return false;
    }
  }

  /**
   * Check age ZKP via API endpoint (simpler approach)
   * This checks if age_attestation ZKP is available for sharing
   */
  static async checkAgeZKPViaAPI(
    pnIdentifier: string,
    accessToken: string
  ): Promise<boolean> {
    try {
      // Check if age_attestation ZKP exists via OAuth endpoint
      const response = await fetch(
        `${API_ENDPOINT}/oauth/zkp-data-points?dataPointId=age_attestation`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        // If ZKP exists and is available, return true
        return data.available === true || (data.dataPoints && data.dataPoints.length > 0);
      }
      
      return false;
    } catch (error) {
      console.warn('Failed to check age ZKP via API:', error);
      return false;
    }
  }
}

