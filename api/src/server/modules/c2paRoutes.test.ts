/**
 * @jest-environment node
 *
 * Pen C2PA signing and verification end to end: c2pa-node builds the manifest the way Pen's
 * browser builder does, the claim goes through POST /api/c2pa/sign (dev certificate from the
 * script, timestamp from a local openssl TSA), and POST /api/c2pa/verify reads the result.
 */

jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: (v: string) => `hash(${v})`,
  isDevVerbose: () => false
}));

const validateAccessToken = jest.fn();

jest.mock('./pnOAuthService', () => ({
  PNOAuthService: {
    validateAccessToken: (...args: unknown[]) => validateAccessToken(...args)
  }
}));

jest.mock('./integratorStoragePaths', () => ({
  isFirstPartyClient: (id: string | undefined | null) => id === 'pen-app'
}));

jest.mock('./publicNameService', () => ({
  PublicNameService: { signingKey: async () => null }
}));

const mockStamp = jest.fn();

jest.mock('./timestampService', () => ({
  ...jest.requireActual('./timestampService'),
  stampImprint: (imprint: Uint8Array) => mockStamp(imprint)
}));

import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { initSync, WasmBuilder } from '@contentauth/c2pa-wasm';
import { bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';
import { deriveCanonicalPnIdentifier } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import { authorKeyId } from '@par-noir/pen-protocol';
import { buildHandleReceipt } from '@par-noir/public-names';
import {
  PN_AUTHOR_RESERVE_SIZE,
  PN_AUTHOR_SIG_TYPE,
  authorReferencedLabels,
  derivativeDefinition,
  penDocAssertion,
  penOriginalDefinition,
  signAuthorCredential,
  type ManifestDefinition
} from '@par-noir/pn-provenance';
import { setupC2paRoutes } from './c2paRoutes';
import { resetRegistryKeysForTests } from './handleReceiptService';

const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDIooor1DgP/9k=',
  'base64'
);
const RESERVE = 20_000;

// Each case builds, ML-DSA-signs, stamps and validates real manifests.
jest.setTimeout(30_000);

const author = mlDsa65Keygen(new Uint8Array(32).fill(2));
const AUTHOR_PK = bytesToBase64(author.publicKey);
const AUTHOR_PN = deriveCanonicalPnIdentifier(AUTHOR_PK);
const REGISTRY_SEED = new Uint8Array(32).fill(5);
const registry = mlDsa65Keygen(REGISTRY_SEED);

let dir: string;
let emptyDir: string;

function openssl(args: string[]): void {
  execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
}

beforeAll(() => {
  (globalThis as { FileReaderSync?: unknown }).FileReaderSync = class {
    readAsArrayBuffer(blob: SyncBlob) {
      const b = blob.bytes;
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    }
  };
  initSync({ module: readFileSync(require.resolve('@contentauth/c2pa-wasm/c2pa.wasm')) });

  dir = mkdtempSync(path.join(tmpdir(), 'c2pa-test-'));
  emptyDir = mkdtempSync(path.join(tmpdir(), 'c2pa-empty-'));
  execFileSync('bash', [path.join(__dirname, '../../../scripts/c2pa-dev-cert.sh'), dir], { stdio: 'pipe' });

  writeFileSync(
    path.join(dir, 'tsa.cnf'),
    [
      '[req]',
      'distinguished_name=dn',
      'prompt=no',
      '[dn]',
      'CN=Test TSA',
      '[v3_tsa]',
      'basicConstraints=critical,CA:FALSE',
      'keyUsage=critical,digitalSignature',
      'extendedKeyUsage=critical,timeStamping',
      '[tsa]',
      'default_tsa=tsa1',
      '[tsa1]',
      `serial=${dir}/tsaserial`,
      `signer_cert=${dir}/tsa.pem`,
      `certs=${dir}/root.pem`,
      `signer_key=${dir}/tsa.key`,
      'signer_digest=sha256',
      'default_policy=1.2.3.4.1',
      'digests=sha256',
      'accuracy=secs:1',
      'ess_cert_id_alg=sha256'
    ].join('\n')
  );
  writeFileSync(path.join(dir, 'tsaserial'), '01\n');
  openssl(['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'tsa.key']);
  openssl(['req', '-new', '-key', 'tsa.key', '-config', 'tsa.cnf', '-out', 'tsa.csr']);
  openssl([
    'x509', '-req', '-in', 'tsa.csr', '-CA', 'root.pem', '-CAkey', 'root.key', '-CAcreateserial',
    '-days', '30', '-sha256', '-extfile', 'tsa.cnf', '-extensions', 'v3_tsa', '-out', 'tsa.pem'
  ]);

  mockStamp.mockImplementation(async (imprint: Uint8Array) => {
    openssl(['ts', '-query', '-digest', Buffer.from(imprint).toString('hex'), '-sha256', '-cert', '-out', 'q.tsq']);
    openssl(['ts', '-reply', '-queryfile', 'q.tsq', '-config', 'tsa.cnf', '-token_out', '-out', 'tok.der']);
    return { token: new Uint8Array(readFileSync(path.join(dir, 'tok.der'))), genTime: new Date().toISOString() };
  });

  process.env.C2PA_DEV_DIR = dir;
  delete process.env.PEN_C2PA_CERT_CHAIN_PEM;
  delete process.env.PEN_C2PA_PRIVATE_KEY_PEM;
  delete process.env.C2PA_TRUST_ANCHORS_PEM;
  process.env.NAME_REGISTRY_SIGNING_SEED = Buffer.from(REGISTRY_SEED).toString('base64');
  resetRegistryKeysForTests();
});

afterAll(() => {
  delete process.env.C2PA_DEV_DIR;
  delete process.env.NAME_REGISTRY_SIGNING_SEED;
  resetRegistryKeysForTests();
});

beforeEach(() => {
  process.env.C2PA_DEV_DIR = dir;
  validateAccessToken.mockReturnValue({ pnIdentifier: AUTHOR_PN, clientId: 'pen-app', scope: 'openid' });
});

function app() {
  const a = express();
  a.use(express.json({ limit: '10mb' }));
  setupC2paRoutes(a);
  return a;
}

function receipt() {
  const r = buildHandleReceipt(
    {
      handle: 'bymjmazzei',
      signingKey: AUTHOR_PK,
      proofType: 'claim',
      strength: 1,
      priorityAt: '2026-01-01T00:00:00.000Z',
      event: 'claim',
      prevReceiptHash: null,
      issuedAt: new Date(Date.now() - 60_000).toISOString()
    },
    registry.secretKey
  );
  return { receipt: r.receipt, signature: r.signature };
}

const penDoc = penDocAssertion({
  docId: 'pen_1',
  templateId: 'social.post',
  licensing: { family: 'implied', workLicense: 'cc-by', contracts: [] }
});

/** The browser builder reads Blobs with FileReaderSync; Node has neither that nor sync slices. */
class SyncBlob extends Blob {
  constructor(readonly bytes: Uint8Array, opts?: BlobPropertyBag) {
    super([bytes], opts);
  }
  override slice(start = 0, end = this.bytes.length, type?: string): Blob {
    return new SyncBlob(this.bytes.subarray(start, end), { type });
  }
}

function jpegBlob(bytes: Uint8Array): Blob {
  return new SyncBlob(new Uint8Array(bytes), { type: 'image/jpeg' });
}

/** What Pen's publish does: build, sign the author assertion locally, send the claim to the API. */
async function penSign(
  def: ManifestDefinition,
  opts: { withAuthor: boolean; parent?: Buffer }
): Promise<{ status: number; error?: string; out?: Buffer }> {
  const { ingredients, ...json } = def;
  const builder = WasmBuilder.fromJson(JSON.stringify(json));
  if (opts.parent) await builder.addIngredientFromBlob(JSON.stringify(ingredients![0]), 'image/jpeg', jpegBlob(opts.parent));
  let assertion: { signerPayload: unknown; credential: string } | null = null;
  let failure: { status: number; error: string } | null = null;
  const signer = {
    alg: 'es256',
    reserveSize: RESERVE,
    sign: async (claim: Uint8Array) => {
      const res = await request(app())
        .post('/api/c2pa/sign')
        .set('Authorization', 'Bearer t')
        .send({ claim: Buffer.from(claim).toString('base64'), reserveSize: RESERVE, author: assertion });
      if (res.status !== 200) {
        failure = { status: res.status, error: res.body.error };
        throw new Error(res.body.error);
      }
      return new Uint8Array(Buffer.from(res.body.cose, 'base64'));
    }
  };
  const identity = {
    sigType: PN_AUTHOR_SIG_TYPE,
    reserveSize: PN_AUTHOR_RESERVE_SIZE,
    referencedAssertions: authorReferencedLabels(def),
    roles: [],
    sign: async (payload: { sigType: string; referencedAssertions: Array<{ url: string; hash: Uint8Array }> }) => {
      const credential = signAuthorCredential({
        signerPayload: payload,
        secretKey: author.secretKey,
        publicKey: author.publicKey,
        receipt: receipt(),
        chainHead: 'head-1'
      });
      assertion = {
        signerPayload: {
          sigType: payload.sigType,
          referencedAssertions: payload.referencedAssertions.map((r) => ({ url: r.url, hash: Buffer.from(r.hash).toString('base64') }))
        },
        credential: Buffer.from(credential).toString('base64')
      };
      return new Uint8Array(credential);
    }
  };
  try {
    const out = await builder.sign(signer as never, opts.withAuthor ? [identity] : [], 'image/jpeg', jpegBlob(JPEG));
    return { status: 200, out: Buffer.from(out) };
  } catch (e) {
    const f = failure as { status: number; error: string } | null;
    if (f) return f;
    throw e;
  }
}
async function verify(bytes: Buffer) {
  const res = await request(app())
    .post('/api/c2pa/verify')
    .set('Authorization', 'Bearer t')
    .set('Content-Type', 'image/jpeg')
    .send(bytes);
  expect(res.status).toBe(200);
  return res.body.summary;
}

const original = () => penOriginalDefinition({ title: 'post.jpg', format: 'image/jpeg', version: '0.1.0', penDoc });

describe('/api/c2pa', () => {
  it('signs a Pen original with the pN author and reads it back as trusted and timestamped', async () => {
    const signed = await penSign(original(), { withAuthor: true });
    expect(signed.status).toBe(200);
    const s = await verify(signed.out!);
    expect(s).toMatchObject({
      trust: 'trusted',
      claimGenerator: { name: 'par Noir Pen', version: '0.1.0' },
      signer: { commonName: 'par Noir Pen Dev Signer' },
      pnAuthor: { handle: 'bymjmazzei', authorKeyId: authorKeyId(AUTHOR_PK), chainHead: 'head-1' },
      creator: { kind: 'pn', handle: 'bymjmazzei' },
      workLicense: 'cc-by',
      penDoc: { docId: 'pen_1', templateId: 'social.post' },
      failures: []
    });
    expect(s.signer.time).toEqual(expect.any(String));
    expect(s.trainingMining.aiTraining).toBe('notAllowed');
  });

  it('re-signs a derivative with parentOf that validates and carries the original credit', async () => {
    const parent = (await penSign(original(), { withAuthor: true })).out!;
    const def = derivativeDefinition({
      title: 'post-sd.jpg',
      format: 'image/jpeg',
      version: '0.1.0',
      parent: { title: 'post.jpg', format: 'image/jpeg' },
      action: 'c2pa.resized'
    });
    const signed = await penSign(def, { withAuthor: false, parent });
    expect(signed.status).toBe(200);
    const s = await verify(signed.out!);
    expect(s.trust).toBe('trusted');
    expect(s.ingredients).toEqual([
      expect.objectContaining({ relationship: 'parentOf', trust: 'trusted', creator: expect.objectContaining({ handle: 'bymjmazzei' }) })
    ]);
    expect(s.creator).toMatchObject({ kind: 'pn', handle: 'bymjmazzei' });
  });

  it('reports untrusted without the anchor and invalid after the pixels change', async () => {
    const out = (await penSign(original(), { withAuthor: true })).out!;
    process.env.C2PA_DEV_DIR = emptyDir;
    expect((await verify(out)).trust).toBe('untrusted');
    process.env.C2PA_DEV_DIR = dir;
    const tampered = Buffer.from(out);
    tampered[tampered.length - 3] ^= 0xff;
    expect((await verify(tampered)).trust).toBe('invalid');
  });

  it('refuses to sign for an author who is not the caller', async () => {
    validateAccessToken.mockReturnValue({ pnIdentifier: 'pn-someoneelse', clientId: 'pen-app', scope: 'openid' });
    expect(await penSign(original(), { withAuthor: true })).toEqual({ status: 403, error: 'author_not_caller' });
  });

  it('refuses claims from other generators', async () => {
    const def = { ...original(), claim_generator_info: [{ name: 'Other Tool', version: '1' }] };
    expect(await penSign(def, { withAuthor: true })).toEqual({ status: 400, error: 'not_pen_claim' });
  });

  it('returns no summary for a file without credentials and gates third parties', async () => {
    expect(await verify(JPEG)).toBeNull();
    validateAccessToken.mockReturnValue({ pnIdentifier: AUTHOR_PN, clientId: 'evil-integrator', scope: 'openid' });
    const res = await request(app()).post('/api/c2pa/sign').set('Authorization', 'Bearer t').send({ claim: 'AA==' });
    expect(res.status).toBe(403);
  });
});
