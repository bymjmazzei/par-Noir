/**
 * Owner-signed AI agent delegation. The dashboard proposes a draft (scopes plus yes/no
 * attestations it computed on-device); Unlock fills in the keys and agent ids and signs
 * the canonical bytes with the owner's root ML-DSA key in the same unlock.
 */

import {
  AGENT_DELEGATION_VERSION,
  canonicalDelegationBytes,
  parseAgentDelegationDraft,
  type AgentDelegationDraft,
  type AgentDelegationStatement,
} from '@par-noir/standard-data-points';
import { base64ToBytes, bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Sign } from '@par-noir/pqc-crypto/ml-dsa';

function toB64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromB64Url(b64: string): string {
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return new TextDecoder().decode(base64ToBytes(b64.replace(/-/g, '+').replace(/_/g, '/') + pad));
}

/** Launch-URL form of the draft. Carries scopes and yes/no answers only. */
export function encodeAgentDelegationDraft(draft: AgentDelegationDraft): string {
  const parsed = parseAgentDelegationDraft(draft);
  if (!parsed) throw new Error('Invalid AI agent delegation');
  return toB64Url(JSON.stringify(parsed));
}

export function decodeAgentDelegationDraft(encoded: string | undefined): AgentDelegationDraft | null {
  if (!encoded) return null;
  try {
    return parseAgentDelegationDraft(JSON.parse(fromB64Url(encoded)));
  } catch {
    return null;
  }
}

export function signAgentDelegation(args: {
  draft: AgentDelegationDraft;
  rootPublicKey: string;
  agentPnIdentifier: string;
  agentPublicKey: string;
  rootMlDsaSecretKeyB64: string;
}): { statement: AgentDelegationStatement; signature: string } {
  const statement: AgentDelegationStatement = {
    v: AGENT_DELEGATION_VERSION,
    rootPublicKey: args.rootPublicKey,
    agentPnIdentifier: args.agentPnIdentifier,
    agentPublicKey: args.agentPublicKey,
    ...args.draft,
  };
  const signature = bytesToBase64(
    mlDsa65Sign(canonicalDelegationBytes(statement), base64ToBytes(args.rootMlDsaSecretKeyB64))
  );
  return { statement, signature };
}
