import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalDelegationBytes, parseAgentDelegationStatement } from '@par-noir/standard-data-points';
import { base64ToBytes, bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Keygen, mlDsa65Verify } from '@par-noir/pqc-crypto/ml-dsa';

const createIdentity = vi.fn();
const authenticateIdentity = vi.fn();

vi.mock('@par-noir/identity-crypto', () => ({
  IdentityCrypto: {
    createIdentity: (...args: unknown[]) => createIdentity(...args),
    authenticateIdentity: (...args: unknown[]) => authenticateIdentity(...args),
  },
}));

vi.mock('@par-noir/pqc-crypto/oauth-unlock-proof', () => ({
  deriveCanonicalPnIdentifier: (pk: string) => `pn-of-${pk}`,
}));

import {
  createAgentIdentity,
  normalizeAgentLabel,
  vaultEntriesForClient,
  type AgentVaultEntry,
} from './agentIdentity';
import { decodeAgentDelegationDraft, encodeAgentDelegationDraft } from './agentDelegation';
import { buildShellResult } from './shellResult';
import { assertFactorFree, buildShellLaunchUrl, encodeShellReturn, parseShellReturn } from './session';

beforeEach(() => {
  createIdentity.mockReset();
  authenticateIdentity.mockReset();
  createIdentity.mockImplementation(async (key1: string, nickname: string) => ({
    identity: { id: 'did:agent', nickname, encryptedData: `sealed-for-${key1}` },
  }));
  authenticateIdentity.mockResolvedValue({ id: 'did:agent', publicKey: 'agent-pk' });
});

const ownerKeys = mlDsa65Keygen(new Uint8Array(32).fill(7));
const ownerPublicKey = bytesToBase64(ownerKeys.publicKey);
const ownerSecretB64 = bytesToBase64(ownerKeys.secretKey);

const unlocked = {
  did: 'did:owner',
  publicKey: ownerPublicKey,
  decryptedIdentity: { id: 'did:owner', pqcSecrets: { mlDsaSecretKey: ownerSecretB64 } },
  encryptedIdentity: { id: 'did:owner' },
};

const draft = {
  scopes: ['ai:files.published', 'ai:proofs'] as const,
  attestations: [
    { dataPointId: 'over_18' as const, satisfied: true, level: 'attested' as const, expiresAt: null },
  ],
  issuedAt: '2026-10-21T13:00:00.000Z',
  expiresAt: null,
  nonce: 'nonce-abcdefghijklmnop',
};
const encodedDraft = encodeAgentDelegationDraft({ ...draft, scopes: [...draft.scopes] });

describe('AI agent identity', () => {
  it('fails closed without a device vault', async () => {
    await expect(createAgentIdentity({ label: 'Cursor', ownerIdentityId: 'did:owner' })).rejects.toThrow(/Touch ID/);
    expect(createIdentity).not.toHaveBeenCalled();
  });

  it('needs a label', async () => {
    await expect(
      createAgentIdentity({ label: '  ', ownerIdentityId: 'did:owner', saveAgentIdentity: vi.fn() })
    ).rejects.toThrow(/Name/);
  });

  it('needs the owner it belongs to', async () => {
    await expect(
      createAgentIdentity({ label: 'Cursor', ownerIdentityId: ' ', saveAgentIdentity: vi.fn() })
    ).rejects.toThrow(/Unlock your pN/);
    expect(createIdentity).not.toHaveBeenCalled();
  });

  it('seals random factors and the owner id to the vault and returns public ids only', async () => {
    const saved: AgentVaultEntry[] = [];
    const result = await createAgentIdentity({
      label: 'Cursor',
      ownerIdentityId: 'did:owner',
      saveAgentIdentity: async (entry) => {
        saved.push(entry);
      },
    });
    expect(result).toEqual({ agentPnIdentifier: 'pn-of-agent-pk', agentPublicKey: 'agent-pk' });
    expect(() => assertFactorFree(result)).not.toThrow();
    expect(saved).toHaveLength(1);
    expect(saved[0].nickname).toBe('AI agent: Cursor');
    expect(saved[0].ownerIdentityId).toBe('did:owner');
    expect(saved[0].key1).toMatch(/^agent-/);
    expect(saved[0].key2.length).toBeGreaterThanOrEqual(40);
    expect(saved[0].encryptedIdentityJson).toContain('sealed-for-');
    expect(JSON.stringify(result)).not.toContain(saved[0].key2);
    expect(JSON.stringify(result)).not.toContain(saved[0].key1);
  });

  it('uses fresh factors for each agent', async () => {
    const saved: AgentVaultEntry[] = [];
    const save = async (entry: AgentVaultEntry) => {
      saved.push(entry);
    };
    await createAgentIdentity({ label: 'A', ownerIdentityId: 'did:owner', saveAgentIdentity: save });
    await createAgentIdentity({ label: 'B', ownerIdentityId: 'did:owner', saveAgentIdentity: save });
    expect(saved[0].key2).not.toBe(saved[1].key2);
    expect(saved[0].key1).not.toBe(saved[1].key1);
  });

  it('normalizes labels', () => {
    expect(normalizeAgentLabel('  Claude\n Desktop  ')).toBe('Claude Desktop');
    expect(normalizeAgentLabel('x'.repeat(80))).toHaveLength(40);
    expect(normalizeAgentLabel(undefined)).toBe('');
  });

  it('offers only agents to the MCP client and only people to everyone else', () => {
    const entries = [{ nickname: 'Me' }, { nickname: 'AI agent: Cursor' }, {}];
    expect(vaultEntriesForClient(entries, 'pn-agent-mcp')).toEqual([{ nickname: 'AI agent: Cursor' }]);
    expect(vaultEntriesForClient(entries, 'browser-app')).toEqual([{ nickname: 'Me' }, {}]);
  });

  it('offers only agents to hosted AI connectors', () => {
    const entries = [{ nickname: 'Me' }, { nickname: 'AI agent: Claude' }];
    expect(vaultEntriesForClient(entries, 'pn-connector-0123456789abcdef')).toEqual([{ nickname: 'AI agent: Claude' }]);
    expect(vaultEntriesForClient(entries, 'pn-connector-')).toEqual([{ nickname: 'Me' }]);
  });
});

describe('agent delegation draft', () => {
  it('round-trips through the launch URL encoding', () => {
    expect(decodeAgentDelegationDraft(encodedDraft)).toEqual({
      ...draft,
      scopes: ['ai:files.published', 'ai:proofs'],
    });
  });

  it('rejects tampered or unknown drafts', () => {
    expect(decodeAgentDelegationDraft('not-base64-json')).toBeNull();
    expect(decodeAgentDelegationDraft(undefined)).toBeNull();
    expect(() => encodeAgentDelegationDraft({ ...draft, scopes: ['cloud:read' as never] })).toThrow();
  });
});

describe('agent shell op', () => {
  it('requires the owner to unlock first', async () => {
    await expect(
      buildShellResult({
        op: 'agent',
        key1: '',
        key2: '',
        agentLabel: 'Cursor',
        agentDelegation: encodedDraft,
        saveAgentIdentity: vi.fn(),
      })
    ).rejects.toThrow(/Unlock your pN/);
  });

  it('refuses to create an agent without a valid delegation draft', async () => {
    const save = vi.fn();
    await expect(
      buildShellResult({
        op: 'agent',
        key1: 'owner-key1',
        key2: 'owner-key2',
        unlocked,
        agentLabel: 'Cursor',
        saveAgentIdentity: save,
      })
    ).rejects.toThrow(/dashboard/);
    expect(save).not.toHaveBeenCalled();
  });

  it('signs the delegation with the owner root key in the same unlock', async () => {
    const save = vi.fn(async () => undefined);
    const result = await buildShellResult({
      op: 'agent',
      key1: 'owner-key1',
      key2: 'owner-key2',
      unlocked,
      agentLabel: 'Cursor',
      agentDelegation: encodedDraft,
      saveAgentIdentity: save,
    });
    expect(result?.agentPnIdentifier).toBe('pn-of-agent-pk');
    const statement = parseAgentDelegationStatement(JSON.parse(result!.statement));
    expect(statement).toMatchObject({
      rootPublicKey: ownerPublicKey,
      agentPnIdentifier: 'pn-of-agent-pk',
      agentPublicKey: 'agent-pk',
      scopes: ['ai:files.published', 'ai:proofs'],
      attestations: draft.attestations,
      nonce: draft.nonce,
    });
    expect(
      mlDsa65Verify(base64ToBytes(result!.signature), canonicalDelegationBytes(statement!), ownerKeys.publicKey)
    ).toBe(true);
    const tampered = { ...statement!, scopes: ['ai:files.published', 'ai:proofs', 'ai:pen.drafts'] as never };
    expect(
      mlDsa65Verify(base64ToBytes(result!.signature), canonicalDelegationBytes(tampered), ownerKeys.publicKey)
    ).toBe(false);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ ownerIdentityId: 'did:owner' }));
  });

  it('returns a factor-free fragment with no owner secrets', async () => {
    const result = await buildShellResult({
      op: 'agent',
      key1: 'owner-key1',
      key2: 'owner-key2',
      unlocked,
      agentLabel: 'Cursor',
      agentDelegation: encodedDraft,
      saveAgentIdentity: vi.fn(async () => undefined),
    });
    const fragment = encodeShellReturn({
      v: 1,
      op: 'agent',
      did: 'did:owner',
      publicKey: ownerPublicKey,
      accessToken: '',
      result,
    });
    const parsed = parseShellReturn(fragment);
    expect(parsed?.result?.agentPnIdentifier).toBe('pn-of-agent-pk');
    expect(Object.keys(parsed?.result || {}).sort()).toEqual(
      ['agentPnIdentifier', 'agentPublicKey', 'signature', 'statement'].sort()
    );
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain('owner-key');
    expect(serialized).not.toContain(ownerSecretB64.slice(0, 64));
    expect(serialized).not.toContain('mlDsaSecretKey');
  });

  it('carries the agent label and delegation draft on the launch URL', () => {
    const url = buildShellLaunchUrl({
      returnTo: 'https://pn.parnoir.com/',
      op: 'agent',
      agentLabel: 'Cursor',
      agentDelegation: encodedDraft,
    });
    const params = new URL(url.replace('com.parnoir.unlock://', 'https://x/')).searchParams;
    expect(params.get('agent_label')).toBe('Cursor');
    expect(params.get('agent_delegation')).toBe(encodedDraft);
  });
});
