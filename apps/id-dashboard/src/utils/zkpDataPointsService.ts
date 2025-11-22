/**
 * ZKP Data Points Service - API-only (no localStorage)
 * All data points are stored in Google Drive via API server
 */

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
   * Get API endpoint
   */
  private static getApiEndpoint(): string {
    return import.meta.env.VITE_API_ENDPOINT || 
           process.env.REACT_APP_API_ENDPOINT || 
           'https://api.parnoir.com';
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
      const apiEndpoint = this.getApiEndpoint();

      const response = await fetch(
        `${apiEndpoint}/api/users/${pnIdentifier}/zkp-data-points`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        }
      );

      if (response.ok) {
        const responseData = await response.json();
        // Handle both { success: true, dataPoints: [...] } and direct array responses
        const dataPoints = Array.isArray(responseData) ? responseData : (responseData.dataPoints || []);
        return Array.isArray(dataPoints) ? dataPoints.map((dp: any) => dp.dataPointId || dp) : [];
      } else if (response.status === 404) {
        // No data points yet - return empty array
        return [];
      } else {
        const errorText = await response.text();
        console.error('Failed to get data points:', response.status, errorText);
        throw new Error(`Failed to get data points: ${errorText}`);
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
      const apiEndpoint = this.getApiEndpoint();

      const response = await fetch(
        `${apiEndpoint}/api/users/${pnIdentifier}/zkp-data-points/${dataPointId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        }
      );

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
      const apiEndpoint = this.getApiEndpoint();

      const response = await fetch(
        `${apiEndpoint}/api/users/${pnIdentifier}/zkp-data-points/${dataPoint.dataPointId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify(dataPoint)
        }
      );

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

