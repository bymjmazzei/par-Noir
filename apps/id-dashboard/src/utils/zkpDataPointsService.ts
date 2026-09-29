/**
 * ZKP Data Points Service - API-only (no localStorage)
 * All data points are stored in Google Drive via API server
 */

import { appendSheetValues, listDeviceZkpPoints, readSheetValues, writeSheetValues } from '@par-noir/device-cloud-credentials';
import { sessionDriveFor } from '../services/sessionDrive';

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

      const drive = await sessionDriveFor(pnIdentifier, authToken);
      const sheetId = drive.index.sheetIds['zkp-data-points'];
      if (!sheetId) return null;
      const dataPoints = await listDeviceZkpPoints(drive.accessToken, sheetId);
      return dataPoints.map((dp) => ({
        dataPointId: String(dp.dataPointId),
        verificationLevel: (dp.verificationLevel === 'verified' || dp.verificationLevel === 'enhanced'
          ? dp.verificationLevel
          : 'basic') as ZKPDataPoint['verificationLevel'],
      }));
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

      const drive = await sessionDriveFor(pnIdentifier, authToken);
      const sheetId = drive.index.sheetIds['zkp-data-points'];
      if (!sheetId) return null;
      const rows = await listDeviceZkpPoints(drive.accessToken, sheetId);
      return (rows.find((row) => row.dataPointId === dataPointId) as ZKPDataPoint | undefined) || null;
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

      const drive = await sessionDriveFor(pnIdentifier, authToken);
      const sheetId = drive.index.sheetIds['zkp-data-points'];
      if (!sheetId) throw new Error('cloud_on_device');
      const existing = await readSheetValues(drive.accessToken, sheetId, 'Data Points!A2:L');
      const now = new Date().toISOString();
      const values = [
        dataPoint.dataPointId,
        dataPoint.proofType,
        dataPoint.zkpProof,
        dataPoint.signature,
        dataPoint.verifiedAt,
        dataPoint.expiresAt || '',
        dataPoint.verificationLevel,
        dataPoint.metadata.provider,
        dataPoint.metadata.fraudPreventionScore?.toString() || '',
        dataPoint.encryptedUserData || '',
        now,
        now,
      ];
      const idx = existing.findIndex((row) => row[0] === dataPoint.dataPointId);
      if (idx >= 0) {
        values[10] = existing[idx][10] || now;
        await writeSheetValues(
          drive.accessToken,
          sheetId,
          `Data Points!A${idx + 2}:L${idx + 2}`,
          [values]
        );
      } else {
        await appendSheetValues(drive.accessToken, sheetId, 'Data Points!A:L', [values]);
      }
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
