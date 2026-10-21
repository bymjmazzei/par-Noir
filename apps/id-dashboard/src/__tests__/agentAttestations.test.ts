/**
 * @jest-environment jsdom
 *
 * AI agent attestations are computed on this device from stored proofs. Only yes/no,
 * level and expiry are produced; the proof, its public inputs and encrypted user data
 * (birthdate, names) never reach the draft Unlock signs or the API.
 */
const listDeviceZkpPoints = jest.fn();
const verifyZkProofEnvelopeV1 = jest.fn();

jest.mock('@par-noir/device-cloud-credentials', () => ({
  listDeviceZkpPoints: (...a: unknown[]) => listDeviceZkpPoints(...a),
}));

jest.mock('@par-noir/zk-protocol-v1', () => ({
  verifyZkProofEnvelopeV1: (...a: unknown[]) => verifyZkProofEnvelopeV1(...a),
  decodeEnvelopeFromProofString: (proof: string) => {
    try {
      return JSON.parse(Buffer.from(proof, 'base64').toString('utf8'));
    } catch {
      return null;
    }
  },
}));

const sessionDriveFor = jest.fn(async (..._a: unknown[]) => ({
  accessToken: 'google-token',
  index: { sheetIds: { 'zkp-data-points': 'sheet-zkp' } },
}));
jest.mock('../services/sessionDrive', () => ({
  sessionDriveFor: (...a: unknown[]) => sessionDriveFor(...a),
}));

import {
  attestationFromProof,
  attestationsFromProofs,
  buildAgentDelegationDraft,
  loadAgentAttestations,
} from '../services/agentAttestations';

const NOW = Date.parse('2026-10-21T13:00:00.000Z');
const EXPIRES = Date.parse('2027-10-21T13:00:00.000Z');
const DOB = '1990-04-02';

function envelope(id: string, publicInputs: Record<string, unknown>, context = `par-noir.zkp.${id}`): string {
  return Buffer.from(
    JSON.stringify({
      context,
      expires_at_ms: EXPIRES,
      public_inputs: { data_point_id: id, ...publicInputs },
    })
  ).toString('base64');
}

const ROWS = [
  {
    dataPointId: 'age_attestation',
    zkpProof: envelope('age_attestation', { age_bucket: '30_39' }),
    verificationLevel: 'basic',
    encryptedUserData: `enc(${DOB})`,
  },
  { dataPointId: 'over_18', zkpProof: envelope('over_18', { over_18: true, over_21: false }), verificationLevel: 'verified' },
  { dataPointId: 'over_21', zkpProof: envelope('over_21', { over_18: true, over_21: false }), verificationLevel: 'basic' },
  {
    dataPointId: 'name_attestation',
    zkpProof: envelope('name_attestation', { disclosure: 'legal_name_attested' }),
    verificationLevel: 'basic',
    encryptedUserData: 'enc(Jane Doe)',
  },
  { dataPointId: 'email_verification', zkpProof: envelope('email_verification', { email_domain: 'example.com' }) },
];

beforeEach(() => {
  jest.clearAllMocks();
  verifyZkProofEnvelopeV1.mockReturnValue({ ok: true });
  listDeviceZkpPoints.mockResolvedValue(ROWS);
});

describe('attestationFromProof', () => {
  it('reads the threshold predicate for over_18 / over_21', () => {
    expect(attestationFromProof(ROWS[1], NOW)).toEqual({
      dataPointId: 'over_18',
      satisfied: true,
      level: 'verified',
      expiresAt: new Date(EXPIRES).toISOString(),
    });
    expect(attestationFromProof(ROWS[2], NOW)).toMatchObject({ dataPointId: 'over_21', satisfied: false, level: 'attested' });
  });

  it('never attests the raw birthdate row', () => {
    expect(attestationFromProof(ROWS[0], NOW)).toBeNull();
  });

  it('refuses proofs that do not verify, are expired, or belong to another data point', () => {
    verifyZkProofEnvelopeV1.mockReturnValueOnce({ ok: false, reason: 'expired' });
    expect(attestationFromProof(ROWS[1], NOW)).toBeNull();
    expect(
      attestationFromProof({ dataPointId: 'over_21', zkpProof: envelope('over_18', { over_21: true }) }, NOW)
    ).toBeNull();
    expect(
      attestationFromProof(
        { dataPointId: 'over_21', zkpProof: envelope('over_21', { over_21: true }, 'par-noir.zkp.over_18') },
        NOW
      )
    ).toBeNull();
    expect(attestationFromProof({ dataPointId: 'over_21' }, NOW)).toBeNull();
  });
});

describe('loadAgentAttestations', () => {
  it('reads the same zkp sheet the Privacy panel uses and returns only four fields per proof', async () => {
    const list = await loadAgentAttestations('root', 'api-token', NOW);
    expect(sessionDriveFor).toHaveBeenCalledWith('pn-root', 'api-token');
    expect(listDeviceZkpPoints).toHaveBeenCalledWith('google-token', 'sheet-zkp');
    expect(list.map((a) => a.dataPointId).sort()).toEqual(['email_verification', 'name_attestation', 'over_18', 'over_21']);
    for (const a of list) {
      expect(Object.keys(a).sort()).toEqual(['dataPointId', 'expiresAt', 'level', 'satisfied']);
    }
  });

  it('returns nothing when the zkp sheet is not set up', async () => {
    sessionDriveFor.mockResolvedValueOnce({ accessToken: 'g', index: { sheetIds: {} } } as never);
    expect(await loadAgentAttestations('pn-root', 'api-token', NOW)).toEqual([]);
  });
});

describe('buildAgentDelegationDraft', () => {
  const random = (n: number) => new Uint8Array(n).fill(9);

  it('carries only the picked attestations, and only with ai:proofs', () => {
    const held = attestationsFromProofs(ROWS, NOW);
    const draft = buildAgentDelegationDraft({
      scopes: ['ai:files.published', 'ai:proofs'],
      held,
      picked: ['over_21'],
      now: NOW,
      random,
    });
    expect(draft.attestations).toEqual([
      { dataPointId: 'over_21', satisfied: false, level: 'attested', expiresAt: new Date(EXPIRES).toISOString() },
    ]);
    expect(draft.issuedAt).toBe(new Date(NOW).toISOString());
    expect(draft.expiresAt).toBeNull();
    expect(draft.nonce.length).toBeGreaterThanOrEqual(16);

    const noProofs = buildAgentDelegationDraft({ scopes: ['ai:files.published'], held, picked: ['over_21'], now: NOW, random });
    expect(noProofs.attestations).toEqual([]);
  });

  it('never carries raw values, proofs or encrypted user data', () => {
    const held = attestationsFromProofs(ROWS, NOW);
    const draft = buildAgentDelegationDraft({
      scopes: ['ai:proofs'],
      held,
      picked: ['over_18', 'over_21', 'name_attestation', 'email_verification', 'age_attestation'],
      now: NOW,
      random,
    });
    const wire = JSON.stringify(draft);
    for (const leak of [DOB, 'Jane', 'enc(', 'example.com', '30_39', 'age_bucket', 'public_inputs', 'zkpProof', 'age_attestation']) {
      expect(wire).not.toContain(leak);
    }
  });
});
