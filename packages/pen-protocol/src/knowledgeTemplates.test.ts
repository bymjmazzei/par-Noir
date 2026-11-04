import { describe, expect, it } from 'vitest';
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';
import {
  KNOWLEDGE_CLAIM_TEMPLATE_IDS,
  assertKnowledgePayloadSafe,
  buildKnowledgeClaimDoc,
  getClass,
  isKnowledgeClassId,
  knowledgeSourceFromSection,
  requireTemplate,
  verifyChain
} from './index.js';

const keys = mlDsa65Keygen();

describe('knowledge claim templates', () => {
  it('registers name, age and single forms as kit-only knowledge.claim templates', () => {
    for (const id of Object.values(KNOWLEDGE_CLAIM_TEMPLATE_IDS)) {
      const t = requireTemplate(id);
      expect(t.classId).toBe('knowledge.claim');
      expect(t.knowledgeForm).toBeDefined();
      expect(t.sections.map((s) => s.slug)).toEqual(['source', 'claims']);
      expect(getClass(t.classId)?.audience).toBe('kit');
    }
    expect(requireTemplate(KNOWLEDGE_CLAIM_TEMPLATE_IDS.age).knowledgeForm?.derivedDataPointIds).toEqual([
      'over_18',
      'over_21'
    ]);
    expect(isKnowledgeClassId('knowledge.claim')).toBe(true);
    expect(isKnowledgeClassId('social.note')).toBe(false);
  });

  it('builds a genesis-signed doc whose claims carry proofs and whose source holds the raw answers', () => {
    const doc = buildKnowledgeClaimDoc({
      docId: 'pen_k1',
      groupId: 'g1',
      template: requireTemplate(KNOWLEDGE_CLAIM_TEMPLATE_IDS.age),
      authorPn: 'pn-abc',
      sourceDataPointId: 'age_attestation',
      source: { dateOfBirth: '1990-01-02' },
      claims: [
        { dataPointId: 'age_attestation', proofRef: 'p0', verificationLevel: 'basic' },
        { dataPointId: 'over_18', proofRef: 'p1', verificationLevel: 'basic' }
      ],
      secretKey: keys.secretKey,
      publicKey: keys.publicKey
    });
    expect(verifyChain(doc.chain)).toEqual({ ok: true });
    expect(doc.manifest.knowledge?.claims.map((c) => c.dataPointId)).toEqual(['age_attestation', 'over_18']);
    expect(JSON.stringify(doc.manifest)).not.toContain('1990-01-02');
    expect(knowledgeSourceFromSection(doc.sections[0])).toEqual({ dateOfBirth: '1990-01-02' });
  });

  it('rejects claims and source fields the template does not define', () => {
    const base = {
      docId: 'pen_k2',
      groupId: 'g2',
      template: requireTemplate(KNOWLEDGE_CLAIM_TEMPLATE_IDS.age),
      authorPn: 'pn-abc',
      sourceDataPointId: 'age_attestation',
      secretKey: keys.secretKey,
      publicKey: keys.publicKey
    };
    expect(() =>
      buildKnowledgeClaimDoc({
        ...base,
        source: { dateOfBirth: '1990-01-02' },
        claims: [{ dataPointId: 'full_name', proofRef: 'p' }]
      })
    ).toThrow(/knowledge_claim_not_in_template/);
    expect(() =>
      buildKnowledgeClaimDoc({
        ...base,
        source: { ssn: '1' },
        claims: [{ dataPointId: 'over_18', proofRef: 'p' }]
      })
    ).toThrow(/knowledge_source_field_not_in_template/);
  });

  it('allows catalog verification predicates but still blocks raw PII keys', () => {
    expect(() =>
      assertKnowledgePayloadSafe({ claims: [{ dataPointId: 'email_verification', proofRef: 'p' }] })
    ).not.toThrow();
    expect(() => assertKnowledgePayloadSafe({ claims: [{ dataPointId: 'email', proofRef: 'p' }] })).toThrow(
      /knowledge_raw_pii/
    );
  });
});
