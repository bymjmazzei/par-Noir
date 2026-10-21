/**
 * Which owner an agent reads for. Only agents added on this Mac qualify: the agent's vault
 * entry names its owner, and the owner must be saved in the same vault.
 */

import { deriveCanonicalPnIdentifier } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import { AGENT_VAULT_NICKNAME_PREFIX, isAgentVaultNickname } from '../hostedShell/agentIdentity';
import { AgentCustodyError } from './errors';

type ListedIdentity = { identityId: string; publicKey: string; nickname?: string };

type VaultIdentity = ListedIdentity & {
  pnName: string;
  passcode: string;
  encryptedIdentityJson?: string;
  ownerIdentityId?: string;
};

function agentPn(publicKey: string): string | null {
  try {
    return publicKey ? deriveCanonicalPnIdentifier(publicKey) : null;
  } catch {
    return null;
  }
}

/**
 * Non-secret pre-check against the vault listing, before any Touch ID prompt.
 * Returns the label to show the owner.
 */
export function findAgentOnThisMac(listing: readonly ListedIdentity[], agentPnIdentifier: string): { label: string } {
  const hit = listing.find(
    (row) => isAgentVaultNickname(row.nickname) && agentPn(row.publicKey) === agentPnIdentifier
  );
  if (!hit) throw new AgentCustodyError('agent_not_on_this_mac');
  const label = (hit.nickname || '').slice(AGENT_VAULT_NICKNAME_PREFIX.length).trim();
  return { label: label || 'AI agent' };
}

/** After Touch ID: the owner's sealed entry for this agent, or refuse. */
export function resolveAgentOwner<T extends VaultIdentity>(entries: readonly T[], agentPnIdentifier: string): T {
  const agent = entries.find(
    (row) => isAgentVaultNickname(row.nickname) && agentPn(row.publicKey) === agentPnIdentifier
  );
  const ownerId = agent?.ownerIdentityId?.trim();
  if (!ownerId) throw new AgentCustodyError('agent_not_on_this_mac');
  const owner = entries.find((row) => row.identityId === ownerId && !isAgentVaultNickname(row.nickname));
  if (!owner || !owner.pnName || !owner.passcode || !owner.encryptedIdentityJson) {
    throw new AgentCustodyError('agent_not_on_this_mac');
  }
  return owner;
}
