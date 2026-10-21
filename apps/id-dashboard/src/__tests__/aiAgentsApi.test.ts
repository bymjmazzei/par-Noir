/**
 * @jest-environment jsdom
 */
const ownerFetch = jest.fn();
const upsertDeviceOwnedAsset = jest.fn(async (..._args: unknown[]) => undefined);
const upsertDeviceAssetDelegation = jest.fn(async (..._args: unknown[]) => undefined);
const listDeviceOwnedAssets = jest.fn(async (..._args: unknown[]) => [] as unknown[]);
const listDeviceAssetDelegations = jest.fn(async (..._args: unknown[]) => [] as unknown[]);

jest.mock('@par-noir/device-cloud-credentials', () => ({
  listDeviceOwnedAssets: (...a: unknown[]) => listDeviceOwnedAssets(...a),
  ensureDeviceOwnedAssetsSheet: async () => 'sheet-owned',
  setSessionDriveIndex: () => undefined,
  upsertDeviceOwnedAsset: (...a: unknown[]) => upsertDeviceOwnedAsset(...a),
  listDeviceAssetDelegations: (...a: unknown[]) => listDeviceAssetDelegations(...a),
  upsertDeviceAssetDelegation: (...a: unknown[]) => upsertDeviceAssetDelegation(...a),
}));

jest.mock('../services/sessionDrive', () => ({
  sessionDriveFor: async () => ({
    accessToken: 'google-token',
    index: { metadataFolderId: 'meta', sheetIds: { 'owned-assets': 'sheet-owned' } },
  }),
}));

jest.mock('../services/ownerApiService', () => ({
  ownerFetch: (...args: unknown[]) => ownerFetch(...args),
}));

import {
  agentFromShellSession,
  registerAiAgent,
  revokeAiAgent,
  revokeAllAiAgents,
} from '../services/ownedAssetsApi';

const statementFor = (scopes: string[], nonce = 'nonce-abcdefghijklmnop') => ({
  v: 1 as const,
  rootPublicKey: 'root-pk',
  agentPnIdentifier: 'pn-agent',
  agentPublicKey: 'pk-agent',
  scopes: scopes as never,
  attestations: [] as never[],
  issuedAt: '2026-10-21T13:00:00.000Z',
  expiresAt: null,
  nonce,
});

const signedAgent = (scopes: string[]) => ({
  agentPnIdentifier: 'pn-agent',
  agentPublicKey: 'pk-agent',
  statement: statementFor(scopes),
  signature: 'sig-b64',
});

const respond = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const order: string[] = [];
let uuidSeq = 0;

beforeAll(() => {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: () => `asset-${++uuidSeq}`,
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  order.length = 0;
  upsertDeviceOwnedAsset.mockImplementation(async (..._args: unknown[]) => {
    order.push('sheet-asset');
    return undefined;
  });
  upsertDeviceAssetDelegation.mockImplementation(async (..._args: unknown[]) => {
    order.push('sheet-delegation');
    return undefined;
  });
});

describe('registerAiAgent', () => {
  it('writes the sheet asset, then the API, then delegation rows with the API ids', async () => {
    ownerFetch.mockImplementation(async (_tok, method, path) => {
      order.push(`${method} ${path}`);
      return respond(201, {
        agent: { delegations: [{ id: 'del-1', scope: 'ai:files.published' }, { id: 'del-2', scope: 'ai:pen.published' }] },
      });
    });

    const asset = await registerAiAgent('tok', 'pn-root', {
      label: 'Cursor',
      ...signedAgent(['ai:files.published', 'ai:pen.published']),
    });

    expect(order).toEqual(['sheet-asset', 'POST /api/owned-assets/agents', 'sheet-delegation', 'sheet-delegation']);
    expect(asset.kind).toBe('ai_agent');
    expect(asset.metadata).toEqual({ label: 'Cursor', scopes: ['ai:files.published', 'ai:pen.published'] });

    const apiBody = ownerFetch.mock.calls[0][3] as Record<string, unknown>;
    expect(apiBody).toMatchObject({
      assetId: asset.id,
      subjectPnIdentifier: 'pn-agent',
      subjectPublicKey: 'pk-agent',
      scopes: ['ai:files.published', 'ai:pen.published'],
      expiresAt: null,
      statement: statementFor(['ai:files.published', 'ai:pen.published']),
      signature: 'sig-b64',
    });

    const rows = upsertDeviceAssetDelegation.mock.calls.map((c) => c[2] as Record<string, unknown>);
    expect(rows.map((r) => r.id)).toEqual(['del-1', 'del-2']);
    expect(rows.every((r) => r.ownedAssetId === asset.id && r.delegateeClientId === 'pn-agent-mcp')).toBe(true);
  });

  it('marks the sheet row revoked when the API refuses', async () => {
    let stored: Record<string, unknown> | null = null;
    upsertDeviceOwnedAsset.mockImplementation(async (...args: unknown[]) => {
      stored = args[2] as Record<string, unknown>;
      return undefined;
    });
    listDeviceOwnedAssets.mockImplementation(async () => (stored ? [stored] : []));
    ownerFetch.mockResolvedValue(respond(409, { error: 'conflict' }));

    await expect(
      registerAiAgent('tok', 'pn-root', { label: 'Cursor', ...signedAgent(['ai:files.published']) })
    ).rejects.toThrow();
    expect(stored).toMatchObject({ status: 'revoked' });
    expect(upsertDeviceAssetDelegation).not.toHaveBeenCalled();
  });
});

describe('revokeAiAgent', () => {
  it('calls the API before touching the sheet', async () => {
    listDeviceOwnedAssets.mockResolvedValue([{ id: 'a1', kind: 'ai_agent', status: 'active' }]);
    listDeviceAssetDelegations.mockResolvedValue([{ id: 'del-1', ownedAssetId: 'a1', status: 'active' }]);
    ownerFetch.mockImplementation(async (_tok, method, path) => {
      order.push(`${method} ${path}`);
      return respond(200, { ok: true });
    });

    const result = await revokeAiAgent('tok', 'pn-root', 'a1');

    expect(order).toEqual(['POST /api/owned-assets/agents/a1/revoke', 'sheet-asset', 'sheet-delegation']);
    expect(result).toEqual({ revoked: 1, sheetSynced: true });
  });

  it('tolerates a 404 from the API and still revokes the sheet row', async () => {
    listDeviceOwnedAssets.mockResolvedValue([{ id: 'a1', kind: 'ai_agent', status: 'active' }]);
    ownerFetch.mockResolvedValue(respond(404, { error: 'not_found' }));

    await expect(revokeAiAgent('tok', 'pn-root', 'a1')).resolves.toEqual({ revoked: 0, sheetSynced: true });
    expect(upsertDeviceOwnedAsset).toHaveBeenCalledWith(
      'google-token',
      'sheet-owned',
      expect.objectContaining({ id: 'a1', status: 'revoked' })
    );
  });

  it('surfaces other API failures without touching the sheet', async () => {
    ownerFetch.mockResolvedValue(respond(503, { error: 'unavailable' }));
    await expect(revokeAiAgent('tok', 'pn-root', 'a1')).rejects.toThrow();
    expect(upsertDeviceOwnedAsset).not.toHaveBeenCalled();
  });
});

describe('revokeAllAiAgents', () => {
  it('reports sheetSynced false when Drive fails after the API revoked access', async () => {
    ownerFetch.mockResolvedValue(respond(200, { ok: true, revoked: 3 }));
    listDeviceOwnedAssets.mockRejectedValue(new Error('drive down'));

    await expect(revokeAllAiAgents('tok', 'pn-root')).resolves.toEqual({ revoked: 3, sheetSynced: false });
  });
});

describe('agentFromShellSession', () => {
  const statement = statementFor(['ai:files.published']);
  const draft = {
    scopes: statement.scopes,
    attestations: [],
    issuedAt: statement.issuedAt,
    expiresAt: null,
    nonce: statement.nonce,
  };
  const ok = {
    op: 'agent',
    did: 'root-id',
    result: {
      agentPnIdentifier: 'pn-agent',
      agentPublicKey: 'pk-agent',
      statement: JSON.stringify(statement),
      signature: 'sig-b64',
    },
  };

  it('returns the agent public ids and the signed statement', () => {
    expect(agentFromShellSession(ok, 'root-id', draft)).toEqual({
      agentPnIdentifier: 'pn-agent',
      agentPublicKey: 'pk-agent',
      statement,
      signature: 'sig-b64',
    });
  });

  it('rejects a different op, a different owner, or a missing result', () => {
    expect(() => agentFromShellSession({ ...ok, op: 'sub_pn' }, 'root-id', draft)).toThrow();
    expect(() => agentFromShellSession(ok, 'other-root', draft)).toThrow();
    expect(() => agentFromShellSession(ok, undefined, draft)).toThrow();
    expect(() => agentFromShellSession({ ...ok, result: {} as never }, 'root-id', draft)).toThrow();
  });

  it('rejects an unsigned result or one that answers a different draft', () => {
    const unsigned = { ...ok.result, signature: '' };
    expect(() => agentFromShellSession({ ...ok, result: unsigned as never }, 'root-id', draft)).toThrow(/sign/);
    expect(() => agentFromShellSession(ok, 'root-id', { ...draft, nonce: 'another-nonce-abcdefg' })).toThrow(
      /different/
    );
    expect(() => agentFromShellSession(ok, 'root-id', null)).toThrow(/different/);
  });
});
