/**
 * @jest-environment node
 *
 * Handle registry rules: protected names need their proof, the earliest provable date wins,
 * YouTube opens a dispute, transfers carry the priority date and respect the claim limit,
 * the expiry sweep only touches unverified, unproven, inactive claims, and receipts chain.
 */

import { bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Keygen, mlDsa65Sign } from '@par-noir/pqc-crypto/ml-dsa';
import { deriveCanonicalPnIdentifier } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import { confusableSkeleton, verifyHandleReceiptChain } from '@par-noir/public-names';
import {
  buildHandleSigningKeyStatement,
  buildHandleTransferStatement,
  canonicalHandleSigningKeyBytes,
  canonicalHandleTransferBytes
} from '@par-noir/standard-data-points';

type Row = Record<string, any>;
type State = {
  names: Row[];
  feeds: Row[];
  protectedNames: Row[];
  verified: string[];
  transfers: Row[];
  disputes: Row[];
  receipts: Row[];
  keys: Record<string, string>;
};

let db: State;
let snapshot: State | null = null;

function fresh(): State {
  return { names: [], feeds: [], protectedNames: [], verified: [], transfers: [], disputes: [], receipts: [], keys: {} };
}

const now = () => new Date().toISOString();
const key = (r: Row, type: unknown, subject: unknown) => r.proof_type === type && r.proof_subject === subject;
const held = (r: Row) => r.status === 'listed' || r.status === 'disputed';

function run(sqlRaw: string, p: any[] = []): { rows: Row[]; rowCount?: number } {
  const sql = sqlRaw.replace(/\s+/g, ' ').trim();
  const rows = (list: Row[]) => ({ rows: list, rowCount: list.length });
  if (sql === 'BEGIN') {
    snapshot = structuredClone(db);
    return rows([]);
  }
  if (sql === 'COMMIT') {
    snapshot = null;
    return rows([]);
  }
  if (sql === 'ROLLBACK') {
    if (snapshot) db = snapshot;
    snapshot = null;
    return rows([]);
  }
  if (sql.includes('FROM protected_names WHERE skeleton = $1')) {
    return rows(db.protectedNames.filter((r) => r.skeleton === p[0]));
  }
  if (sql.includes('FROM verified_identities WHERE identity_id = $1')) {
    return rows(db.verified.includes(p[0]) ? [{ '?column?': 1 }] : []);
  }
  if (sql.startsWith('SELECT feed_id, sub_pn_identifier FROM feeds')) {
    return rows(db.feeds.filter((f) => f.feed_id === p[0] && f.owner_pn_identifier === p[1]));
  }
  if (sql.startsWith('SELECT feed_id FROM feeds WHERE owner_pn_identifier = $1')) {
    return rows(db.feeds.filter((f) => f.owner_pn_identifier === p[0] && f.creator_tier === 'personal'));
  }
  if (sql.startsWith('SELECT sub_pn_identifier FROM feeds')) {
    return rows(db.feeds.filter((f) => f.feed_id === p[0]));
  }
  if (sql.includes("WHERE pn_identifier = $1 AND proof_type = 'dns' AND status = 'listed'")) {
    return rows([]);
  }
  if (sql.startsWith('SELECT pn.*, COALESCE(f.last_activity_at')) {
    const sweep = sql.includes("pn.proof_type = 'claim' AND pn.status = 'listed'");
    return rows(
      db.names
        .filter((r) =>
          sweep
            ? r.proof_type === 'claim' && r.status === 'listed' && !db.verified.includes(r.pn_identifier)
            : r.pn_identifier === p[0]
        )
        .map((r) => ({
          ...r,
          activity_at: db.feeds.find((f) => f.feed_id === r.feed_id)?.last_activity_at ?? r.priority_at
        }))
    );
  }
  if (sql.includes('WHERE skeleton = $1 AND status IN (\'listed\', \'disputed\')')) {
    return rows(db.names.filter((r) => r.skeleton === p[0] && held(r)).slice(0, 1));
  }
  if (sql.includes("WHERE pn_identifier = $1 AND proof_type = 'claim' AND status IN ('listed', 'disputed')")) {
    return rows(db.names.filter((r) => r.pn_identifier === p[0] && r.proof_type === 'claim' && held(r)));
  }
  if (sql.includes('WHERE feed_id = $1 AND is_vanity = true AND status')) {
    return rows(db.names.filter((r) => r.feed_id === p[0] && r.is_vanity && held(r)));
  }
  if (sql.includes("WHERE skeleton = $1 AND status = 'released' AND released_until > NOW()")) {
    return rows(
      db.names.filter(
        (r) => r.skeleton === p[0] && r.status === 'released' && Date.parse(r.released_until) > Date.now()
      )
    );
  }
  if (sql.startsWith('INSERT INTO public_names') && sql.includes("'claim'")) {
    const row = {
      public_name: p[0],
      pn_identifier: p[1],
      proof_type: 'claim',
      proof_subject: p[2],
      status: 'listed',
      is_vanity: p[3],
      feed_id: p[4],
      skeleton: p[5],
      strength: 1,
      priority_at: now(),
      created_at: now(),
      listed_at: now(),
      proof_meta: p[6] ? JSON.parse(p[6]) : {},
      receipt_hash: null
    };
    db.names.push(row);
    return rows([row]);
  }
  if (sql.startsWith('SELECT signing_public_key FROM pn_signing_keys')) {
    return rows(db.keys[p[0]] ? [{ signing_public_key: db.keys[p[0]] }] : []);
  }
  if (sql.startsWith('SELECT r.receipt_hash, r.receipt, r.signature FROM public_names pn')) {
    const head = db.names.find((r) => r.public_name === p[0] && held(r));
    return rows(db.receipts.filter((r) => head && r.receipt_hash === head.receipt_hash));
  }
  if (sql.startsWith('INSERT INTO pn_signing_keys')) {
    db.keys[p[0]] = p[1];
    return rows([]);
  }
  if (sql.startsWith("SELECT * FROM public_names WHERE pn_identifier = $1 AND status IN ('listed', 'disputed')")) {
    return rows(db.names.filter((r) => r.pn_identifier === p[0] && held(r)));
  }
  if (sql.startsWith('INSERT INTO public_name_receipts')) {
    db.receipts.push({ receipt_hash: p[0], public_name: p[1], owner: p[2], receipt: JSON.parse(p[3]), signature: p[4] });
    return rows([]);
  }
  if (sql.startsWith('SELECT public_name, receipt_hash FROM public_names')) {
    return rows(db.names.filter((r) => r.pn_identifier === p[0] && r.receipt_hash));
  }
  if (sql.startsWith('SELECT receipt_hash, receipt, signature FROM public_name_receipts WHERE receipt_hash = $1')) {
    return rows(db.receipts.filter((r) => r.receipt_hash === p[0]));
  }
  if (sql.startsWith('UPDATE public_names SET receipt_hash = $1')) {
    db.names.filter((r) => key(r, p[1], p[2])).forEach((r) => (r.receipt_hash = p[0]));
    return rows([]);
  }
  if (sql.startsWith("UPDATE public_names SET status = 'released'")) {
    const r = db.names.find(
      (x) => x.pn_identifier === p[0] && x.public_name === p[1] && x.proof_type === 'claim' && x.status === 'listed'
    );
    if (!r) return rows([]);
    Object.assign(r, {
      status: 'released',
      is_vanity: false,
      released_until: new Date(Date.now() + Number(p[2])).toISOString()
    });
    return rows([{ ...r }]);
  }
  if (sql.startsWith("UPDATE public_names SET status = 'listed', feed_id = $3")) {
    const r = db.names.find((x) => key(x, 'claim', p[0]) && x.pn_identifier === p[1])!;
    Object.assign(r, { status: 'listed', feed_id: p[2], is_vanity: p[3], released_until: null });
    return rows([{ ...r }]);
  }
  if (sql.includes("proof_type IN ('dns', 'youtube') AND status IN ('proven', 'listed', 'disputed')")) {
    return rows(
      db.names.filter(
        (r) =>
          r.pn_identifier === p[0] &&
          r.public_name === p[1] &&
          (r.proof_type === 'dns' || r.proof_type === 'youtube') &&
          ['proven', 'listed', 'disputed'].includes(r.status)
      )
    );
  }
  if (sql.includes("public_name = $2 AND proof_type = 'claim' AND status IN ('listed', 'disputed')")) {
    return rows(
      db.names.filter(
        (r) => r.pn_identifier === p[0] && r.public_name === p[1] && r.proof_type === 'claim' && held(r)
      )
    );
  }
  if (sql.startsWith("UPDATE public_names SET status = 'revoked'")) {
    db.names.filter((r) => key(r, p[0], p[1])).forEach((r) => Object.assign(r, { status: 'revoked', is_vanity: false }));
    return rows([]);
  }
  if (sql.startsWith('INSERT INTO public_name_disputes')) {
    db.disputes.push({ skeleton: p[0], public_name: p[1], holder: p[2], challenger: p[3], kind: p[4] });
    return rows([]);
  }
  if (sql.startsWith("UPDATE public_names SET status = 'disputed'")) {
    db.names.filter((r) => key(r, p[0], p[1])).forEach((r) => (r.status = 'disputed'));
    return rows([]);
  }
  if (sql.startsWith("UPDATE public_names SET status = 'superseded'")) {
    const r = db.names.find((x) => key(x, p[0], p[1]))!;
    Object.assign(r, { status: 'superseded', is_vanity: false, proof_meta: { ...r.proof_meta, ...JSON.parse(p[2]) } });
    return rows([{ ...r }]);
  }
  if (sql.startsWith("UPDATE public_names SET status = 'listed', listed_at = COALESCE")) {
    const r = db.names.find((x) => key(x, p[0], p[1]))!;
    Object.assign(r, {
      status: 'listed',
      feed_id: p[2],
      skeleton: p[3],
      strength: p[4],
      priority_at: p[5] ?? now(),
      is_vanity: p[6]
    });
    return rows([{ ...r }]);
  }
  if (sql.startsWith('SELECT 1 FROM public_names WHERE pn_identifier = $1 AND public_name = $2 AND status = \'listed\'')) {
    return rows(db.names.filter((r) => r.pn_identifier === p[0] && r.public_name === p[1] && r.status === 'listed'));
  }
  if (sql.startsWith('SELECT * FROM public_names WHERE pn_identifier = $1 AND public_name = $2 AND status = \'listed\'')) {
    return rows(db.names.filter((r) => r.pn_identifier === p[0] && r.public_name === p[1] && r.status === 'listed'));
  }
  if (sql.startsWith('INSERT INTO public_name_transfers')) {
    if (db.transfers.some((t) => t.public_name === p[0] && t.status === 'pending')) {
      throw Object.assign(new Error('dup'), { code: '23505', constraint: 'idx_public_name_transfers_pending' });
    }
    const t = { id: `t-${db.transfers.length + 1}`, public_name: p[0], from_pn_identifier: p[1], to_pn_identifier: p[2], status: 'pending', created_at: now() };
    db.transfers.push(t);
    return rows([t]);
  }
  if (sql.startsWith('SELECT * FROM public_name_transfers WHERE id::text = $1')) {
    return rows(db.transfers.filter((t) => t.id === p[0] && t.status === 'pending'));
  }
  if (sql.startsWith('SELECT id, public_name, from_pn_identifier')) {
    return rows(
      db.transfers.filter((t) => t.status === 'pending' && (t.from_pn_identifier === p[0] || t.to_pn_identifier === p[0]))
    );
  }
  if (sql.startsWith('UPDATE public_names SET proof_meta = proof_meta || $3::jsonb')) {
    db.names.filter((r) => key(r, p[0], p[1])).forEach((r) => (r.proof_meta = { ...r.proof_meta, ...JSON.parse(p[2]) }));
    return rows([]);
  }
  if (sql.startsWith('UPDATE public_names SET pn_identifier = $3, feed_id = $4')) {
    const r = db.names.find((x) => key(x, p[0], p[1]))!;
    Object.assign(r, { pn_identifier: p[2], feed_id: p[3], is_vanity: p[4] });
    return rows([{ ...r }]);
  }
  if (sql.startsWith("UPDATE public_name_transfers SET status = 'completed'")) {
    db.transfers.filter((t) => t.id === p[0]).forEach((t) => (t.status = 'completed'));
    return rows([]);
  }
  if (sql.startsWith("UPDATE public_names SET status = 'expired'")) {
    const r = db.names.find((x) => key(x, 'claim', p[0]) && x.status === 'listed');
    if (!r) return rows([]);
    Object.assign(r, { status: 'expired', is_vanity: false });
    return rows([{ ...r }]);
  }
  if (sql.startsWith('UPDATE public_names SET expiry_notified_at = NOW()')) {
    db.names.filter((r) => key(r, 'claim', p[0])).forEach((r) => (r.expiry_notified_at = now()));
    return rows([]);
  }
  throw new Error(`unhandled SQL in fake: ${sql.slice(0, 120)}`);
}

jest.mock('../utils/database', () => {
  const query = jest.fn(async (sql: string, params?: unknown[]) => run(sql, params as any[]));
  return {
    getDatabasePool: () => ({
      query,
      connect: async () => ({ query, release: () => undefined })
    })
  };
});
jest.mock('./auditService', () => ({ appendAuditEvent: jest.fn(async () => undefined) }));
jest.mock('./identitySuccessionService', () => ({ isPnRevokedForNetwork: () => false }));
jest.mock('./rdapService', () => ({ fetchDomainRegistrationDate: jest.fn(async () => null) }));

process.env.NAME_REGISTRY_SIGNING_SEED = bytesToBase64(new Uint8Array(32).fill(21));

import { HandleReceiptService } from './handleReceiptService';
import { PublicNameService, EXPIRY_INACTIVE_MS, EXPIRY_NOTICE_MS } from './publicNameService';

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

function feed(owner: string, feedId: string, sub = `pn-${feedId}abcdef`) {
  db.feeds.push({
    feed_id: feedId,
    owner_pn_identifier: owner,
    creator_tier: 'personal',
    sub_pn_identifier: sub,
    last_activity_at: null
  });
}

function provenDomain(pn: string, domain: string, name: string, registeredAt: string | null) {
  db.names.push({
    public_name: name,
    pn_identifier: pn,
    proof_type: 'dns',
    proof_subject: domain,
    status: 'proven',
    is_vanity: false,
    feed_id: null,
    skeleton: confusableSkeleton(name),
    strength: 3,
    priority_at: null,
    created_at: now(),
    proof_meta: { registeredAt },
    receipt_hash: null
  });
}

function backdate(name: string, days: number) {
  db.names.filter((r) => r.public_name === name).forEach((r) => (r.priority_at = ago(days)));
}

const TEST_KEY = bytesToBase64(mlDsa65Keygen(new Uint8Array(32).fill(30)).publicKey);

beforeEach(() => {
  db = fresh();
  snapshot = null;
  for (const pn of ['pn-alice', 'pn-bob', 'pn-carol', 'pn-dave']) db.keys[pn] = TEST_KEY;
  feed('pn-alice', 'feed-a');
  feed('pn-bob', 'feed-b');
});

describe('signing key', () => {
  function rootIdentity(fill: number) {
    const root = mlDsa65Keygen(new Uint8Array(32).fill(fill));
    const rootPk = bytesToBase64(root.publicKey);
    const pn = deriveCanonicalPnIdentifier(rootPk);
    db.feeds[0].owner_pn_identifier = pn;
    return { root, rootPk, pn };
  }

  function keyStatement(pn: string, signingKey: string) {
    return buildHandleSigningKeyStatement({ pnIdentifier: pn, signingKey, nonce: 'nonce-abcdefghijklmnop' });
  }

  it('needs a registered key before a handle can be taken', async () => {
    const { pn } = rootIdentity(40);
    await expect(PublicNameService.claim(pn, 'nokey')).rejects.toMatchObject({ code: 'SIGNING_KEY_REQUIRED' });
    expect(db.names).toHaveLength(0);
  });

  it('registers the root key and names it in receipts', async () => {
    const { root, rootPk, pn } = rootIdentity(41);
    const statement = keyStatement(pn, rootPk);
    const sig = bytesToBase64(mlDsa65Sign(canonicalHandleSigningKeyBytes(statement), root.secretKey));
    await expect(PublicNameService.registerSigningKey(pn, statement, rootPk, sig)).resolves.toEqual({
      signingKey: rootPk,
      rekeyed: 0
    });
    const out = await PublicNameService.claim(pn, 'keyed');
    expect(out.receipt?.receipt.signingKey).toBe(rootPk);
  });

  it('rekeys every held handle when the key changes', async () => {
    const { root, rootPk, pn } = rootIdentity(42);
    db.keys[pn] = rootPk;
    await PublicNameService.claim(pn, 'rekeyme');
    const next = mlDsa65Keygen(new Uint8Array(32).fill(43));
    const nextPk = bytesToBase64(next.publicKey);
    const statement = keyStatement(pn, nextPk);
    const bytes = canonicalHandleSigningKeyBytes(statement);
    const rootSig = bytesToBase64(mlDsa65Sign(bytes, root.secretKey));

    await expect(PublicNameService.registerSigningKey(pn, statement, rootPk, rootSig, null)).rejects.toMatchObject({
      code: 'INVALID_INPUT'
    });
    const keySig = bytesToBase64(mlDsa65Sign(bytes, next.secretKey));
    await expect(PublicNameService.registerSigningKey(pn, statement, rootPk, rootSig, keySig)).resolves.toEqual({
      signingKey: nextPk,
      rekeyed: 1
    });

    const head = await HandleReceiptService.latestForHandle(
      { query: async (sql: string, params?: unknown[]) => run(sql, params as any[]) },
      'rekeyme'
    );
    expect(head?.receipt).toMatchObject({ event: 'rekey', signingKey: nextPk });
    const [held] = await HandleReceiptService.chainsForOwner(
      { query: async (sql: string, params?: unknown[]) => run(sql, params as any[]) },
      pn
    );
    expect(held.chain.map((c) => c.receipt.event)).toEqual(['claim', 'rekey']);
    expect(verifyHandleReceiptChain(held.chain, HandleReceiptService.publicKeyB64()!)).toBe(true);
  });

  it('refuses a statement the pN root did not sign', async () => {
    const { pn } = rootIdentity(44);
    const other = mlDsa65Keygen(new Uint8Array(32).fill(45));
    const otherPk = bytesToBase64(other.publicKey);
    const statement = keyStatement(pn, otherPk);
    const sig = bytesToBase64(mlDsa65Sign(canonicalHandleSigningKeyBytes(statement), other.secretKey));
    await expect(PublicNameService.registerSigningKey(pn, statement, otherPk, sig)).rejects.toMatchObject({
      code: 'INVALID_INPUT'
    });
  });
});

describe('claims and protected names', () => {
  it('lists a first-come claim on the personal feed with a receipt', async () => {
    const out = await PublicNameService.claim('pn-alice', 'ByMjMazzei');
    expect(out.name).toMatchObject({ publicName: 'bymjmazzei', proofType: 'claim', status: 'listed', feedId: 'feed-a' });
    expect(out.receipt?.receipt.event).toBe('claim');
  });

  it('blocks lookalikes of a held handle', async () => {
    await PublicNameService.claim('pn-alice', 'coke');
    await expect(PublicNameService.claim('pn-bob', 'c0ke')).rejects.toMatchObject({ code: 'NAME_TAKEN' });
  });

  it('allows one first-come claim per pN', async () => {
    await PublicNameService.claim('pn-alice', 'first');
    await expect(PublicNameService.claim('pn-alice', 'second')).rejects.toMatchObject({ code: 'CLAIM_LIMIT' });
  });

  it('blocks a protected name without the listed proof and lists it with that proof', async () => {
    db.protectedNames.push({
      skeleton: confusableSkeleton('taylorswift'),
      display: 'Taylor Swift',
      source: 'wikidata',
      required_domains: ['taylorswift.com'],
      required_youtube_channel_ids: []
    });
    await expect(PublicNameService.claim('pn-bob', 'taylor_swift')).rejects.toMatchObject({
      code: 'NAME_PROTECTED',
      details: { requiredDomains: ['taylorswift.com'] }
    });
    provenDomain('pn-bob', 'notswift.com', 'taylorswift', '2010-01-01T00:00:00.000Z');
    await expect(PublicNameService.listName('pn-bob', 'taylorswift')).rejects.toMatchObject({ code: 'NAME_PROTECTED' });
    provenDomain('pn-alice', 'taylorswift.com', 'taylorswift', '2008-01-01T00:00:00.000Z');
    const out = await PublicNameService.listName('pn-alice', 'taylorswift');
    expect(out.name).toMatchObject({ status: 'listed', proofType: 'dns', strength: 3 });
  });
});

describe('earliest provable date wins', () => {
  it('refuses a domain registered after the claim', async () => {
    await PublicNameService.claim('pn-alice', 'bymjmazzei');
    backdate('bymjmazzei', 30);
    provenDomain('pn-bob', 'bymjmazzei.com', 'bymjmazzei', ago(1));
    await expect(PublicNameService.listName('pn-bob', 'bymjmazzei')).rejects.toMatchObject({ code: 'NAME_TAKEN' });
  });

  it('refuses a domain with no registration date', async () => {
    await PublicNameService.claim('pn-alice', 'bymjmazzei');
    provenDomain('pn-bob', 'bymjmazzei.com', 'bymjmazzei', null);
    await expect(PublicNameService.listName('pn-bob', 'bymjmazzei')).rejects.toMatchObject({ code: 'NAME_TAKEN' });
  });

  it('lets a domain registered before the claim supersede it and gives the holder a fallback', async () => {
    await PublicNameService.claim('pn-alice', 'acme');
    provenDomain('pn-bob', 'acme.com', 'acme', '1999-05-01T00:00:00.000Z');
    const out = await PublicNameService.listName('pn-bob', 'acme');
    expect(out.name).toMatchObject({ pnIdentifier: 'pn-bob', status: 'listed', priorityAt: '1999-05-01T00:00:00.000Z' });

    const alice = db.names.filter((r) => r.pn_identifier === 'pn-alice');
    expect(alice.find((r) => r.public_name === 'acme')?.status).toBe('superseded');
    const fallback = alice.find((r) => r.proof_meta?.fallbackFor === 'acme');
    expect(fallback).toMatchObject({ public_name: 'acme-feed', status: 'listed', feed_id: 'feed-a' });

    const mine = await PublicNameService.listMine('pn-alice');
    expect(mine.notices).toContainEqual({ kind: 'superseded', handle: 'acme', fallback: 'acme-feed' });
  });

  it('upgrades your own claim with your domain and keeps the earlier date', async () => {
    await PublicNameService.claim('pn-alice', 'bymjmazzei');
    backdate('bymjmazzei', 100);
    const claimedAt = db.names[0].priority_at;
    provenDomain('pn-alice', 'bymjmazzei.com', 'bymjmazzei', ago(5));
    const out = await PublicNameService.listName('pn-alice', 'bymjmazzei');
    expect(out.name).toMatchObject({ proofType: 'dns', strength: 3, priorityAt: claimedAt, feedId: 'feed-a' });
  });

  it('opens a dispute for a YouTube proof and the holder keeps the name', async () => {
    await PublicNameService.claim('pn-alice', 'gamer');
    db.names.push({
      public_name: 'gamer',
      pn_identifier: 'pn-bob',
      proof_type: 'youtube',
      proof_subject: 'UCxxxxxxxxxxxxxxxxxxxxxx',
      status: 'proven',
      skeleton: confusableSkeleton('gamer'),
      strength: 2,
      proof_meta: {},
      receipt_hash: null
    });
    const out = await PublicNameService.listName('pn-bob', 'gamer');
    expect(out.disputed).toBe(true);
    const holder = db.names.find((r) => r.pn_identifier === 'pn-alice')!;
    expect(holder.status).toBe('disputed');
    expect(db.disputes).toHaveLength(1);
    await expect(PublicNameService.claim('pn-bob', 'gamer')).rejects.toMatchObject({ code: 'NAME_TAKEN' });
  });
});

describe('rename, move, transfer', () => {
  it('renames and holds the old handle for its previous holder', async () => {
    await PublicNameService.claim('pn-alice', 'oldname');
    const out = await PublicNameService.rename('pn-alice', 'oldname', 'newname');
    expect(out.name.publicName).toBe('newname');
    await expect(PublicNameService.claim('pn-bob', 'oldname')).rejects.toMatchObject({ code: 'NAME_RELEASED' });
  });

  it('carries the priority date to the recipient and enforces their claim limit', async () => {
    const root = mlDsa65Keygen(new Uint8Array(32).fill(4));
    const rootPk = bytesToBase64(root.publicKey);
    const alice = deriveCanonicalPnIdentifier(rootPk);
    db.feeds[0].owner_pn_identifier = alice;
    db.keys[alice] = rootPk;
    await PublicNameService.claim(alice, 'gift');
    const priority = db.names[0].priority_at;
    const statement = buildHandleTransferStatement({
      name: 'gift',
      rootPublicKey: rootPk,
      toPnIdentifier: 'pn-bob',
      nonce: 'nonce-abcdefghijklmnop'
    });
    const signature = bytesToBase64(mlDsa65Sign(canonicalHandleTransferBytes(statement), root.secretKey));

    await PublicNameService.claim('pn-bob', 'bobs');
    const { id } = await PublicNameService.createTransfer(alice, statement, signature);
    await expect(PublicNameService.acceptTransfer('pn-bob', id)).rejects.toMatchObject({ code: 'CLAIM_LIMIT' });

    await PublicNameService.release('pn-bob', 'bobs');
    const out = await PublicNameService.acceptTransfer('pn-bob', id);
    expect(out.status).toBe('completed');
    if (out.status !== 'completed') return;
    expect(out.name).toMatchObject({ pnIdentifier: 'pn-bob', feedId: 'feed-b', priorityAt: priority });

    const [held] = await HandleReceiptService.chainsForOwner(
      { query: async (sql: string, params?: unknown[]) => run(sql, params as any[]) },
      'pn-bob'
    );
    expect(held.handle).toBe('gift');
    expect(held.chain.map((c) => c.receipt.event)).toEqual(['claim', 'transfer']);
    expect(held.chain[0].receipt.signingKey).toBe(rootPk);
    expect(held.chain[1].receipt.signingKey).toBe(TEST_KEY);
    expect(verifyHandleReceiptChain(held.chain, HandleReceiptService.publicKeyB64()!)).toBe(true);
  });

  it('moves a proven handle only after the recipient re-proves it', async () => {
    const root = mlDsa65Keygen(new Uint8Array(32).fill(6));
    const rootPk = bytesToBase64(root.publicKey);
    const alice = deriveCanonicalPnIdentifier(rootPk);
    db.feeds[0].owner_pn_identifier = alice;
    db.keys[alice] = rootPk;
    provenDomain(alice, 'shop.com', 'shop', '2001-01-01T00:00:00.000Z');
    await PublicNameService.listName(alice, 'shop');
    const statement = buildHandleTransferStatement({
      name: 'shop',
      rootPublicKey: rootPk,
      toPnIdentifier: 'pn-bob',
      nonce: 'nonce-abcdefghijklmnop'
    });
    const signature = bytesToBase64(mlDsa65Sign(canonicalHandleTransferBytes(statement), root.secretKey));
    const { id } = await PublicNameService.createTransfer(alice, statement, signature);

    const verify = jest.spyOn(PublicNameService, 'verifyDnsProof').mockResolvedValue(false);
    const first = await PublicNameService.acceptTransfer('pn-bob', id);
    expect(first).toMatchObject({ status: 'reproof_required', challenge: { proofType: 'dns', dnsName: '_parnoir.shop.com' } });
    expect(db.names.find((r) => r.public_name === 'shop')?.pn_identifier).toBe(alice);

    verify.mockResolvedValue(true);
    const second = await PublicNameService.acceptTransfer('pn-bob', id);
    expect(second.status).toBe('completed');
    expect(db.names.find((r) => r.public_name === 'shop')?.pn_identifier).toBe('pn-bob');
    verify.mockRestore();
  });

  it('rejects a transfer the root did not sign', async () => {
    await PublicNameService.claim('pn-alice', 'gift');
    const other = mlDsa65Keygen(new Uint8Array(32).fill(8));
    const statement = buildHandleTransferStatement({
      name: 'gift',
      rootPublicKey: bytesToBase64(other.publicKey),
      toPnIdentifier: 'pn-bob',
      nonce: 'nonce-abcdefghijklmnop'
    });
    const signature = bytesToBase64(mlDsa65Sign(canonicalHandleTransferBytes(statement), other.secretKey));
    await expect(PublicNameService.createTransfer('pn-alice', statement, signature)).rejects.toMatchObject({
      code: 'INVALID_INPUT'
    });
  });
});

describe('expiry sweep', () => {
  it('expires an unverified, unproven, inactive claim and skips the rest', async () => {
    feed('pn-carol', 'feed-c');
    feed('pn-dave', 'feed-d');
    await PublicNameService.claim('pn-alice', 'idle');
    await PublicNameService.claim('pn-bob', 'verifiedidle');
    await PublicNameService.claim('pn-carol', 'active');
    await PublicNameService.claim('pn-dave', 'soon');
    for (const n of ['idle', 'verifiedidle', 'active']) backdate(n, 120);
    backdate('soon', (EXPIRY_INACTIVE_MS - EXPIRY_NOTICE_MS) / DAY + 1);
    db.verified.push('pn-bob');
    db.feeds.find((f) => f.feed_id === 'feed-c')!.last_activity_at = ago(3);
    provenDomain('pn-alice', 'proven.com', 'provenname', '2000-01-01T00:00:00.000Z');

    const out = await PublicNameService.runExpirySweep();
    expect(out).toEqual({ expired: 1, noticed: 1 });
    const status = (n: string) => db.names.find((r) => r.public_name === n)?.status;
    expect(status('idle')).toBe('expired');
    expect(status('verifiedidle')).toBe('listed');
    expect(status('active')).toBe('listed');
    expect(status('soon')).toBe('listed');
    expect(db.names.find((r) => r.public_name === 'soon')?.expiry_notified_at).toBeTruthy();
  });
});
