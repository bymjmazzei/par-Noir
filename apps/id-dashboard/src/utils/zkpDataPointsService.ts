/**
 * ZKP Data Points Service - API-only (no localStorage)
 * All data points are stored in Google Drive via API server
 */

import { API_ENDPOINT } from '../config/api';
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
    const { VolumeIdGenerator } = await import('./crypto/volumeIdGenerator');
    return await VolumeIdGenerator.generateVolumeId({
      pnName: credentials.pnName,
      passcode: credentials.passcode,
      publicKey: publicKey || ''
    });
  }

  /**
   * Get all attested data points from API server (Google Drive)
   */
  static async getAllDataPoints(
    identityId: string,
    credentials: { pnName: string; passcode: string },
    authToken: string,
    publicKey?: string
  ): Promise<string[]> {
    try {
      const pnIdentifier = await this.getPnIdentifier(identityId, credentials, publicKey);

      const path = `/api/users/${pnIdentifier}/zkp-data-points`;
      const response = await ownerGet(authToken, path);

      if (response.ok) {
        const responseData = await response.json();
        // API returns { success: true, dataPoints: [...] }
        const dataPoints = responseData.dataPoints || [];
        if (!Array.isArray(dataPoints)) {
          console.error('Invalid dataPoints format:', responseData);
          return [];
        }
        return dataPoints.map((dp: any) => dp.dataPointId);
      } else if (response.status === 404) {
        // No data points yet - return empty array
        return [];
      } else if (response.status === 401) {
        // Authentication failed (Google Drive token expired) - fail silently
        // User needs to reconnect Google Drive, but don't break the app
        console.warn('⚠️ [ZKPDataPoints] Google Drive authentication failed. Please reconnect Google Drive in the dashboard.');
        return []; // Return empty array instead of throwing
      } else {
        const errorText = await response.text();
        console.error('Failed to get data points:', response.status, errorText);
        // For other errors, still fail silently to avoid breaking the app
        return [];
      }
    } catch (error) {
      console.error('Error getting data points from API:', error);
      throw error;
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
      const response = await ownerGet(authToken, path);

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
      const response = await ownerFetch(authToken, 'PUT', path, dataPoint);

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

