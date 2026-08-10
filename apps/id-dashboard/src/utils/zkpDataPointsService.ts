/**
 * ZKP Data Points Service - API-only (no localStorage)
 * All data points are stored in Google Drive via API server
 */

import { ownerFetch, ownerGet } from '../services/ownerApiService';

export interface ZKPDataPoint {
  dataPointId: string;
  proofType: string;
  zkpProof: string;
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

export class ZKPDataPointsService {
  /**
   * Get pnIdentifier from credentials
   */
  private static async getPnIdentifier(
    identityId: string,
    credentials: { pnName: string; passcode: string },
    publicKey?: string
  ): Promise<string> {
    const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
    return await VolumeIdGenerator.generateCanonicalVolumeId(publicKey || '');
  }

  /**
   * Get all ZKP data points from API server (Google Drive), including verificationLevel.
   * Returns null when Drive layout is not ready (caller should retry), not an empty list.
   */
  static async getAllDataPoints(
    identityId: string,
    credentials: { pnName: string; passcode: string },
    authToken: string,
    publicKey?: string
  ): Promise<Array<{ dataPointId: string; verificationLevel: ZKPDataPoint['verificationLevel'] }> | null> {
    try {
      const pnIdentifier = await this.getPnIdentifier(identityId, credentials, publicKey);

      const path = `/api/users/${pnIdentifier}/zkp-data-points`;
      const response = await ownerGet(authToken, path, { pnIdentifier });

      if (response.ok) {
        const responseData = await response.json();
        // API returns { success: true, dataPoints: [...] }
        const dataPoints = responseData.dataPoints || [];
        if (!Array.isArray(dataPoints)) {
          console.error('Invalid dataPoints format:', responseData);
          return [];
        }
        return dataPoints.map((dp: any) => ({
          dataPointId: String(dp.dataPointId),
          verificationLevel: (dp.verificationLevel === 'verified' || dp.verificationLevel === 'enhanced'
            ? dp.verificationLevel
            : 'basic') as ZKPDataPoint['verificationLevel'],
        }));
      } else if (response.status === 404) {
        // No sheet / no points yet
        return [];
      } else if (response.status === 409 || response.status === 401) {
        // Layout or cloud token not ready — do not treat as empty attestation set
        return null;
      } else {
        const errorText = await response.text();
        console.error('Failed to get data points:', response.status, errorText);
        return null;
      }
    } catch (error) {
      console.error('Error getting data points from API:', error);
      return null;
    }
  }

  /**
   * Get specific data point from API server
   */
  static async getDataPoint(
    identityId: string,
    credentials: { pnName: string; passcode: string },
    authToken: string,
    dataPointId: string,
    publicKey?: string
  ): Promise<ZKPDataPoint | null> {
    try {
      const pnIdentifier = await this.getPnIdentifier(identityId, credentials, publicKey);

      const path = `/api/users/${pnIdentifier}/zkp-data-points/${dataPointId}`;
      const response = await ownerGet(authToken, path, { pnIdentifier });

      if (response.ok) {
        const responseData = await response.json();
        // Handle both { success: true, proof: {...} } and direct object responses
        return responseData.proof || responseData;
      } else if (response.status === 404) {
        return null;
      } else {
        const errorText = await response.text();
        console.error('Failed to get data point:', response.status, errorText);
        throw new Error(`Failed to get data point: ${errorText}`);
      }
    } catch (error) {
      console.error('Error getting data point from API:', error);
      throw error;
    }
  }

  /**
   * Save data point to API server (Google Drive) - NO localStorage
   */
  static async saveDataPoint(
    identityId: string,
    credentials: { pnName: string; passcode: string },
    authToken: string,
    dataPoint: ZKPDataPoint,
    publicKey?: string
  ): Promise<void> {
    try {
      const pnIdentifier = await this.getPnIdentifier(identityId, credentials, publicKey);

      const path = `/api/users/${pnIdentifier}/zkp-data-points/${dataPoint.dataPointId}`;
      const response = await ownerFetch(authToken, 'PUT', path, dataPoint, { pnIdentifier });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to save data point:', response.status, errorText);
        throw new Error(`Failed to save data point: ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ Successfully saved data point to Google Drive:', result);
    } catch (error) {
      console.error('Error saving data point to API:', error);
      throw error;
    }
  }

  /**
   * Check if data point exists
   */
  static async hasDataPoint(
    identityId: string,
    credentials: { pnName: string; passcode: string },
    authToken: string,
    dataPointId: string,
    publicKey?: string
  ): Promise<boolean> {
    const dataPoint = await this.getDataPoint(identityId, credentials, authToken, dataPointId, publicKey);
    return dataPoint !== null;
  }
}
