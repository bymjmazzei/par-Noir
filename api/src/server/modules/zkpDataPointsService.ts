/**
 * ZKP Data Points Service
 * Manages verified ZKP data points for users
 * Returns ZKP proofs without revealing actual identity data
 * Google path: Sheets by spreadsheetId from pnDriveIndex (no name search)
 */

import {
  ageBucketMeetsMinimum,
  decodeEnvelopeFromProofString,
  isZkProofEnvelopeV1,
  verifyZkProofEnvelopeV1,
} from '@par-noir/zk-protocol-v1';
import { isZkProofEnvelopeV2, verifyZkProofEnvelopeV2 } from '@par-noir/zk-protocol-v2';
import { GoogleDriveToken } from './googleOAuth2Helper';
import { isPortableStorageProvider } from './storage/storageProviderUtils';
import {
  portableTableAppend,
  portableTableGetByKey,
  portableTableScan
} from './storage/portableTableService';
import { ZKP_DATA_POINTS_SCHEMA } from './storage/tableSchemas';

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
  /** True when predecessor-key proof accepted during post-migration grace window */
  successionGraceApplied?: boolean;
}

export class ZKPDataPointsService {
  /**
   * Get ZKP data points from portable table or Google Sheets by spreadsheetId
   */
  static async getZKPDataPointsFile(
    accessToken: string,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId?: string
  ): Promise<Record<string, ZKPDataPoint> | null> {
    try {
      const normalizedUserPnIdentifier = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;

      if (await isPortableStorageProvider(normalizedUserPnIdentifier)) {
        const rows = await portableTableScan<ZKPDataPoint>(
          normalizedUserPnIdentifier,
          ZKP_DATA_POINTS_SCHEMA,
          accountId
        );
        if (rows.length === 0) return null;
        const dataPoints: Record<string, ZKPDataPoint> = {};
        for (const row of rows) {
          dataPoints[row.dataPointId] = row;
        }
        return dataPoints;
      }

      if (!spreadsheetId?.trim() || !accessToken) {
        return null;
      }

      const token: GoogleDriveToken = { access_token: accessToken };
      const { ZKPDataPointsSheetsService } = await import('./zkpDataPointsSheetsService');
      const dataPoints = await ZKPDataPointsSheetsService.getZKPDataPoints(
        token,
        spreadsheetId,
        normalizedUserPnIdentifier,
        accountId
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
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId?: string
  ): Promise<Array<{
    dataPointId: string;
    proofType: string;
    verifiedAt: string;
    expiresAt?: string;
    verificationLevel: string;
  }>> {
    const dataPoints = await this.getZKPDataPointsFile(accessToken, spreadsheetId, userPnIdentifier, accountId);
    
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
    spreadsheetId: string,
    dataPointId: string,
    userPnIdentifier: string,
    accountId?: string
  ): Promise<ZKPDataPoint | null> {
    try {
      const normalizedUserPnIdentifier = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;

      let dataPoint: ZKPDataPoint | null = null;
      if (await isPortableStorageProvider(normalizedUserPnIdentifier)) {
        dataPoint = await portableTableGetByKey<ZKPDataPoint>(
          normalizedUserPnIdentifier,
          ZKP_DATA_POINTS_SCHEMA,
          dataPointId,
          accountId
        );
      } else {
        if (!spreadsheetId?.trim() || !accessToken) {
          return null;
        }
        const token: GoogleDriveToken = { access_token: accessToken };
        const { ZKPDataPointsSheetsService } = await import('./zkpDataPointsSheetsService');
        dataPoint = await ZKPDataPointsSheetsService.getZKPDataPoint(
          token,
          spreadsheetId,
          dataPointId,
          normalizedUserPnIdentifier,
          accountId
        );
      }

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
   * Verify ZKP v2 (preferred) or v1 (legacy stored proofs). Legacy unstructured JSON blobs are rejected.
   */
  static async verifyProof(
    zkpProof: string,
    condition: string,
    opts?: { successorPnIdentifier?: string }
  ): Promise<ZKPVerificationResult> {
    try {
      const env = decodeEnvelopeFromProofString(zkpProof);
      if (!env || typeof env !== 'object') {
        return { isValid: false, condition, error: 'invalid_envelope' };
      }

      let cryptoOk: boolean;
      let cryptoReason: string | undefined;
      let expiresAtMs: number;
      let pub: Record<string, unknown>;

      if (isZkProofEnvelopeV2(env)) {
        const r = verifyZkProofEnvelopeV2(zkpProof);
        cryptoOk = r.ok;
        cryptoReason = r.reason;
        expiresAtMs = env.expires_at_ms;
        pub = env.public_inputs as Record<string, unknown>;
      } else if (isZkProofEnvelopeV1(env)) {
        const r = verifyZkProofEnvelopeV1(zkpProof);
        cryptoOk = r.ok;
        cryptoReason = r.reason;
        expiresAtMs = env.expires_at_ms;
        pub = env.public_inputs as Record<string, unknown>;
      } else {
        return { isValid: false, condition, error: 'invalid_envelope' };
      }

      if (!cryptoOk) {
        return {
          isValid: false,
          condition,
          error: cryptoReason ?? 'verify_failed',
        };
      }

      const expiresAt = new Date(expiresAtMs).toISOString();

      if (condition.startsWith('age >= ')) {
        const minAge = parseInt(condition.replace('age >= ', ''), 10);
        if (Number.isNaN(minAge)) {
          return { isValid: false, condition, error: 'invalid_condition' };
        }
        const zkpType = typeof pub.zkp_type === 'string' ? pub.zkp_type : '';
        if (zkpType !== 'age_verification') {
          return { isValid: false, condition, error: 'proof_type_mismatch' };
        }
        const bucket = typeof pub.age_bucket === 'string' ? pub.age_bucket : '';
        const isValid = ageBucketMeetsMinimum(bucket, minAge);
        return {
          isValid,
          condition,
          verifiedAt: new Date().toISOString(),
          expiresAt,
        };
      }

      let successionGraceApplied = false;
      if (opts?.successorPnIdentifier) {
        const { findLineageMigrationForSuccessor } = await import('./identityMigrationService');
        const lineage = await findLineageMigrationForSuccessor(opts.successorPnIdentifier);
        successionGraceApplied = lineage !== null;
      }

      return {
        isValid: true,
        condition,
        verifiedAt: new Date().toISOString(),
        expiresAt,
        ...(successionGraceApplied ? { successionGraceApplied: true } : {}),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Invalid proof format';
      return {
        isValid: false,
        condition,
        error: message,
      };
    }
  }

  /**
   * Store or update ZKP data point
   */
  static async storeDataPoint(
    accessToken: string,
    spreadsheetId: string,
    identifier: string,
    dataPoint: ZKPDataPoint,
    userPnIdentifier: string,
    accountId?: string
  ): Promise<void> {
    try {
      const normalizedUserPnIdentifier = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;

      if (await isPortableStorageProvider(normalizedUserPnIdentifier)) {
        await portableTableAppend(
          normalizedUserPnIdentifier,
          ZKP_DATA_POINTS_SCHEMA,
          dataPoint as unknown as Record<string, unknown>,
          accountId
        );
        return;
      }

      if (!spreadsheetId?.trim() || !accessToken) {
        throw new Error('ZKP spreadsheetId and access token are required');
      }

      const token: GoogleDriveToken = { access_token: accessToken };
      const { ZKPDataPointsSheetsService } = await import('./zkpDataPointsSheetsService');

      await ZKPDataPointsSheetsService.addZKPDataPoint(
        token,
        spreadsheetId,
        dataPoint,
        normalizedUserPnIdentifier,
        accountId
      );
    } catch (error) {
      console.error('Error storing ZKP data point in sheets:', error);
      throw error;
    }
  }
}
