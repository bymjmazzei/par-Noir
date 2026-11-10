/**
 * @jest-environment jsdom
 *
 * Attestations are Pen Knowledge claim docs: an unlock-app session (no Key 1 / Key 2) signs
 * with the handed-over ML-DSA pair and seals with its ML-KEM key, and re-key rewrites every doc
 * under the successor.
 */
const writeKnowledgeClaimDoc = jest.fn(async (..._a: unknown[]) => ({}));
const listDeviceKnowledgeClaims = jest.fn();
const readKnowledgeClaimSource = jest.fn();
const heldProofsFor = jest.fn(async (..._a: unknown[]) => [] as unknown[]);

jest.mock('@par-noir/device-cloud-credentials', () => ({
  writeKnowledgeClaimDoc: (...a: unknown[]) => writeKnowledgeClaimDoc(...a),
  listDeviceKnowledgeClaims: (...a: unknown[]) => listDeviceKnowledgeClaims(...a),
  readKnowledgeClaimSource: (...a: unknown[]) => readKnowledgeClaimSource(...a),
  heldProofsFor: (...a: unknown[]) => heldProofsFor(...a),
  grantedDataPointIds: (perms: Record<string, { status?: string; dataPoints?: string[]; requiredDataPoints?: string[] }>) =>
    new Set(
      Object.values(perms || {})
        .filter((g) => g.status === 'active')
        .flatMap((g) => [...(g.dataPoints || []), ...(g.requiredDataPoints || [])])
    ),
}));

const jsonResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const ownerGet = jest.fn(async (..._a: unknown[]) => jsonResponse({ permissions: {} }));
const ownerFetch = jest.fn(async (..._a: unknown[]) => jsonResponse({ released: 0 }));
jest.mock('../services/ownerApiService', () => ({
  ownerGet: (...a: unknown[]) => ownerGet(...a),
  ownerFetch: (...a: unknown[]) => ownerFetch(...a),
}));

jest.mock('../services/sessionDrive', () => ({
  sessionDriveFor: jest.fn(async () => ({
    accessToken: 'google-token',
    index: { pnFolderId: 'pn-folder', sheetIds: { groups: 'groups-sheet' } },
  })),
}));

const getCredentials = jest.fn((..._a: unknown[]) => null);
jest.mock('@par-noir/identity-crypto', () => ({
  IdentityCrypto: {},
  SecureCredentialManager: { getCredentials: (...a: unknown[]) => getCredentials(...a) },
}));

jest.mock('../services/resolveIdentityMlKem', () => ({
  resolveIdentityMlKemSecret: jest.fn(async () => null),
}));

const reissueZkProofsFromEnvelopes = jest.fn();
jest.mock('@par-noir/identity-migration', () => ({
  reissueZkProofsFromEnvelopes: (...a: unknown[]) => reissueZkProofsFromEnvelopes(...a),
}));

import { KNOWLEDGE_CLAIM_TEMPLATE_IDS, requireTemplate } from '@par-noir/pen-protocol';
import { STANDARD_DATA_POINTS } from '@par-noir/standard-data-points';
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';
import { bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { deriveCanonicalPnIdentifier } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import {
  attestFromTemplate,
  buildAgeDerivedPayloads,
  reissueKnowledgeClaims,
  releaseGrantedProofs,
  resolveAttestationKeys,
} from '../services/knowledgeAttestation';
import { clearShellKeys, rememberShellMlKem, rememberShellSigningKeys } from '../services/shellKeys';

Object.defineProperty(globalThis, 'crypto', {
  value: (require('node:crypto') as typeof import('node:crypto')).webcrypto,
  configurable: true,
});

const signing = mlDsa65Keygen();
const publicKey = bytesToBase64(signing.publicKey);

beforeEach(() => {
  jest.clearAllMocks();
  clearShellKeys();
});

describe('knowledge claim templates', () => {
  it('only name data points the standard catalog defines', () => {
    for (const id of Object.values(KNOWLEDGE_CLAIM_TEMPLATE_IDS)) {
      const form = requireTemplate(id).knowledgeForm!;
      for (const dp of [form.sourceDataPointId, ...form.derivedDataPointIds].filter(Boolean)) {
        expect(STANDARD_DATA_POINTS[dp]).toBeDefined();
      }
    }
  });
});

describe('attestFromTemplate', () => {
  it('attests age from an unlock-app session with no Key 1 or Key 2', async () => {
    rememberShellSigningKeys(['did:pn:session'], {
      mlDsaSecretKey: bytesToBase64(signing.secretKey),
      mlDsaPublicKey: publicKey,
    });
    rememberShellMlKem(['did:pn:session'], 'ml-kem-secret');

    const keys = await resolveAttestationKeys({ identityId: 'did:pn:session', publicKey });
    expect(getCredentials).not.toHaveBeenCalled();
    expect(keys.pnIdentifier).toBe(deriveCanonicalPnIdentifier(publicKey));
    const ids = await attestFromTemplate({
      keys,
      authToken: 'api-token',
      dataPointId: 'age_attestation',
      userData: { dateOfBirth: '1990-01-02' },
    });

    expect(ids).toEqual(['age_attestation', 'over_18', 'over_21']);
    const call = writeKnowledgeClaimDoc.mock.calls[0]![0] as Record<string, any>;
    expect(call).toMatchObject({
      accessToken: 'google-token',
      pnFolderId: 'pn-folder',
      groupsSheetId: 'groups-sheet',
      ownerPnIdentifier: keys.pnIdentifier,
      sourceDataPointId: 'age_attestation',
      source: { dateOfBirth: '1990-01-02' },
      mlKemSecretKey: 'ml-kem-secret',
    });
    expect(call.template.id).toBe(KNOWLEDGE_CLAIM_TEMPLATE_IDS.age);
    expect(call.claims.every((c: { proofRef: string }) => c.proofRef.length > 0)).toBe(true);
    expect(JSON.stringify(call.claims)).not.toContain('1990-01-02');
  });

  it('derives over_18 / over_21 from the birth date, not from its presence', () => {
    const yearsAgo = (n: number) => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - n);
      d.setDate(d.getDate() + 2);
      return d.toISOString().slice(0, 10);
    };
    expect(buildAgeDerivedPayloads(yearsAgo(19))).toEqual({ over_18: { over18: true }, over_21: { over21: false } });
    expect(buildAgeDerivedPayloads(yearsAgo(18))).toEqual({ over_18: { over18: false }, over_21: { over21: false } });
    expect(buildAgeDerivedPayloads('1990-01-02')).toEqual({ over_18: { over18: true }, over_21: { over21: true } });
  });

  it('labels verified claims with the stripe_identity provider by default', async () => {
    rememberShellSigningKeys(['did:pn:verified'], {
      mlDsaSecretKey: bytesToBase64(signing.secretKey),
      mlDsaPublicKey: publicKey,
    });
    rememberShellMlKem(['did:pn:verified'], 'ml-kem-secret');
    const keys = await resolveAttestationKeys({ identityId: 'did:pn:verified', publicKey });
    await attestFromTemplate({
      keys,
      authToken: 'api-token',
      dataPointId: 'age_attestation',
      userData: { dateOfBirth: '1990-01-02' },
      verificationLevel: 'verified',
    });
    const call = writeKnowledgeClaimDoc.mock.calls[0]![0] as Record<string, any>;
    expect(call.claims.every((c: { provider: string }) => c.provider === 'stripe_identity')).toBe(true);
  });

  it('asks for the unlock app when no signing key is held', async () => {
    await expect(resolveAttestationKeys({ identityId: 'did:pn:none', publicKey })).rejects.toThrow(
      /unlock again with the unlock app/
    );
  });
});

describe('releaseGrantedProofs', () => {
  it('releases held proofs only for data points an active grant covers', async () => {
    ownerGet.mockResolvedValueOnce(
      jsonResponse({
        permissions: {
          shop: { status: 'active', dataPoints: ['over_21'], requiredDataPoints: ['email'] },
          old: { status: 'revoked', dataPoints: ['phone'] },
        },
      })
    );
    const proof = { dataPointId: 'over_21', zkpProof: 'p' };
    heldProofsFor.mockResolvedValueOnce([proof]);
    ownerFetch.mockResolvedValueOnce(jsonResponse({ released: 1 }));

    await expect(releaseGrantedProofs('pn-owner', 'api-token')).resolves.toBe(1);

    const { dataPointIds, accessToken } = heldProofsFor.mock.calls[0]![0] as {
      dataPointIds: Set<string>;
      accessToken: string;
    };
    expect([...dataPointIds].sort()).toEqual(['email', 'over_21']);
    expect(accessToken).toBe('google-token');
    expect(ownerFetch).toHaveBeenCalledWith(
      'api-token',
      'PUT',
      '/api/users/pn-owner/released-proofs',
      { proofs: [proof] },
      { pnIdentifier: 'pn-owner' }
    );
  });

  it('clears released proofs without reading the cloud when nothing is granted', async () => {
    await releaseGrantedProofs('pn-owner', 'api-token');
    expect(heldProofsFor).not.toHaveBeenCalled();
    expect(ownerFetch).toHaveBeenCalledWith(
      'api-token',
      'PUT',
      '/api/users/pn-owner/released-proofs',
      { proofs: [] },
      { pnIdentifier: 'pn-owner' }
    );
  });
});

describe('reissueKnowledgeClaims', () => {
  it('rewrites each doc under the successor, reading answers with the predecessor key', async () => {
    listDeviceKnowledgeClaims.mockResolvedValue([
      {
        docId: 'd1',
        templateId: KNOWLEDGE_CLAIM_TEMPLATE_IDS.age,
        sourceDataPointId: 'age_attestation',
        dataPointId: 'age_attestation',
        proofType: 'age_verification',
        zkpProof: 'old-0',
        verificationLevel: 'basic',
        provider: 'user_attested',
        verifiedAt: '2026-01-01T00:00:00Z',
      },
      {
        docId: 'd1',
        templateId: KNOWLEDGE_CLAIM_TEMPLATE_IDS.age,
        sourceDataPointId: 'age_attestation',
        dataPointId: 'over_18',
        proofType: 'threshold_age',
        zkpProof: 'old-1',
        verificationLevel: 'basic',
        provider: 'user_attested',
        verifiedAt: '2026-01-01T00:00:00Z',
      },
    ]);
    readKnowledgeClaimSource.mockResolvedValue({ dateOfBirth: '1990-01-02' });
    reissueZkProofsFromEnvelopes.mockResolvedValue([
      { dataPointId: 'age_attestation', proof: 'new-0' },
      { dataPointId: 'over_18', proof: 'new-1' },
    ]);
    const successor = {
      pnIdentifier: 'pn-successor',
      publicKey,
      signing: { mlDsaSecretKey: signing.secretKey, mlDsaPublicKey: signing.publicKey },
      mlKemSecretKey: 'successor-kem',
    };

    const written = await reissueKnowledgeClaims({
      authToken: 'api-token',
      drivePnIdentifier: 'pn-predecessor',
      predecessorMlKemSecretKey: 'predecessor-kem',
      successor,
    });

    expect(written).toBe(2);
    expect(readKnowledgeClaimSource).toHaveBeenCalledWith(
      expect.objectContaining({ sourceDataPointId: 'age_attestation', mlKemSecretKey: 'predecessor-kem' })
    );
    expect(writeKnowledgeClaimDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerPnIdentifier: 'pn-successor',
        mlKemSecretKey: 'successor-kem',
        source: { dateOfBirth: '1990-01-02' },
        claims: [
          expect.objectContaining({ dataPointId: 'age_attestation', proofRef: 'new-0' }),
          expect.objectContaining({ dataPointId: 'over_18', proofRef: 'new-1' }),
        ],
      })
    );
  });
});
