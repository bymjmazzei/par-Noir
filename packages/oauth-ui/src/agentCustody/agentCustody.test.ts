import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveCanonicalPnIdentifier } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import { EncryptionManager } from '@par-noir/identity-crypto';
import { AI_SCOPES, PRIVATE_TEXT_MAX_CHARS } from '@par-noir/standard-data-points';
import { agentVaultNickname } from '../hostedShell/agentIdentity';
import { createAgentJwksSource, verifyAgentAccessToken } from './agentToken';
import { createAgentCustodyBridge, agentApprovalPrompt } from './custodyBridge';
import { AgentCustodySessions } from './custodySessions';
import { fetchAgentDelegationStatus } from './delegationStatus';
import { AgentCustodyError } from './errors';
import type { OwnerCustody } from './ownerCustody';
import { findAgentOnThisMac, resolveAgentOwner } from './ownerMapping';
import { readPrivateFileText, searchPrivate } from './privateReads';

const SECRETS = {
  ownerPnName: 'owner-PNNAME-do-not-leak',
  ownerPasscode: 'owner-PASSCODE-do-not-leak',
  agentPnName: 'agent-PNNAME-do-not-leak',
  agentPasscode: 'agent-PASSCODE-do-not-leak',
  driveToken: 'ya29.DRIVE-TOKEN-do-not-leak',
  mlKem: 'MLKEM-SECRET-do-not-leak',
};

function assertNoSecrets(text: string) {
  for (const s of Object.values(SECRETS)) expect(text).not.toContain(s);
}

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const b64urlJson = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));

async function rsaKeys() {
  return crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
}

async function pemX5c(pub: CryptoKey): Promise<string> {
  const der = new Uint8Array(await crypto.subtle.exportKey('spki', pub));
  const body = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, '$1\n');
  return btoa(`-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----\n`);
}

async function signJwt(priv: CryptoKey, payload: Record<string, unknown>, kid = 'k1', alg = 'RS256') {
  const input = `${b64urlJson({ alg, typ: 'JWT', kid })}.${b64urlJson(payload)}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', priv, new TextEncoder().encode(input));
  return `${input}.${b64url(sig)}`;
}

const NOW = Date.parse('2026-10-21T12:00:00Z');
const AGENT_PUBLIC_KEY = 'agent-public-key-b64';
const AGENT_PN = deriveCanonicalPnIdentifier(AGENT_PUBLIC_KEY);
const OWNER_ID = 'did:key:owner0000000000';

function agentPayload(over: Record<string, unknown> = {}) {
  return {
    pnIdentifier: AGENT_PN,
    clientId: 'pn-agent-mcp',
    scope: ['openid', AI_SCOPES.filesPrivate, AI_SCOPES.penPrivate],
    exp: Math.floor(NOW / 1000) + 600,
    ...over,
  };
}

function jwksFetch(keys: unknown[]) {
  return vi.fn(async () => new Response(JSON.stringify({ keys }), { status: 200 }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('agent token check', () => {
  it('accepts an API-signed agent token via the PEM x5c key', async () => {
    const { publicKey, privateKey } = await rsaKeys();
    const jwks = createAgentJwksSource({
      apiEndpoint: 'https://api.test',
      fetchImpl: jwksFetch([{ kty: 'RSA', alg: 'RS256', kid: 'k1', x5c: [await pemX5c(publicKey)] }]),
    });
    const claims = await verifyAgentAccessToken(await signJwt(privateKey, agentPayload()), jwks, NOW);
    expect(claims.agentPnIdentifier).toBe(AGENT_PN);
    expect(claims.scopes).toEqual([AI_SCOPES.filesPrivate, AI_SCOPES.penPrivate]);
  });

  it('accepts n/e JWKs too', async () => {
    const { publicKey, privateKey } = await rsaKeys();
    const jwk = await crypto.subtle.exportKey('jwk', publicKey);
    const jwks = createAgentJwksSource({
      apiEndpoint: 'https://api.test',
      fetchImpl: jwksFetch([{ kty: 'RSA', kid: 'k1', n: jwk.n, e: jwk.e }]),
    });
    await expect(verifyAgentAccessToken(await signJwt(privateKey, agentPayload()), jwks, NOW)).resolves.toBeTruthy();
  });

  it('rejects forged, expired, first-party and alg-swapped tokens as access_revoked', async () => {
    const real = await rsaKeys();
    const forger = await rsaKeys();
    const jwks = createAgentJwksSource({
      apiEndpoint: 'https://api.test',
      fetchImpl: jwksFetch([{ kty: 'RSA', kid: 'k1', x5c: [await pemX5c(real.publicKey)] }]),
      now: () => NOW,
    });
    const cases = [
      await signJwt(forger.privateKey, agentPayload()),
      await signJwt(real.privateKey, agentPayload({ exp: Math.floor(NOW / 1000) - 1 })),
      await signJwt(real.privateKey, agentPayload({ clientId: 'browser-app' })),
      await signJwt(real.privateKey, agentPayload({ pnIdentifier: '' })),
      await signJwt(real.privateKey, agentPayload(), 'k1', 'none'),
      'not.a.jwt',
    ];
    for (const token of cases) {
      await expect(verifyAgentAccessToken(token, jwks, NOW)).rejects.toMatchObject({ code: 'access_revoked' });
    }
  });

  it('refetches the key set when an unknown kid shows up after rotation', async () => {
    const oldKeys = await rsaKeys();
    const newKeys = await rsaKeys();
    let t = NOW;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ keys: [{ kty: 'RSA', kid: 'old', x5c: [await pemX5c(oldKeys.publicKey)] }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ keys: [{ kty: 'RSA', kid: 'new', x5c: [await pemX5c(newKeys.publicKey)] }] })));
    const jwks = createAgentJwksSource({ apiEndpoint: 'https://api.test', fetchImpl, now: () => t });
    await verifyAgentAccessToken(await signJwt(oldKeys.privateKey, agentPayload(), 'old'), jwks, NOW);
    t += 60_000;
    await verifyAgentAccessToken(await signJwt(newKeys.privateKey, agentPayload(), 'new'), jwks, NOW);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('delegation status', () => {
  const call = (res: Response) =>
    fetchAgentDelegationStatus({ apiEndpoint: 'https://api.test/', agentToken: 't', fetchImpl: vi.fn(async () => res) });

  it('returns {active, scopes} and drops unknown scopes', async () => {
    await expect(
      call(new Response(JSON.stringify({ active: true, scopes: [AI_SCOPES.filesPrivate, 'ai:root'] })))
    ).resolves.toEqual({ active: true, scopes: [AI_SCOPES.filesPrivate] });
    await expect(call(new Response(JSON.stringify({ active: false, scopes: [AI_SCOPES.filesPrivate] })))).resolves.toEqual({
      active: false,
      scopes: [],
    });
  });

  it('maps 401/403 to access_revoked and anything else to unavailable', async () => {
    await expect(call(new Response('{}', { status: 401 }))).rejects.toMatchObject({ code: 'access_revoked' });
    await expect(call(new Response('{}', { status: 403 }))).rejects.toMatchObject({ code: 'access_revoked' });
    await expect(call(new Response('{}', { status: 503 }))).rejects.toMatchObject({ code: 'unavailable' });
    await expect(call(new Response('{"active":"yes"}'))).rejects.toMatchObject({ code: 'unavailable' });
  });
});

const agentEntry = {
  identityId: 'did:key:agent00000000000',
  publicKey: AGENT_PUBLIC_KEY,
  pnName: SECRETS.agentPnName,
  passcode: SECRETS.agentPasscode,
  encryptedIdentityJson: '{"agent":true}',
  nickname: agentVaultNickname('Claude desktop'),
  ownerIdentityId: OWNER_ID,
};
const ownerEntry = {
  identityId: OWNER_ID,
  publicKey: 'owner-public-key-b64',
  pnName: SECRETS.ownerPnName,
  passcode: SECRETS.ownerPasscode,
  encryptedIdentityJson: '{"owner":true}',
  nickname: 'Me',
};
const listing = [agentEntry, ownerEntry].map(({ identityId, publicKey, nickname }) => ({ identityId, publicKey, nickname }));

describe('owner mapping', () => {
  it('finds an agent this Mac added and labels it without secrets', () => {
    expect(findAgentOnThisMac(listing, AGENT_PN)).toEqual({ label: 'Claude desktop' });
  });

  it('refuses agents this Mac did not add, or whose owner is not saved here', () => {
    expect(() => findAgentOnThisMac(listing, 'pn-000000000000')).toThrow(AgentCustodyError);
    // A person entry with the same key is not an agent entry.
    expect(() => findAgentOnThisMac([{ ...listing[0]!, nickname: 'Me' }], AGENT_PN)).toThrow(/agent_not_on_this_mac/);
    expect(resolveAgentOwner([agentEntry, ownerEntry], AGENT_PN)).toBe(ownerEntry);
    expect(() => resolveAgentOwner([agentEntry], AGENT_PN)).toThrow(/agent_not_on_this_mac/);
    expect(() => resolveAgentOwner([{ ...agentEntry, ownerIdentityId: undefined }, ownerEntry], AGENT_PN)).toThrow(
      /agent_not_on_this_mac/
    );
    // The owner id must not point at another agent.
    const otherAgent = { ...ownerEntry, nickname: agentVaultNickname('other') };
    expect(() => resolveAgentOwner([agentEntry, otherAgent], AGENT_PN)).toThrow(/agent_not_on_this_mac/);
  });
});

describe('session window', () => {
  it('asks once per agent per hour, then wipes and asks again', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const wipe = vi.fn();
    const sessions = new AgentCustodySessions<{ n: number }>({ wipe });
    const open = vi.fn(async (): Promise<{ n: number }> => ({ n: open.mock.calls.length }));
    const [a, b] = await Promise.all([sessions.acquire('pn-a', open), sessions.acquire('pn-a', open)]);
    expect(a).toBe(b);
    await sessions.acquire('pn-a', open);
    expect(open).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(wipe).toHaveBeenCalledWith(a);
    expect(sessions.has('pn-a')).toBe(false);
    await sessions.acquire('pn-a', open);
    expect(open).toHaveBeenCalledTimes(2);

    sessions.wipeAll();
    expect(wipe).toHaveBeenCalledTimes(2);
  });

  it('does not re-prompt during the cooldown after the owner declines', async () => {
    let t = NOW;
    const sessions = new AgentCustodySessions<object>({ wipe: vi.fn(), now: () => t });
    const open = vi.fn(async () => {
      throw new AgentCustodyError('owner_declined');
    });
    await expect(sessions.acquire('pn-a', open)).rejects.toMatchObject({ code: 'owner_declined' });
    await expect(sessions.acquire('pn-a', open)).rejects.toMatchObject({ code: 'owner_declined' });
    expect(open).toHaveBeenCalledTimes(1);
    t += 11 * 60 * 1000;
    await expect(sessions.acquire('pn-a', open)).rejects.toMatchObject({ code: 'owner_declined' });
    expect(open).toHaveBeenCalledTimes(2);
  });
});

const fileOwner = { id: OWNER_ID, publicKey: 'owner-public-key-b64' };
const FOLDER = 'files-folder-0001';

function custody(): OwnerCustody {
  return {
    ownerPnIdentifier: 'pn-owner0000000',
    fileOwner,
    mlKemSecretKey: SECRETS.mlKem,
    credentials: { access_token: SECRETS.driveToken },
    layout: {
      schemaVersion: 1,
      pnFolderId: 'pn-folder-0001',
      metadataFolderId: 'meta',
      integratorsRootId: 'int',
      messagesFolderId: 'msg',
      inboxSheetId: 'inbox',
      filesFolderId: FOLDER,
      sheetIds: {},
      conversationSheets: {},
    },
  };
}

async function sealed(text: string, mime: string) {
  const enc = await new EncryptionManager().encrypt(new TextEncoder().encode(text), fileOwner.id, fileOwner.publicKey);
  return JSON.stringify({ version: '1', ...enc, metadata: { originalName: 'x', originalMimeType: mime } });
}

function fakeDrive(files: Record<string, { name: string; parents: string[]; size?: string; body?: string }>) {
  const seen: string[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    seen.push(url.toString());
    const m = url.pathname.match(/\/drive\/v3\/files\/([^/]+)$/);
    if (m) {
      const f = files[decodeURIComponent(m[1]!)];
      if (!f) return new Response('{}', { status: 404 });
      if (url.searchParams.get('alt') === 'media') return new Response(f.body || '');
      return new Response(JSON.stringify({ id: m[1], name: f.name, parents: f.parents, size: f.size }));
    }
    if (url.pathname.endsWith('/drive/v3/files')) {
      const list = Object.entries(files)
        .filter(([, f]) => f.parents.includes(FOLDER))
        .map(([id, f]) => ({ id, name: f.name, modifiedTime: '2026-10-01T00:00:00Z', mimeType: 'application/json' }));
      return new Response(JSON.stringify({ files: list }));
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', impl);
  return seen;
}

describe('private reads', () => {
  it('reads a cabinet text file as allowlisted, capped text', async () => {
    const long = 'x'.repeat(PRIVATE_TEXT_MAX_CHARS + 50);
    fakeDrive({ 'file-text-0001': { name: 'notes.md.encrypted', parents: [FOLDER], size: '100', body: await sealed(long, 'text/markdown') } });
    const out = await readPrivateFileText({ accessToken: SECRETS.driveToken, custody: custody() }, 'file-text-0001');
    expect(out).toMatchObject({ fileId: 'file-text-0001', name: 'notes.md', mimeType: 'text/markdown', truncated: true });
    expect(out.text).toHaveLength(PRIVATE_TEXT_MAX_CHARS);
    expect(Object.keys(out).sort()).toEqual(['fileId', 'mimeType', 'name', 'text', 'truncated']);
  });

  it('refuses files outside the private cabinet, non-text types and oversized packages', async () => {
    fakeDrive({
      'file-other-0001': { name: 'secret.txt.encrypted', parents: ['someone-elses-folder'] },
      'file-plain-0001': { name: 'plain.txt', parents: [FOLDER] },
      'file-pdf-00001': { name: 'scan.pdf.encrypted', parents: [FOLDER], size: '10' },
      'file-huge-0001': { name: 'big.txt.encrypted', parents: [FOLDER], size: String(64 * 1024 * 1024) },
    });
    const ctx = { accessToken: SECRETS.driveToken, custody: custody() };
    await expect(readPrivateFileText(ctx, 'file-other-0001')).rejects.toMatchObject({ code: 'not_found' });
    await expect(readPrivateFileText(ctx, 'file-plain-0001')).rejects.toMatchObject({ code: 'not_found' });
    await expect(readPrivateFileText(ctx, 'file-missing-01')).rejects.toMatchObject({ code: 'not_found' });
    await expect(readPrivateFileText(ctx, '../../etc')).rejects.toMatchObject({ code: 'not_found' });
    await expect(readPrivateFileText(ctx, 'file-pdf-00001')).rejects.toMatchObject({ code: 'unsupported_type' });
    await expect(readPrivateFileText(ctx, 'file-huge-0001')).rejects.toMatchObject({ code: 'too_large' });
  });

  it('searches cabinet names only within the files folder and strips the package suffix', async () => {
    const seen = fakeDrive({
      'file-a-000001': { name: "Tax's plan.txt.encrypted", parents: [FOLDER] },
      'file-b-000001': { name: 'stray.txt', parents: [FOLDER] },
    });
    const out = await searchPrivate({ accessToken: SECRETS.driveToken, custody: custody() }, { query: "Tax's", files: true, pen: false });
    expect(out.files).toEqual([
      { fileId: 'file-a-000001', name: "Tax's plan.txt", mimeType: 'text/plain', modifiedTime: '2026-10-01T00:00:00.000Z' },
    ]);
    expect(out.penDocuments).toEqual([]);
    const q = new URL(seen[0]!).searchParams.get('q') || '';
    expect(q).toContain(`'${FOLDER}' in parents`);
    expect(q).toContain("name contains 'Tax\\'s'");
  });
});

describe('custody bridge', () => {
  async function setup(
    opts: {
      status?: { active: boolean; scopes: string[] };
      scope?: string[];
      decline?: boolean;
      openOwner?: () => Promise<OwnerCustody>;
      listing?: typeof listing;
    } = {}
  ) {
    const { publicKey, privateKey } = await rsaKeys();
    const jwks = createAgentJwksSource({
      apiEndpoint: 'https://api.test',
      fetchImpl: jwksFetch([{ kty: 'RSA', kid: 'k1', x5c: [await pemX5c(publicKey)] }]),
    });
    const token = await signJwt(privateKey, agentPayload(opts.scope ? { scope: opts.scope } : {}));
    const status = { current: opts.status ?? { active: true, scopes: [AI_SCOPES.filesPrivate, AI_SCOPES.penPrivate] } };
    const unlockVaultEntries = vi.fn(async () => (opts.decline ? null : [agentEntry, ownerEntry]));
    const openOwner = vi.fn(opts.openOwner ?? (async () => custody()));
    const search = vi.fn(async () => ({
      files: [{ fileId: 'f1', name: 'a.txt', mimeType: 'text/plain', modifiedTime: null }],
      penDocuments: [],
    }));
    const wipe = vi.fn();
    const bridge = createAgentCustodyBridge({
      apiEndpoint: 'https://api.test',
      jwks,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify(status.current))),
      listVaultIdentities: async () => opts.listing ?? listing,
      unlockVaultEntries,
      openOwner,
      driveToken: async () => SECRETS.driveToken,
      reads: { search, readFile: vi.fn(), readPen: vi.fn() },
      sessions: new AgentCustodySessions<OwnerCustody>({ wipe, now: () => NOW }),
      now: () => NOW,
    });
    const line = (tool: string, args: Record<string, unknown> = {}) =>
      JSON.stringify({ v: 1, id: 'req-1', token, tool, args });
    const send = async (tool: string, args?: Record<string, unknown>) =>
      JSON.parse(await bridge.handleLine(line(tool, args)));
    return { bridge, line, send, status, unlockVaultEntries, openOwner, search, wipe };
  }

  it('prompts the owner once with the agent label, then answers allowlisted results', async () => {
    const s = await setup();
    const first = await s.bridge.handleLine(s.line('search_private_files', { query: 'a' }));
    await s.bridge.handleLine(s.line('search_private_files', { query: 'b' }));
    expect(JSON.parse(first)).toEqual({
      v: 1,
      id: 'req-1',
      ok: true,
      result: { files: [{ fileId: 'f1', name: 'a.txt', mimeType: 'text/plain', modifiedTime: null }], penDocuments: [] },
    });
    expect(s.unlockVaultEntries).toHaveBeenCalledTimes(1);
    expect(s.unlockVaultEntries).toHaveBeenCalledWith(agentApprovalPrompt('Claude desktop'));
    expect(agentApprovalPrompt('Claude desktop')).toBe(
      'Allow AI agent Claude desktop to read your private files for 1 hour?'
    );
    expect(s.openOwner).toHaveBeenCalledWith(ownerEntry);
    assertNoSecrets(first);
  });

  it('searches only the kinds both the token and the delegation still grant', async () => {
    const s = await setup({ status: { active: true, scopes: [AI_SCOPES.penPrivate] } });
    await s.bridge.handleLine(s.line('search_private_files'));
    expect(s.search).toHaveBeenCalledWith(expect.anything(), { query: undefined, files: false, pen: true });
    const denied = JSON.parse(await s.bridge.handleLine(s.line('read_private_file', { fileId: 'f1' })));
    expect(denied).toEqual({ v: 1, id: 'req-1', ok: false, error: 'insufficient_scope' });
  });

  it('refuses before any Touch ID when revoked, unscoped, or not added on this Mac', async () => {
    const revoked = await setup({ status: { active: false, scopes: [] } });
    expect((await revoked.send('search_private_files')).error).toBe('access_revoked');
    expect(revoked.unlockVaultEntries).not.toHaveBeenCalled();

    const unscoped = await setup({ scope: ['openid', AI_SCOPES.filesPublished] });
    expect((await unscoped.send('search_private_files')).error).toBe('insufficient_scope');
    expect(unscoped.unlockVaultEntries).not.toHaveBeenCalled();

    const elsewhere = await setup({ listing: [listing[1]!] });
    expect((await elsewhere.send('search_private_files')).error).toBe('agent_not_on_this_mac');
    expect(elsewhere.unlockVaultEntries).not.toHaveBeenCalled();
  });

  it('reports owner_declined, and wipes an open hour when the delegation is revoked', async () => {
    const declined = await setup({ decline: true });
    expect((await declined.send('search_private_files')).error).toBe('owner_declined');
    expect(declined.openOwner).not.toHaveBeenCalled();

    const s = await setup();
    expect((await s.send('search_private_files')).ok).toBe(true);
    s.status.current = { active: false, scopes: [] };
    expect((await s.send('search_private_files')).error).toBe('access_revoked');
    expect(s.wipe).toHaveBeenCalledTimes(1);
  });

  it('answers malformed lines with invalid_request and no detail', async () => {
    const s = await setup();
    expect(JSON.parse(await s.bridge.handleLine('not json'))).toEqual({ v: 1, id: '0', ok: false, error: 'invalid_request' });
    expect(JSON.parse(await s.bridge.handleLine(JSON.stringify({ v: 1, id: 'abc', tool: 'x' })))).toEqual({
      v: 1,
      id: 'abc',
      ok: false,
      error: 'invalid_request',
    });
  });

  it('never puts vault factors, Drive tokens or keys on the wire, even when unlocking fails', async () => {
    const ok = await setup();
    const failing = await setup({
      openOwner: async () => {
        throw new Error(`decrypt failed for ${SECRETS.ownerPnName} / ${SECRETS.ownerPasscode} ${SECRETS.mlKem}`);
      },
    });
    const outputs = [
      await ok.bridge.handleLine(ok.line('search_private_files')),
      await ok.bridge.handleLine(ok.line('read_private_file', { fileId: 'f1' })),
      await failing.bridge.handleLine(failing.line('search_private_files')),
    ];
    expect(JSON.parse(outputs[2]!)).toEqual({ v: 1, id: 'req-1', ok: false, error: 'unavailable' });
    for (const out of outputs) assertNoSecrets(out);
  });
});
