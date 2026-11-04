import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';
import { bytesToBase64 } from '@par-noir/dm-crypto';
import { KNOWLEDGE_CLAIM_TEMPLATE_IDS, requireTemplate } from '@par-noir/pen-protocol';

const drive = vi.hoisted(() => ({
  library: [] as Record<string, unknown>[],
  docs: new Map<string, { manifest: unknown; chain: unknown; currentSections: { slug: string; ciphertext: string }[] }>(),
  groups: [] as Array<{ groupId: string; wrappedChatKey?: string }>,
}));

vi.mock('./penDriveTree.js', () => ({
  readLibraryIndex: async () => drive.library,
  upsertLibrarySummary: async (_t: string, _p: string, summary: Record<string, unknown>) => {
    drive.library = [summary, ...drive.library.filter((r) => r.docId !== summary.docId)];
  },
  writePenDocFiles: async (p: { docId: string; manifest: unknown; chain: unknown; currentSections: [] }) => {
    drive.docs.set(p.docId, { manifest: p.manifest, chain: p.chain, currentSections: p.currentSections });
  },
  readDocTree: async (p: { docId: string }) => {
    const doc = drive.docs.get(p.docId);
    return doc ? { ...doc, drafts: [] } : null;
  },
  removePenDoc: async (_t: string, _p: string, docId: string) => {
    drive.library = drive.library.filter((r) => r.docId !== docId);
    drive.docs.delete(docId);
  },
}));

vi.mock('./deviceSocial.js', () => ({
  appendDeviceGroupRow: async (_t: string, _s: string, row: { groupId: string; wrappedChatKey?: string }) => {
    drive.groups.push(row);
  },
  listDeviceGroups: async () => drive.groups,
}));

const { listDeviceKnowledgeClaims, readKnowledgeClaimSource, writeKnowledgeClaimDoc } = await import(
  './knowledgeClaimDoc.js'
);

const target = { accessToken: 'google-token', pnFolderId: 'pn-folder', groupsSheetId: 'groups-sheet' };
const signingKeys = mlDsa65Keygen();
const kem = ml_kem768.keygen(crypto.getRandomValues(new Uint8Array(64)));
const mlKemSecretKey = bytesToBase64(kem.secretKey);

function attestAge(dateOfBirth: string, proof: string) {
  return writeKnowledgeClaimDoc({
    ...target,
    ownerPnIdentifier: 'pn-owner',
    template: requireTemplate(KNOWLEDGE_CLAIM_TEMPLATE_IDS.age),
    sourceDataPointId: 'age_attestation',
    source: { dateOfBirth },
    claims: [
      { dataPointId: 'age_attestation', proofRef: `${proof}-0`, proofType: 'age_verification', verificationLevel: 'basic' },
      { dataPointId: 'over_18', proofRef: `${proof}-1`, proofType: 'age_verification', verificationLevel: 'basic' },
    ],
    signingKeys,
    mlKemSecretKey,
  });
}

beforeEach(() => {
  drive.library = [];
  drive.docs.clear();
  drive.groups = [];
});

describe('knowledge claim docs on the device', () => {
  it('writes a sealed Knowledge doc whose proofs list from the manifest and whose answers open with the docKey', async () => {
    const manifest = await attestAge('1990-01-02', 'p');
    expect(drive.library).toEqual([expect.objectContaining({ docId: manifest.docId, classId: 'knowledge.claim' })]);
    const stored = drive.docs.get(manifest.docId)!;
    expect(JSON.stringify(stored)).not.toContain('1990-01-02');

    const claims = await listDeviceKnowledgeClaims(target);
    expect(claims.map((c) => [c.dataPointId, c.zkpProof, c.sourceDataPointId])).toEqual([
      ['age_attestation', 'p-0', 'age_attestation'],
      ['over_18', 'p-1', 'age_attestation'],
    ]);

    expect(
      await readKnowledgeClaimSource({ ...target, sourceDataPointId: 'age_attestation', mlKemSecretKey })
    ).toEqual({ dateOfBirth: '1990-01-02' });
  });

  it('replaces the previous doc for the same source data point on re-attest', async () => {
    const first = await attestAge('1990-01-02', 'old');
    const second = await attestAge('1991-03-04', 'new');
    expect(drive.docs.has(first.docId)).toBe(false);
    expect(drive.library.map((r) => r.docId)).toEqual([second.docId]);
    expect((await listDeviceKnowledgeClaims(target)).map((c) => c.zkpProof)).toEqual(['new-0', 'new-1']);
    expect(
      await readKnowledgeClaimSource({ ...target, sourceDataPointId: 'age_attestation', mlKemSecretKey })
    ).toEqual({ dateOfBirth: '1991-03-04' });
  });

  it('cannot open the answers with another pN key', async () => {
    await attestAge('1990-01-02', 'p');
    const other = bytesToBase64(ml_kem768.keygen(crypto.getRandomValues(new Uint8Array(64))).secretKey);
    expect(
      await readKnowledgeClaimSource({ ...target, sourceDataPointId: 'age_attestation', mlKemSecretKey: other })
    ).toBeNull();
  });
});
