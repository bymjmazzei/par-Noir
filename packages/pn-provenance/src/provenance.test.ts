import { describe, expect, it } from 'vitest';
import { bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';
import { authorKeyId } from '@par-noir/pen-protocol';
import { buildHandleReceipt } from '@par-noir/public-names';
import {
  DEFAULT_TRAINING_PREFERENCE,
  PN_AUTHOR_SIG_TYPE,
  credentialsBadge,
  derivativeDefinition,
  ingredientFromSummary,
  parseTrainingMining,
  penDocAssertion,
  penOriginalDefinition,
  resolveOriginality,
  signAuthorCredential,
  signerDisplay,
  summarizeManifestStore,
  trainingMiningAssertion,
  verifyAuthorAssertion,
  type ManifestSummary,
} from './index.js';

const registry = mlDsa65Keygen(new Uint8Array(32).fill(1));
const REGISTRY_PK = bytesToBase64(registry.publicKey);
const author = mlDsa65Keygen(new Uint8Array(32).fill(2));
const AUTHOR_PK = bytesToBase64(author.publicKey);
const other = mlDsa65Keygen(new Uint8Array(32).fill(3));
const OTHER_PK = bytesToBase64(other.publicKey);

function receiptFor(signingKey: string, issuedAt = '2026-01-01T00:00:00.000Z') {
  const r = buildHandleReceipt(
    {
      handle: 'bymjmazzei',
      signingKey,
      proofType: 'claim',
      strength: 1,
      priorityAt: issuedAt,
      event: 'claim',
      prevReceiptHash: null,
      issuedAt,
    },
    registry.secretKey
  );
  return { receipt: r.receipt, signature: r.signature };
}

const HASH_A = new Uint8Array(32).fill(7);
const HASH_B = new Uint8Array(32).fill(8);

/** As the c2pa sign callback hands it over. */
const callbackPayload = {
  sigType: PN_AUTHOR_SIG_TYPE,
  referencedAssertions: [
    { url: 'self#jumbf=c2pa.assertions/c2pa.hash.data', hash: HASH_B },
    { url: 'self#jumbf=c2pa.assertions/c2pa.actions.v2', hash: HASH_A },
  ],
};

/** As the c2pa reader reports it. */
function readerPayload(hashA = HASH_A) {
  return {
    sig_type: PN_AUTHOR_SIG_TYPE,
    referenced_assertions: [
      { url: 'self#jumbf=c2pa.assertions/c2pa.actions.v2', hash: `b64'${bytesToBase64(hashA)}'` },
      { url: 'self#jumbf=c2pa.assertions/c2pa.hash.data', hash: `b64'${bytesToBase64(HASH_B)}'` },
    ],
  };
}

function credential(receipt = receiptFor(AUTHOR_PK), chainHead: string | null = 'head-1') {
  const bytes = signAuthorCredential({
    signerPayload: callbackPayload,
    secretKey: author.secretKey,
    publicKey: author.publicKey,
    receipt,
    chainHead,
  });
  return `b64'${bytesToBase64(bytes)}'`;
}

describe('author assertion', () => {
  it('round-trips from the sign callback form to the reader form', () => {
    const out = verifyAuthorAssertion({
      signerPayload: readerPayload(),
      credential: credential(),
      registryPublicKey: REGISTRY_PK,
      at: '2026-02-01T00:00:00.000Z',
    });
    expect(out).toEqual({
      ok: true,
      authorKeyId: authorKeyId(AUTHOR_PK),
      publicKey: AUTHOR_PK,
      handle: 'bymjmazzei',
      chainHead: 'head-1',
    });
  });

  it('fails when a referenced assertion changed', () => {
    const out = verifyAuthorAssertion({
      signerPayload: readerPayload(new Uint8Array(32).fill(9)),
      credential: credential(),
      registryPublicKey: REGISTRY_PK,
    });
    expect(out).toEqual({ ok: false, error: 'signature_invalid' });
  });

  it('fails on a tampered receipt, a receipt for another key, or the wrong registry key', () => {
    const good = receiptFor(AUTHOR_PK);
    const tampered = { ...good, receipt: { ...(good.receipt as object), handle: 'someoneelse' } };
    for (const [receipt, registryPublicKey] of [
      [tampered, REGISTRY_PK],
      [receiptFor(OTHER_PK), REGISTRY_PK],
      [good, OTHER_PK],
    ] as const) {
      expect(
        verifyAuthorAssertion({ signerPayload: readerPayload(), credential: credential(receipt), registryPublicKey })
      ).toEqual({ ok: false, error: 'receipt_invalid' });
    }
  });

  it('does not count a receipt issued after the claim', () => {
    const out = verifyAuthorAssertion({
      signerPayload: readerPayload(),
      credential: credential(receiptFor(AUTHOR_PK, '2026-06-01T00:00:00.000Z')),
      registryPublicKey: REGISTRY_PK,
      at: '2026-02-01T00:00:00.000Z',
    });
    expect(out).toEqual({ ok: false, error: 'receipt_invalid' });
  });

  it('needs a hard binding among the references', () => {
    const payload = { sig_type: PN_AUTHOR_SIG_TYPE, referenced_assertions: [readerPayload().referenced_assertions[0]] };
    expect(verifyAuthorAssertion({ signerPayload: payload, credential: credential(), registryPublicKey: REGISTRY_PK })).toEqual({
      ok: false,
      error: 'hard_binding_missing',
    });
  });
});

function store(opts: {
  generator: string;
  trusted: boolean;
  extraFailures?: string[];
  assertions?: Array<{ label: string; data: unknown }>;
  ingredients?: unknown[];
  extraManifests?: Record<string, unknown>;
}) {
  return {
    active_manifest: 'urn:c2pa:active',
    manifests: {
      'urn:c2pa:active': {
        claim_generator_info: [{ name: opts.generator, version: '26.0' }],
        signature_info: { alg: 'Es256', common_name: `${opts.generator} Signer`, issuer: 'Vendor', time: '2026-03-01T00:00:00+00:00' },
        assertions: opts.assertions ?? [],
        ingredients: opts.ingredients ?? [],
      },
      ...(opts.extraManifests ?? {}),
    },
    validation_state: opts.trusted ? 'Trusted' : 'Valid',
    validation_results: {
      activeManifest: {
        success: opts.trusted ? [{ code: 'signingCredential.trusted' }] : [],
        failure: [
          ...(opts.trusted ? [] : [{ code: 'signingCredential.untrusted' }]),
          ...(opts.extraFailures ?? []).map((code) => ({ code })),
        ],
      },
    },
  };
}

const pnIdentity = () => ({
  label: 'cawg.identity',
  data: { signer_payload: readerPayload(), signature: credential(), pad1: "b64'AAAA'" },
});

describe('manifest summary', () => {
  it('reads a third-party manifest that carries a pN author assertion', () => {
    const s = summarizeManifestStore(
      store({
        generator: 'Adobe Photoshop',
        trusted: true,
        extraFailures: ['cawg.identity.sig_type.unknown'],
        assertions: [pnIdentity(), trainingMiningAssertion({ ...DEFAULT_TRAINING_PREFERENCE, aiInference: 'allowed' })],
      }),
      { registryPublicKey: REGISTRY_PK }
    )!;
    expect(s.trust).toBe('trusted');
    expect(s.claimGenerator).toEqual({ name: 'Adobe Photoshop', version: '26.0' });
    expect(s.creator).toEqual({ kind: 'pn', handle: 'bymjmazzei', authorKeyId: authorKeyId(AUTHOR_PK) });
    expect(s.trainingMining?.aiInference).toBe('allowed');
    expect(s.failures).toEqual([]);
    expect(signerDisplay(s)).toBe('Made with Adobe Photoshop');
  });

  it('reports untrusted and invalid signers', () => {
    expect(summarizeManifestStore(store({ generator: 'Tool', trusted: false }), { registryPublicKey: null })?.trust).toBe(
      'untrusted'
    );
    const bad = summarizeManifestStore(
      store({ generator: 'Tool', trusted: true, extraFailures: ['assertion.dataHash.mismatch'] }),
      { registryPublicKey: null }
    );
    expect(bad?.trust).toBe('invalid');
    expect(summarizeManifestStore({}, { registryPublicKey: null })).toBeNull();
  });

  it('credits a CreativeWork author and its CC license, and summarizes ingredients', () => {
    const s = summarizeManifestStore(
      store({
        generator: 'par Noir Pen',
        trusted: true,
        ingredients: [{ title: 'photo.jpg', format: 'image/jpeg', relationship: 'componentOf', active_manifest: 'urn:c2pa:child' }],
        extraManifests: {
          'urn:c2pa:child': {
            claim_generator_info: [{ name: 'Leica', version: '1' }],
            signature_info: { common_name: 'Leica Camera' },
            assertions: [
              {
                label: 'stds.schema-org.CreativeWork',
                data: { author: [{ name: 'Ada' }], license: 'https://creativecommons.org/licenses/by/4.0/' },
              },
            ],
          },
        },
      }),
      { registryPublicKey: null }
    )!;
    expect(signerDisplay(s)).toBe('Made in Pen');
    expect(s.ingredients[0]).toMatchObject({ creator: { kind: 'cawg', display: 'Ada' }, workLicense: 'cc-by', signer: 'Leica Camera' });
    expect(ingredientFromSummary({ summary: s, title: 'x.png', format: 'image/png', layerId: 'l1' })).toMatchObject({
      layerId: 'l1',
      trust: 'trusted',
      relationship: 'componentOf',
    });
  });
});

describe('derivative summary', () => {
  const parentManifest = () => ({
    claim_generator_info: [{ name: 'Adobe Photoshop', version: '26.0' }],
    signature_info: { common_name: 'Adobe', time: '2026-03-01T00:00:00+00:00' },
    assertions: [pnIdentity()],
  });
  const derivative = (parentFailures: string[]) => {
    const s = store({
      generator: 'par Noir Pen',
      trusted: true,
      ingredients: [
        {
          title: 'orig.jpg',
          format: 'image/jpeg',
          relationship: 'parentOf',
          active_manifest: 'urn:c2pa:parent',
          validation_results: {
            activeManifest: {
              success: parentFailures.length ? [] : [{ code: 'signingCredential.trusted' }],
              failure: parentFailures.map((code) => ({ code })),
            },
          },
        },
      ],
      extraManifests: { 'urn:c2pa:parent': parentManifest() },
    });
    return summarizeManifestStore(s, { registryPublicKey: REGISTRY_PK })!;
  };

  it('carries the parent credit into a rendition that credits no one', () => {
    const s = derivative([]);
    expect(s.creator).toEqual({ kind: 'pn', handle: 'bymjmazzei', authorKeyId: authorKeyId(AUTHOR_PK) });
    expect(s.pnAuthor?.handle).toBe('bymjmazzei');
    expect(s.trust).toBe('trusted');
    expect(signerDisplay(s)).toBe('Made in Pen');
  });

  it('never trusts inherited credit more than the parent', () => {
    expect(derivative(['signingCredential.untrusted']).trust).toBe('untrusted');
  });

  it("applies the reader's re-validation of an ingredient over what its builder recorded", () => {
    const s = store({
      generator: 'par Noir Pen',
      trusted: true,
      ingredients: [
        {
          title: 'orig.jpg',
          format: 'image/jpeg',
          relationship: 'parentOf',
          label: 'c2pa.ingredient.v3',
          active_manifest: 'urn:c2pa:parent',
          validation_results: { activeManifest: { success: [], failure: [{ code: 'signingCredential.untrusted' }] } },
        },
      ],
      extraManifests: { 'urn:c2pa:parent': parentManifest() },
    }) as Record<string, any>;
    s.validation_results.ingredientDeltas = [
      {
        ingredientAssertionURI: 'self#jumbf=/c2pa/urn:c2pa:active/c2pa.assertions/c2pa.ingredient.v3',
        validationDeltas: { success: [{ code: 'signingCredential.trusted' }], failure: [] },
      },
    ];
    const out = summarizeManifestStore(s, { registryPublicKey: REGISTRY_PK })!;
    expect(out.ingredients[0]!.trust).toBe('trusted');
    expect(out.trust).toBe('trusted');
  });
});

describe('training-mining', () => {
  it('maps every preference to its CAWG entry and back', () => {
    const pref = {
      aiTraining: 'allowed',
      aiGenerativeTraining: 'notAllowed',
      aiInference: 'constrained',
      dataMining: 'allowed',
      constraintInfo: 'Credit required',
    } as const;
    const a = trainingMiningAssertion(pref);
    expect(a.label).toBe('cawg.training-mining');
    expect(a.data.entries).toEqual({
      'cawg.ai_training': { use: 'allowed' },
      'cawg.ai_generative_training': { use: 'notAllowed' },
      'cawg.ai_inference': { use: 'constrained', constraint_info: 'Credit required' },
      'cawg.data_mining': { use: 'allowed' },
    });
    expect(parseTrainingMining(a.data)).toEqual(pref);
    expect(trainingMiningAssertion().data.entries['cawg.ai_training']).toEqual({ use: 'notAllowed' });
  });
});

describe('manifest definitions', () => {
  it('builds an original with the doc and rights assertions and a derivative with parentOf', () => {
    const doc = penDocAssertion({ docId: 'pen_1', templateId: 'social.post', licensing: { family: 'implied', workLicense: 'cc-by', contracts: [] } });
    const def = penOriginalDefinition({ title: 'post.jpg', format: 'image/jpeg', version: '1.0.0', penDoc: doc });
    expect(def.assertions.map((a) => a.label)).toEqual(['c2pa.actions.v2', 'org.parnoir.pen.doc', 'cawg.training-mining']);
    expect((def.assertions[0]!.data as { actions: Array<{ action: string; digitalSourceType: string }> }).actions[0]).toMatchObject({
      action: 'c2pa.created',
      digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCreation',
    });
    const d = derivativeDefinition({
      title: 'post-sd.jpg',
      format: 'image/jpeg',
      version: '1.0.0',
      parent: { title: 'post.jpg', format: 'image/jpeg' },
      action: 'c2pa.resized',
    });
    expect(d.ingredients).toEqual([{ title: 'post.jpg', format: 'image/jpeg', relationship: 'parentOf', label: 'parent' }]);
    expect((d.assertions[0]!.data as { actions: Array<{ action: string }> }).actions.map((a) => a.action)).toEqual([
      'c2pa.opened',
      'c2pa.resized',
    ]);
  });
});

function summary(over: Partial<ManifestSummary>): ManifestSummary {
  return {
    v: 1,
    label: 'urn:c2pa:x',
    trust: 'trusted',
    signer: { commonName: 'Signer', issuer: null, alg: null, time: null },
    claimGenerator: null,
    pnAuthor: null,
    creator: null,
    ingredients: [],
    trainingMining: null,
    workLicense: null,
    penDoc: null,
    failures: [],
    ...over,
  };
}

describe('resolveOriginality', () => {
  const me = { authorKeyIds: ['key-me'], handles: ['me'] };
  const mine = { kind: 'pn' as const, handle: 'me', authorKeyId: 'key-me' };
  const theirs = { kind: 'pn' as const, handle: 'them', authorKeyId: 'key-them' };

  it('treats the uploader as creator as an original, verified only with a trusted, handle-bound pN author', () => {
    const s = summary({ creator: mine, pnAuthor: { handle: 'me', authorKeyId: 'key-me', chainHead: null } });
    expect(resolveOriginality(s, me, { monetized: true })).toMatchObject({ kind: 'original', verifiedOriginal: true });
    expect(resolveOriginality({ ...s, trust: 'untrusted' }, me, { monetized: true }).verifiedOriginal).toBe(false);
  });

  it('treats no manifest, or no credited creator, as original', () => {
    expect(resolveOriginality(null, me, { monetized: true })).toMatchObject({ kind: 'original', reason: 'no_manifest' });
    expect(resolveOriginality(summary({}), me, { monetized: true })).toMatchObject({ kind: 'original', reason: 'no_credited_creator' });
  });

  it('treats someone else’s all-rights-reserved work as a copy', () => {
    expect(resolveOriginality(summary({ creator: theirs, workLicense: 'all-rights-reserved' }), me, { monetized: false })).toMatchObject({
      kind: 'copy',
      creator: theirs,
    });
    expect(resolveOriginality(summary({ creator: { kind: 'cawg', display: 'Ada' } }), me, { monetized: false }).kind).toBe('copy');
  });

  it('treats a cc-by work as a licensed remix', () => {
    expect(resolveOriginality(summary({ creator: theirs, workLicense: 'cc-by' }), me, { monetized: true }).kind).toBe('licensed_remix');
  });

  it('allows cc-by-nc only when the post is not monetized', () => {
    const s = summary({ creator: theirs, workLicense: 'cc-by-nc' });
    expect(resolveOriginality(s, me, { monetized: false }).kind).toBe('licensed_remix');
    expect(resolveOriginality(s, me, { monetized: true }).kind).toBe('copy');
  });

  it('judges a Pen post by the credited ingredients it was built from', () => {
    const ing = (workLicense: string) => ({
      title: 'a.jpg',
      format: 'image/jpeg',
      relationship: 'componentOf' as const,
      manifestLabel: 'urn:c2pa:a',
      trust: 'trusted' as const,
      signer: null,
      generator: null,
      creator: theirs,
      workLicense,
    });
    const base = { creator: mine, pnAuthor: { handle: 'me', authorKeyId: 'key-me', chainHead: null } };
    expect(resolveOriginality(summary({ ...base, ingredients: [ing('cc-by')] }), me, { monetized: true }).kind).toBe('licensed_remix');
    expect(
      resolveOriginality(summary({ ...base, ingredients: [ing('cc-by'), ing('all-rights-reserved')] }), me, { monetized: true }).kind
    ).toBe('copy');
  });

  it('ignores an invalid manifest', () => {
    expect(resolveOriginality(summary({ trust: 'invalid', creator: theirs }), me, { monetized: true }).kind).toBe('original');
  });
});

describe('credentialsBadge', () => {
  const ing = (over: Partial<ManifestSummary['ingredients'][number]>) => ({
    title: 'photo.jpg',
    format: 'image/jpeg',
    relationship: 'parentOf' as const,
    manifestLabel: 'urn:c2pa:p',
    trust: 'trusted' as const,
    signer: 'Adobe Inc.',
    generator: 'Adobe Photoshop/26.0',
    creator: { kind: 'cawg' as const, display: 'Ada (Instagram)' },
    workLicense: null,
    ...over,
  });

  it('shows what made the original behind a par Noir rendition, and its creator as text', () => {
    const s = summary({
      claimGenerator: { name: 'par Noir', version: '1.0.0' },
      creator: { kind: 'cawg', display: 'Ada (Instagram)' },
      ingredients: [ing({})],
    });
    expect(credentialsBadge(s)).toEqual({
      made: 'Made with Adobe Photoshop',
      trust: 'trusted',
      creator: { label: 'Ada (Instagram)', handle: null },
      ingredients: [],
      originalBy: null,
      originality: null,
    });
  });

  it('credits a Pen post to its handle, lists what it was built from, and names the original on a copy', () => {
    const pen = summary({
      claimGenerator: { name: 'par Noir Pen', version: '1.0.0' },
      creator: { kind: 'pn', handle: 'bymjmazzei', authorKeyId: 'k' },
      ingredients: [ing({ relationship: 'componentOf', title: 'Attached image', generator: null, signer: 'Leica Camera AG' })],
    });
    const badge = credentialsBadge(pen, {
      kind: 'copy',
      creator: { kind: 'pn', handle: 'bymjmazzei', authorKeyId: 'k' },
      verifiedOriginal: false,
      reason: 'license_forbids_reuse',
    })!;
    expect(badge.made).toBe('Made in Pen');
    expect(badge.creator).toEqual({ label: '@bymjmazzei', handle: 'bymjmazzei' });
    expect(badge.ingredients).toEqual([
      { title: 'Attached image', made: 'Signed by Leica Camera AG', creator: { label: 'Ada (Instagram)', handle: null }, trust: 'trusted' },
    ]);
    expect(badge.originalBy).toEqual({ label: '@bymjmazzei', handle: 'bymjmazzei' });
  });

  it('shows nothing for no credentials or credentials that fail validation', () => {
    expect(credentialsBadge(null)).toBeNull();
    expect(credentialsBadge(summary({ trust: 'invalid' }))).toBeNull();
  });
});
