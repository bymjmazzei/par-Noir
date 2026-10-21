import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { buildShellResult } from './shellResult';
import { assertFactorFree, buildShellLaunchUrl, encodeShellReturn, parseShellReturn } from './session';

beforeEach(() => {
  createIdentity.mockReset();
  authenticateIdentity.mockReset();
  createIdentity.mockImplementation(async (pnName: string, nickname: string) => ({
    identity: { id: 'did:agent', nickname, encryptedData: `sealed-for-${pnName}` },
  }));
  authenticateIdentity.mockResolvedValue({ id: 'did:agent', publicKey: 'agent-pk' });
});

const unlocked = {
  publicKey: 'owner-pk',
  decryptedIdentity: { id: 'did:owner' },
  encryptedIdentity: { id: 'did:owner' },
};

describe('AI agent identity', () => {
  it('fails closed without a device vault', async () => {
    await expect(createAgentIdentity({ label: 'Cursor' })).rejects.toThrow(/Touch ID/);
    expect(createIdentity).not.toHaveBeenCalled();
  });

  it('needs a label', async () => {
    await expect(createAgentIdentity({ label: '  ', saveAgentIdentity: vi.fn() })).rejects.toThrow(/Name/);
  });

  it('seals random factors to the vault and returns public ids only', async () => {
    const saved: AgentVaultEntry[] = [];
    const result = await createAgentIdentity({
      label: 'Cursor',
      saveAgentIdentity: async (entry) => {
        saved.push(entry);
      },
    });
    expect(result).toEqual({ agentPnIdentifier: 'pn-of-agent-pk', agentPublicKey: 'agent-pk' });
    expect(() => assertFactorFree(result)).not.toThrow();
    expect(saved).toHaveLength(1);
    expect(saved[0].nickname).toBe('AI agent: Cursor');
    expect(saved[0].pnName).toMatch(/^agent-/);
    expect(saved[0].passcode.length).toBeGreaterThanOrEqual(40);
    expect(saved[0].encryptedIdentityJson).toContain('sealed-for-');
    expect(JSON.stringify(result)).not.toContain(saved[0].passcode);
    expect(JSON.stringify(result)).not.toContain(saved[0].pnName);
  });

  it('uses fresh factors for each agent', async () => {
    const saved: AgentVaultEntry[] = [];
    const save = async (entry: AgentVaultEntry) => {
      saved.push(entry);
    };
    await createAgentIdentity({ label: 'A', saveAgentIdentity: save });
    await createAgentIdentity({ label: 'B', saveAgentIdentity: save });
    expect(saved[0].passcode).not.toBe(saved[1].passcode);
    expect(saved[0].pnName).not.toBe(saved[1].pnName);
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
});

describe('agent shell op', () => {
  it('requires the owner to unlock first', async () => {
    await expect(
      buildShellResult({ op: 'agent', pnName: '', passcode: '', agentLabel: 'Cursor', saveAgentIdentity: vi.fn() })
    ).rejects.toThrow(/Unlock your pN/);
  });

  it('returns a factor-free fragment with the agent ids', async () => {
    const result = await buildShellResult({
      op: 'agent',
      pnName: 'owner-key1',
      passcode: 'owner-key2',
      unlocked,
      agentLabel: 'Cursor',
      saveAgentIdentity: vi.fn(async () => undefined),
    });
    const fragment = encodeShellReturn({
      v: 1,
      op: 'agent',
      did: 'did:owner',
      publicKey: 'owner-pk',
      accessToken: '',
      result,
    });
    const parsed = parseShellReturn(fragment);
    expect(parsed?.result).toEqual({ agentPnIdentifier: 'pn-of-agent-pk', agentPublicKey: 'agent-pk' });
    expect(fragment).not.toContain('owner-key');
  });

  it('carries the agent label on the launch URL', () => {
    const url = buildShellLaunchUrl({ returnTo: 'https://pn.parnoir.com/', op: 'agent', agentLabel: 'Cursor' });
    expect(new URL(url.replace('com.parnoir.unlock://', 'https://x/')).searchParams.get('agent_label')).toBe(
      'Cursor'
    );
  });
});
