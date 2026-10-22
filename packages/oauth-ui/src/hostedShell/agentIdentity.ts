/**
 * AI agent sub-pN identities. Unlock mints the agent with random factors and keeps them
 * only in this device's Touch ID vault; callers get the agent's public ids, never factors.
 */

import { IdentityCrypto } from '@par-noir/identity-crypto';
import { deriveCanonicalPnIdentifier } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import { isAgentClassClientId } from '@par-noir/standard-data-points';

export const AGENT_VAULT_NICKNAME_PREFIX = 'AI agent: ';
const AGENT_LABEL_MAX = 40;

/** Vault entry the host seals into its device session vault. */
export type AgentVaultEntry = {
  identityId: string;
  publicKey: string;
  pnName: string;
  passcode: string;
  encryptedIdentityJson: string;
  nickname: string;
  /** Vault identityId of the owner who added this agent on this device. */
  ownerIdentityId: string;
};

export type SaveAgentIdentity = (entry: AgentVaultEntry) => Promise<void>;

export type AgentIdentityResult = {
  agentPnIdentifier: string;
  agentPublicKey: string;
};

export const AGENT_VAULT_REQUIRED_MESSAGE =
  'AI agents are saved with Touch ID. Use par Noir Unlock on your Mac to add one.';

export function normalizeAgentLabel(raw: unknown): string {
  const text = typeof raw === 'string' ? raw : '';
  return text
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, AGENT_LABEL_MAX);
}

export function agentVaultNickname(label: string): string {
  return `${AGENT_VAULT_NICKNAME_PREFIX}${normalizeAgentLabel(label)}`;
}

export function isAgentVaultNickname(nickname: string | undefined): boolean {
  return typeof nickname === 'string' && nickname.startsWith(AGENT_VAULT_NICKNAME_PREFIX);
}

/** The local MCP or a hosted AI connector: signs in AI agent sub-pNs only. */
export function isAgentSignInClient(clientId: string): boolean {
  return isAgentClassClientId(clientId);
}

/**
 * Saved identities offered for a sign-in. AI clients (the local MCP and hosted connectors)
 * only see agents; every other client only sees people, so a person never signs an AI tool
 * in as themselves.
 */
export function vaultEntriesForClient<T extends { nickname?: string }>(entries: T[], clientId: string): T[] {
  const wantAgents = isAgentSignInClient(clientId);
  return entries.filter((entry) => isAgentVaultNickname(entry.nickname) === wantAgents);
}

function randomFactor(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let bin = '';
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Create the agent identity and seal it to the vault. Fails closed without a vault. */
export async function createAgentIdentity(args: {
  label: string;
  ownerIdentityId: string;
  saveAgentIdentity?: SaveAgentIdentity;
}): Promise<AgentIdentityResult> {
  if (!args.saveAgentIdentity) throw new Error(AGENT_VAULT_REQUIRED_MESSAGE);
  const label = normalizeAgentLabel(args.label);
  if (!label) throw new Error('Name this AI agent first');
  const ownerIdentityId = args.ownerIdentityId.trim();
  if (!ownerIdentityId) throw new Error('Unlock your pN to add an AI agent');

  const nickname = agentVaultNickname(label);
  const pnName = `agent-${randomFactor(18)}`;
  const passcode = randomFactor(32);
  const created = await IdentityCrypto.createIdentity(pnName, nickname, passcode);
  const session = await IdentityCrypto.authenticateIdentity(created.identity, passcode, pnName);

  await args.saveAgentIdentity({
    identityId: session.id,
    publicKey: session.publicKey,
    pnName,
    passcode,
    encryptedIdentityJson: JSON.stringify(created.identity),
    nickname,
    ownerIdentityId,
  });

  return {
    agentPnIdentifier: deriveCanonicalPnIdentifier(session.publicKey),
    agentPublicKey: session.publicKey,
  };
}
