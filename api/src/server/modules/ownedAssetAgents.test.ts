/**
 * @jest-environment node
 *
 * AI agent registry: only known ai: scopes are delegated, the agent key must match its pN,
 * and revoke deletes the agent's refresh tokens so the MCP cannot mint new access tokens.
 */

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

jest.mock('@par-noir/pqc-crypto/oauth-unlock-proof', () => ({
  assertMlDsa65PublicKeyB64: (pk: string) => pk.startsWith('pk-'),
  deriveCanonicalPnIdentifier: (pk: string) => `pn-${pk.slice(3)}`,
}));

jest.mock('./auditService', () => ({ appendAuditEvent: jest.fn(async () => undefined) }));
jest.mock('./identitySuccessionService', () => ({ isPnRevokedForNetwork: () => false }));
jest.mock('./ownedAssetStorageService', () => ({ loadOwnedAssetDriveBundle: jest.fn() }));
jest.mock('./ownedAssetsSheetsService', () => ({ OwnedAssetsSheetsService: {} }));

import { OwnedAssetService } from './ownedAssetService';

const ROOT = 'pn-root';

beforeEach(() => {
  queries.length = 0;
  responder = () => ({ rows: [] });
});

describe('OwnedAssetService AI agents', () => {
  it('rejects a public key that does not derive the agent pN', async () => {
    await expect(
      OwnedAssetService.registerAgent({
        rootPn: ROOT,
        subjectPnIdentifier: 'pn-agent1',
        subjectPublicKey: 'pk-someoneelse',
        label: 'Cursor',
        scopes: ['ai:files.published'],
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(queries).toHaveLength(0);
  });

  it('rejects registering the root itself as an agent', async () => {
    await expect(
      OwnedAssetService.registerAgent({
        rootPn: ROOT,
        subjectPnIdentifier: ROOT,
        subjectPublicKey: 'pk-root',
        label: 'Cursor',
        scopes: ['ai:files.published'],
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('delegates only known ai: scopes to pn-agent-mcp', async () => {
    const reg = await OwnedAssetService.registerAgent({
      rootPn: ROOT,
      subjectPnIdentifier: 'pn-agent1',
      subjectPublicKey: 'pk-agent1',
      label: 'Cursor',
      scopes: ['ai:files.published', 'cloud:app', 'ai:unknown', 'ai:files.published'],
    });
    expect(reg.delegations.map((d) => d.scope)).toEqual(['ai:files.published']);
    const inserts = queries.filter((q) => q.sql.includes('INSERT INTO pn_asset_delegations'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params).toContain('pn-agent-mcp');
    const asset = queries.find((q) => q.sql.includes('INSERT INTO pn_owned_assets'));
    expect(asset?.params).toContain('pk-agent1');
  });

  it('refuses scopes with no known ai: entry', async () => {
    await expect(
      OwnedAssetService.registerAgent({
        rootPn: ROOT,
        subjectPnIdentifier: 'pn-agent1',
        subjectPublicKey: 'pk-agent1',
        label: 'Cursor',
        scopes: ['cloud:app', 'profile'],
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('refuses a subject owned by another root', async () => {
    responder = (sql) =>
      sql.includes('SELECT id, root_pn_identifier')
        ? { rows: [{ id: 'a1', root_pn_identifier: 'pn-other', kind: 'ai_agent' }] }
        : { rows: [] };
    await expect(
      OwnedAssetService.registerAgent({
        rootPn: ROOT,
        subjectPnIdentifier: 'pn-agent1',
        subjectPublicKey: 'pk-agent1',
        label: 'Cursor',
        scopes: ['ai:files.published'],
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('revoke marks rows revoked and deletes the agent refresh tokens', async () => {
    responder = (sql) =>
      sql.includes('RETURNING id, subject_public_key')
        ? { rows: [{ id: 'asset-1', subject_public_key: 'pk-agent1' }] }
        : { rows: [] };
    expect(await OwnedAssetService.revokeAgent(ROOT, 'asset-1')).toBe(true);
    const del = queries.find((q) => q.sql.includes('DELETE FROM oauth_refresh_tokens'));
    expect(del?.params).toEqual(['pn-agent-mcp', ['pk-agent1']]);
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
    expect(del?.params).toEqual(['pn-agent-mcp', ['pk-1', 'pk-2']]);
  });

  it('resolves no delegation when nothing is active', async () => {
    expect(await OwnedAssetService.resolveAgentDelegation('pn-agent1')).toBeNull();
  });

  it('resolves live scopes and drops unknown ones', async () => {
    responder = () => ({
      rows: [
        { id: 'a1', root_pn_identifier: ROOT, scope: 'ai:files.published' },
        { id: 'a1', root_pn_identifier: ROOT, scope: '*' },
      ],
    });
    expect(await OwnedAssetService.resolveAgentDelegation('pn-agent1')).toEqual({
      assetId: 'a1',
      rootPnIdentifier: ROOT,
      scopes: ['ai:files.published'],
    });
  });
});
