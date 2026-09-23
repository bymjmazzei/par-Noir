'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  generateZkProofEnvelopeV2,
  verifyZkProofEnvelopeV2,
  decodeEnvelopeFromProofString,
  OPEN_CREATOR_CONTRACT_CONTEXT_V1,
  buildOpenContractPublicInputs,
  commitSplits,
  isOpenContractPublicInputsV1
} = require('../dist/index.js');
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

test('open creator contract public_inputs round-trip in v2 envelope', () => {
  const kp = mlDsa65Keygen();
  const splits = [
    { holderPnHash: 'hash_a', role: 'author', shareBps: 7000 },
    { holderPnHash: 'hash_b', role: 'label', shareBps: 3000 }
  ];
  const commitment = commitSplits(splits);
  const public_inputs = buildOpenContractPublicInputs({
    assetId: 'tpl_social.note.basic',
    party: 'content_rights',
    claimBps: 10000,
    splits,
    workLicense: 'all-rights-reserved',
    holderPnHash: 'hash_a',
    expiresAtMs: Date.now() + 86400_000
  });
  assert.strictEqual(public_inputs.splits_commitment, commitment);
  assert.strictEqual(isOpenContractPublicInputsV1(public_inputs), true);

  const proof = generateZkProofEnvelopeV2({
    mlDsaSecretKey: kp.secretKey,
    mlDsaPublicKey: kp.publicKey,
    context: OPEN_CREATOR_CONTRACT_CONTEXT_V1,
    public_inputs,
    expiresAtMs: public_inputs.expires_at_ms
  });
  const r = verifyZkProofEnvelopeV2(proof);
  assert.strictEqual(r.ok, true);
  const env = decodeEnvelopeFromProofString(proof);
  assert.ok(env && typeof env === 'object');
  assert.strictEqual(env.context, OPEN_CREATOR_CONTRACT_CONTEXT_V1);
  assert.strictEqual(env.public_inputs.asset_id, 'tpl_social.note.basic');
  assert.strictEqual(env.public_inputs.claim_bps, 10000);
  assert.strictEqual(env.public_inputs.splits_commitment, commitment);
});
