import { generateZkProofEnvelopeV1 } from '@par-noir/zk-protocol-v1';
import type { DataPointProposal, StandardDataPoint, ZKPGenerationRequest, ZKPProof } from '../types/DataPointTypes';
import { STANDARD_DATA_POINTS } from '../types/StandardDataPointsRegistry';
import { DataPointProposalManager } from './DataPointProposal';
import { loadMlDsaKeypairForZk } from './zkPqcSigning';

// ZKP Generation — browser-safe v1 envelope with ML-DSA binding.
export class ZKPGenerator {
  /**
   * Generate ZKP for a standard data point (ML-DSA–bound STARK envelope).
   */
  static async generateZKP(request: ZKPGenerationRequest): Promise<ZKPProof> {
    if (!request.identityId || !request.encryptedIdentity) {
      throw new Error(
        'ZKP generation requires identityId and encryptedIdentity (unlock and use a stored identity with ML-DSA keys).'
      );
    }

    const dataPoint = STANDARD_DATA_POINTS[request.dataPointId];
    if (!dataPoint) {
      throw new Error(`Unknown data point: ${request.dataPointId}`);
    }

    this.validateUserData(dataPoint, request.userData);

    const { mlDsaSecretKey, mlDsaPublicKey } = await loadMlDsaKeypairForZk(
      request.identityId,
      request.encryptedIdentity
    );

    const public_inputs = this.buildPublicInputs(
      dataPoint.zkpType,
      request.dataPointId,
      request.userData,
      request.verificationLevel
    );

    const expiresAtMs = request.expirationDays
      ? Date.now() + request.expirationDays * 24 * 60 * 60 * 1000
      : Date.now() + 365 * 24 * 60 * 60 * 1000;

    const context = `par-noir.zkp.${request.dataPointId}`;
    const proof = generateZkProofEnvelopeV1({
      mlDsaSecretKey,
      mlDsaPublicKey,
      context,
      public_inputs,
      expiresAtMs,
    });

    const zkpProof: ZKPProof = {
      dataPointId: request.dataPointId,
      proofType: dataPoint.zkpType,
      proof,
      signature: proof,
      timestamp: new Date().toISOString(),
      expiresAt: request.expirationDays
        ? new Date(expiresAtMs).toISOString()
        : undefined,
      verificationLevel: request.verificationLevel,
      metadata: {
        requestedBy: 'system',
        userConsent: true,
        dataProvided: Object.keys(request.userData ?? {}),
      },
    };

    return zkpProof;
  }

  /** Predicate-facing fields only — no raw PII (names, email, phone, DOB). */
  private static buildPublicInputs(
    zkpType: string,
    dataPointId: string,
    userData: Record<string, unknown>,
    verificationLevel: string
  ): Record<string, unknown> {
    const base: Record<string, unknown> = {
      data_point_id: dataPointId,
      zkp_type: zkpType,
      verification_level: verificationLevel,
    };

    switch (zkpType) {
      case 'age_verification': {
        const dob = typeof userData.dateOfBirth === 'string' ? userData.dateOfBirth : '';
        return { ...base, age_bucket: this.calculateAgeRange(dob) };
      }
      case 'email_verification': {
        const email = typeof userData.email === 'string' ? userData.email : '';
        const domain = email.includes('@') ? email.split('@')[1] ?? '' : '';
        return { ...base, email_domain: domain };
      }
      case 'phone_verification': {
        const phone = typeof userData.phone === 'string' ? userData.phone : '';
        const country =
          phone.startsWith('+') && phone.length > 1 ? phone.split(/[\s-]/)[0]?.replace('+', '') || 'unknown' : 'unknown';
        return { ...base, phone_country_hint: country };
      }
      case 'location_verification':
        return {
          ...base,
          country: typeof userData.country === 'string' ? userData.country : '',
          region: typeof userData.region === 'string' ? userData.region : '',
        };
      case 'identity_attestation':
        return {
          ...base,
          disclosure: 'legal_name_attested',
        };
      case 'identity_verification':
        return {
          ...base,
          disclosure: 'identity_document_attested',
          document_type: typeof userData.documentType === 'string' ? userData.documentType : '',
        };
      case 'preference_disclosure':
        return { ...base, category_keys: Object.keys(userData).sort() };
      case 'compliance_attestation':
        return { ...base, compliance_key: Object.keys(userData)[0] ?? '' };
      case 'custom_proof':
        return { ...base, custom_keys: Object.keys(userData).sort() };
      default:
        return { ...base, custom_keys: Object.keys(userData).sort() };
    }
  }

  private static validateUserData(dataPoint: StandardDataPoint, userData: any): void {
    if (dataPoint.requiredFields) {
      for (const field of dataPoint.requiredFields) {
        if (!userData[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
    }

    if (dataPoint.validation) {
      if (dataPoint.validation.required && !userData) {
        throw new Error('Data is required');
      }

      if (dataPoint.validation.pattern && typeof userData === 'string') {
        if (!dataPoint.validation.pattern.test(userData)) {
          throw new Error(`Data does not match required pattern`);
        }
      }

    }
  }

  private static calculateAgeRange(dateOfBirth: string): string {
    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();

    if (age < 18) return 'under_18';
    if (age < 21) return '18_20';
    if (age < 25) return '21_24';
    if (age < 30) return '25_29';
    if (age < 40) return '30_39';
    if (age < 50) return '40_49';
    if (age < 60) return '50_59';
    return '60_plus';
  }

  static async proposeDataPoint(
    proposal: Omit<DataPointProposal, 'id' | 'proposedAt' | 'status' | 'votes'>,
    identityId: string,
    pnName: string,
    passcode: string
  ): Promise<{ success: boolean; proposalId?: string; error?: string }> {
    return DataPointProposalManager.proposeDataPoint(proposal, identityId, pnName, passcode);
  }

  static async getPendingProposals(
    identityId: string,
    pnName: string,
    passcode: string
  ): Promise<DataPointProposal[]> {
    void pnName;
    void passcode;
    const all = await DataPointProposalManager.getProposals(identityId);
    return all.filter((p) => p.status === 'pending');
  }
}
