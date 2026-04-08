'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { generateZkProofEnvelopeV2, verifyZkProofEnvelopeV2 } = require('../dist/index.js');
const { mlDsa65Keygen } = require('@par-noir/pqc-crypto/ml-dsa');

test('v2 envelope round-trips generate → verify', () => {
  const kp = mlDsa65Keygen();
  const proof = generateZkProofEnvelopeV2({
    mlDsaSecretKey: kp.secretKey,
    mlDsaPublicKey: kp.publicKey,
    context: 'par_noir:test:ctx',
    public_inputs: {
      data_point_id: 'age_attestation',
      zkp_type: 'age_verification',
      verification_level: 'verified',
      age_bucket: '30_39',
    },
    expiresAtMs: Date.now() + 3600_000,
  });
  const r = verifyZkProofEnvelopeV2(proof);
  assert.strictEqual(r.ok, true);
});

test('legacy JSON age blob fails verification', () => {
  const legacy = Buffer.from(
    JSON.stringify({
      type: 'age_verification',
      ageRange: '30_39',
      verificationLevel: 'verified',
    }),
    'utf8'
  ).toString('base64');
  assert.strictEqual(verifyZkProofEnvelopeV2(legacy).ok, false);
});

test('tampered proof fails', () => {
  const kp = mlDsa65Keygen();
  const proof = generateZkProofEnvelopeV2({
    mlDsaSecretKey: kp.secretKey,
    mlDsaPublicKey: kp.publicKey,
    context: 'par_noir:test:ctx',
    public_inputs: { data_point_id: 'x', zkp_type: 'custom_proof', verification_level: 'basic' },
    expiresAtMs: Date.now() + 3600_000,
  });
  const broken = proof.slice(0, -4) + 'AAAA';
  assert.strictEqual(verifyZkProofEnvelopeV2(broken).ok, false);
});

test('non-base64 input fails verification', () => {
  assert.strictEqual(verifyZkProofEnvelopeV2('{not-base64}').ok, false);
});
