/**
 * @jest-environment node
 *
 * AI agent registry: only known ai: scopes are delegated, the agent key must match its pN,
 * the owner's root key must sign a delegation that matches the request, and revoke deletes
 * the agent's refresh tokens so the MCP cannot mint new access tokens.
 */

import { bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Keygen, mlDsa65Sign } from '@par-noir/pqc-crypto/ml-dsa';
import { canonicalDelegationBytes, type AgentDelegationStatement } from '@par-noir/standard-data-points';

const queries: Array<{ sql: string; params: unknown[] }> = [];
let responder: (sql: string) => { rows: Record<string, unknown>[] } = () => ({ rows: [] });

jest.mock('../utils/database', () => ({
  getDatabasePool: () => ({
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return responder(sql);
    }),
  }),
}));

const mockKeyOwners = new Map<string, string>();
jest.mock('@par-noir/pqc-crypto/oauth-unlock-proof', () => ({
  assertMlDsa65PublicKeyB64: (pk: string) => pk.startsWith('pk-') || mockKeyOwners.has(pk),
  deriveCanonicalPnIdentifier: (pk: string) => mockKeyOwners.get(pk) ?? `pn-${pk.slice(3)}`,
}));

jest.mock('./auditService', () => ({ appendAuditEvent: jest.fn(async () => undefined) }));
jest.mock('./identitySuccessionService', () => ({ isPnRevokedForNetwork: () => false }));
jest.mock('./ownedAssetStorageService', () => ({ loadOwnedAssetDriveBundle: jest.fn() }));
jest.mock('./ownedAssetsSheetsService', () => ({ OwnedAssetsSheetsService: {} }));

import { OwnedAssetService } from './ownedAssetService';

const ROOT = 'pn-root';
const NOW = Date.parse('2026-10-21T13:05:00.000Z');

const rootKeys = mlDsa65Keygen(new Uint8Array(32).fill(1));
const otherKeys = mlDsa65Keygen(new Uint8Array(32).fill(2));
const ROOT_PK = bytesToBase64(rootKeys.publicKey);
const OTHER_PK = bytesToBase64(otherKeys.publicKey);
mockKeyOwners.set(ROOT_PK, ROOT);
mockKeyOwners.set(OTHER_PK, 'pn-other');

function statementFor(overrides: Partial<AgentDelegationStatement> = {}): AgentDelegationStatement {
  return {
    v: 1,
    rootPublicKey: ROOT_PK,
    agentPnIdentifier: 'pn-agent1',
    agentPublicKey: 'pk-agent1',
    scopes: ['ai:files.published', 'ai:proofs'],
    attestations: [{ dataPointId: 'over_18', satisfied: true, level: 'attested', expiresAt: null }],
    issuedAt: '2026-10-21T13:00:00.000Z',
    expiresAt: null,
    nonce: 'nonce-abcdefghijklmnop',
    ...overrides,
  };
}

function sign(statement: AgentDelegationStatement, secretKey = rootKeys.secretKey): string {
  return bytesToBase64(mlDsa65Sign(canonicalDelegationBytes(statement), secretKey));
}

function signed(overrides: Partial<AgentDelegationStatement> = {}) {
  const statement = statementFor(overrides);
  return { statement, signature: sign(statement) };
}

const BASE = {
  rootPn: ROOT,
  subjectPnIdentifier: 'pn-agent1',
  subjectPublicKey: 'pk-agent1',
  label: 'Cursor',
  scopes: ['ai:files.published', 'ai:proofs'],
  now: NOW,
};

beforeEach(() => {
  queries.length = 0;
  responder = () => ({ rows: [] });
});

describe('OwnedAssetService AI agents', () => {
  it('rejects a public key that does not derive the agent pN', async () => {
    await expect(
      OwnedAssetService.registerAgent({ ...BASE, ...signed(), subjectPublicKey: 'pk-someoneelse' })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(queries).toHaveLength(0);
  });

  it('rejects registering the root itself as an agent', async () => {
    await expect(
      OwnedAssetService.registerAgent({ ...BASE, ...signed(), subjectPnIdentifier: ROOT, subjectPublicKey: 'pk-root' })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('delegates only known ai: scopes to pn-agent-mcp and stores the signed statement', async () => {
    const { statement, signature } = signed({ scopes: ['ai:files.published'], attestations: [] });
    const reg = await OwnedAssetService.registerAgent({
      ...BASE,
      scopes: ['ai:files.published', 'cloud:app', 'ai:unknown', 'ai:files.published'],
      statement,
      signature,
    });
    expect(reg.delegations.map((d) => d.scope)).toEqual(['ai:files.published']);
    const inserts = queries.filter((q) => q.sql.includes('INSERT INTO pn_asset_delegations'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params).toContain('pn-agent-mcp');
    const asset = queries.find((q) => q.sql.includes('INSERT INTO pn_owned_assets'));
    expect(asset?.params).toContain('pk-agent1');
    expect(asset?.params).toContain(signature);
    expect(JSON.parse(String(asset?.params[5]))).toMatchObject({ rootPublicKey: ROOT_PK, scopes: ['ai:files.published'] });
  });

  it('accepts the statement as the JSON string Unlock returns', async () => {
    const { statement, signature } = signed();
    await expect(
      OwnedAssetService.registerAgent({ ...BASE, statement: JSON.stringify(statement), signature })
    ).resolves.toMatchObject({ subjectPnIdentifier: 'pn-agent1' });
  });

  it('refuses scopes with no known ai: entry', async () => {
    await expect(
      OwnedAssetService.registerAgent({ ...BASE, ...signed(), scopes: ['cloud:app', 'profile'] })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('requires a signed statement', async () => {
    await expect(
      OwnedAssetService.registerAgent({ ...BASE, statement: undefined, signature: '' })
    ).rejects.toThrow('agent_statement_required');
    await expect(
      OwnedAssetService.registerAgent({ ...BASE, statement: statementFor(), signature: '' })
    ).rejects.toThrow('agent_statement_required');
    expect(queries).toHaveLength(0);
  });

  it('rejects a signature that does not verify against the root key', async () => {
    const statement = statementFor();
    await expect(
      OwnedAssetService.registerAgent({ ...BASE, statement, signature: sign(statement, otherKeys.secretKey) })
    ).rejects.toThrow('agent_signature_invalid');
    const tampered = { ...statement, attestations: [{ ...statement.attestations[0], satisfied: false }] };
    await expect(
      OwnedAssetService.registerAgent({ ...BASE, statement: tampered, signature: sign(statement) })
    ).rejects.toThrow('agent_signature_invalid');
    expect(queries).toHaveLength(0);
  });

  it('rejects a statement signed by a different root pN', async () => {
    const statement = statementFor({ rootPublicKey: OTHER_PK });
    await expect(
      OwnedAssetService.registerAgent({ ...BASE, statement, signature: sign(statement, otherKeys.secretKey) })
    ).rejects.toThrow('agent_statement_root_mismatch');
  });

  it('rejects a statement that does not match the request body', async () => {
    await expect(
      OwnedAssetService.registerAgent({ ...BASE, ...signed(), scopes: ['ai:files.published', 'ai:proofs', 'ai:pen.drafts'] })
    ).rejects.toThrow('agent_statement_mismatch');
    await expect(
      OwnedAssetService.registerAgent({ ...BASE, ...signed({ agentPublicKey: 'pk-agent2' }) })
    ).rejects.toThrow('agent_statement_mismatch');
    await expect(
      OwnedAssetService.registerAgent({ ...BASE, ...signed(), expiresAt: '2027-01-01T00:00:00.000Z' })
    ).rejects.toThrow('agent_statement_mismatch');
    expect(queries).toHaveLength(0);
  });

  it('rejects stale statements', async () => {
    await expect(
      OwnedAssetService.registerAgent({ ...BASE, ...signed({ issuedAt: '2026-10-21T10:00:00.000Z' }) })
    ).rejects.toThrow('agent_statement_stale');
  });

  it('refuses a subject owned by another root', async () => {
    responder = (sql) =>
      sql.includes('SELECT id, root_pn_identifier')
        ? { rows: [{ id: 'a1', root_pn_identifier: 'pn-other', kind: 'ai_agent' }] }
        : { rows: [] };
    await expect(OwnedAssetService.registerAgent({ ...BASE, ...signed() })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('revoke marks rows revoked and deletes the agent refresh tokens of every agent-class client', async () => {
    responder = (sql) =>
      sql.includes('RETURNING id, subject_public_key')
        ? { rows: [{ id: 'asset-1', subject_public_key: 'pk-agent1' }] }
        : { rows: [] };
    expect(await OwnedAssetService.revokeAgent(ROOT, 'asset-1')).toBe(true);
    const del = queries.find((q) => q.sql.includes('DELETE FROM oauth_refresh_tokens'));
    expect(del?.sql).toContain('client_id = $2 OR client_id LIKE $3');
    expect(del?.params).toEqual([['pk-agent1'], 'pn-agent-mcp', 'pn-connector-%']);
    expect(queries.some((q) => q.sql.includes("UPDATE pn_asset_delegations SET status = 'revoked'"))).toBe(true);
  });

  it('revoke of an unknown agent touches no tokens', async () => {
    expect(await OwnedAssetService.revokeAgent(ROOT, 'missing')).toBe(false);
    expect(queries.some((q) => q.sql.includes('DELETE FROM oauth_refresh_tokens'))).toBe(false);
  });

  it('revoke-all cuts every agent under the root', async () => {
    responder = (sql) =>
      sql.includes('RETURNING id, subject_public_key')
        ? {
            rows: [
              { id: 'a1', subject_public_key: 'pk-1' },
              { id: 'a2', subject_public_key: 'pk-2' },
            ],
          }
        : { rows: [] };
    expect(await OwnedAssetService.revokeAllAgents(ROOT)).toBe(2);
    const del = queries.find((q) => q.sql.includes('DELETE FROM oauth_refresh_tokens'));
    expect(del?.params).toEqual([['pk-1', 'pk-2'], 'pn-agent-mcp', 'pn-connector-%']);
  });
});

describe('resolveAgentDelegation', () => {
  function rows(statement: unknown, scopes = ['ai:files.published', 'ai:proofs']) {
    responder = () => ({
      rows: scopes.map((scope) => ({ id: 'a1', root_pn_identifier: ROOT, delegation_statement: statement, scope })),
    });
  }

  it('resolves no delegation when nothing is active', async () => {
    expect(await OwnedAssetService.resolveAgentDelegation('pn-agent1', NOW)).toBeNull();
  });

  it('resolves live signed scopes with attestations and drops unknown ones', async () => {
    const statement = statementFor();
    rows(statement, ['ai:files.published', 'ai:proofs', '*']);
    expect(await OwnedAssetService.resolveAgentDelegation('pn-agent1', NOW)).toEqual({
      assetId: 'a1',
      rootPnIdentifier: ROOT,
      scopes: ['ai:files.published', 'ai:proofs'],
      attestations: statement.attestations,
      statement,
    });
  });

  it('fails closed for an agent with no signed statement', async () => {
    rows(null);
    expect(await OwnedAssetService.resolveAgentDelegation('pn-agent1', NOW)).toBeNull();
  });

  it('never honors a scope the owner did not sign', async () => {
    rows(statementFor({ scopes: ['ai:files.published'], attestations: [] }), ['ai:files.published', 'ai:pen.drafts']);
    const d = await OwnedAssetService.resolveAgentDelegation('pn-agent1', NOW);
    expect(d?.scopes).toEqual(['ai:files.published']);
  });

  it('honors the statement expiry', async () => {
    rows(statementFor({ expiresAt: '2026-10-21T13:04:00.000Z' }));
    expect(await OwnedAssetService.resolveAgentDelegation('pn-agent1', NOW)).toBeNull();
  });

  it('rejects a statement bound to another agent', async () => {
    rows(statementFor({ agentPnIdentifier: 'pn-agent2' }));
    expect(await OwnedAssetService.resolveAgentDelegation('pn-agent1', NOW)).toBeNull();
  });
});
