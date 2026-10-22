/**
 * AI agent access: scopes an AI agent sub-pN may hold, the disclosure shown when
 * the owner approves one, the OAuth client the local MCP server signs in as, and
 * the owner-signed delegation statement that binds an agent to its scopes and proofs.
 *
 * Not a first-party contract. Agents never reach first-party product routes.
 */

import type { DataPointMinLevel } from './verificationLevel';

export const AGENT_MCP_CLIENT_ID = 'pn-agent-mcp';

/** Validated only: Unlock hands the code to the broker and never navigates here. */
export const AGENT_MCP_REDIRECT_URI = 'https://unlock.parnoir.com/oauth/agent-complete';

export const AI_SCOPE_PREFIX = 'ai:';

export const AI_SCOPES = {
  filesPublished: 'ai:files.published',
  penPublished: 'ai:pen.published',
  proofs: 'ai:proofs',
  penDrafts: 'ai:pen.drafts',
  filesPrivate: 'ai:files.private',
  penPrivate: 'ai:pen.private',
} as const;

export type AiScope = (typeof AI_SCOPES)[keyof typeof AI_SCOPES];

export const AI_SCOPE_LABELS: Readonly<Record<AiScope, string>> = {
  'ai:files.published': 'Search and read files you have published',
  'ai:pen.published': 'Read Pen documents you have published',
  'ai:proofs': 'Ask yes or no about proofs you choose, never the data behind them',
  'ai:pen.drafts': 'Propose Pen drafts that wait for you to accept them',
  'ai:files.private': 'Read your private files on this Mac only, with Touch ID',
  'ai:pen.private': 'Read your private Pen documents on this Mac only, with Touch ID',
};

/** Served by Unlock on the owner's Mac; never registered on a remote endpoint. */
const LOCAL_ONLY_AI_SCOPES = new Set<string>([AI_SCOPES.filesPrivate, AI_SCOPES.penPrivate]);

export const AI_DATA_DISCLOSURE =
  'Anything par Noir returns to this AI tool leaves par Noir custody and is sent to the AI provider ' +
  '(for example Anthropic or OpenAI) under their terms. par Noir cannot recall it. ' +
  'Proofs answer only yes or no, with a level and an expiry; the data behind them is never sent. ' +
  'Drafts the AI proposes stay sealed to you and are saved only if you accept them in Pen. ' +
  'Revoke anytime in Dashboard, Privacy.';

const KNOWN_AI_SCOPES = new Set<string>(Object.values(AI_SCOPES));

export function isAiScope(scope: string): boolean {
  return scope.startsWith(AI_SCOPE_PREFIX);
}

/** Only scopes this release defines; unknown `ai:` ids are rejected, not passed through. */
export function isKnownAiScope(scope: string): scope is AiScope {
  return KNOWN_AI_SCOPES.has(scope);
}

export function isLocalOnlyAiScope(scope: string): boolean {
  return LOCAL_ONLY_AI_SCOPES.has(scope);
}

/** What a remote connector may hold: every `ai:` scope except the local-only ones. */
export const REMOTE_AI_SCOPES: readonly AiScope[] = Object.values(AI_SCOPES).filter((s) => !isLocalOnlyAiScope(s));

/**
 * Hosted AI apps (claude.ai, ChatGPT) register through RFC 7591 dynamic client registration.
 * Only that route issues ids with this prefix, so Unlock can tell a connector apart offline.
 */
export const AGENT_CONNECTOR_CLIENT_ID_PREFIX = 'pn-connector-';

export function isAgentConnectorClientId(clientId: string): boolean {
  return clientId.startsWith(AGENT_CONNECTOR_CLIENT_ID_PREFIX) && clientId.length > AGENT_CONNECTOR_CLIENT_ID_PREFIX.length;
}

/** Clients that sign in AI agent sub-pNs only: the local MCP server and registered connectors. */
export function isAgentClassClientId(clientId: string): boolean {
  return clientId === AGENT_MCP_CLIENT_ID || isAgentConnectorClientId(clientId);
}

export function filterKnownAiScopes(scopes: readonly string[]): AiScope[] {
  return [...new Set(scopes.filter(isKnownAiScope))];
}

export const AGENT_MCP_CLIENT = {
  clientId: AGENT_MCP_CLIENT_ID,
  name: 'par Noir MCP (AI agents)',
  description: 'Local MCP server that lets an AI agent sub-pN read what its owner delegated',
  redirectUris: [AGENT_MCP_REDIRECT_URI] as readonly string[],
  scopes: ['openid', ...Object.values(AI_SCOPES)] as readonly string[],
} as const;

/** Catalog proofs an agent may ask yes/no about. Names, numbers and images are never attestable. */
export const ATTESTABLE_DATA_POINT_IDS = [
  'over_18',
  'over_21',
  'name_attestation',
  'email_verification',
  'phone_verification',
  'location_verification',
] as const;

export type AttestableDataPointId = (typeof ATTESTABLE_DATA_POINT_IDS)[number];

const ATTESTABLE = new Set<string>(ATTESTABLE_DATA_POINT_IDS);

export function isAttestableDataPointId(id: string): id is AttestableDataPointId {
  return ATTESTABLE.has(id);
}

/** Yes/no answer the owner's device computed for one proof. No value, no proof bytes. */
export interface AgentAttestation {
  dataPointId: AttestableDataPointId;
  satisfied: boolean;
  level: DataPointMinLevel;
  expiresAt: string | null;
}

export const AGENT_DELEGATION_VERSION = 1 as const;
const AGENT_DELEGATION_DOMAIN = 'PN-AGENT-DELEGATION-V1';

/** Signed by the owner's root ML-DSA key in Unlock when the agent is created. */
export interface AgentDelegationStatement {
  v: typeof AGENT_DELEGATION_VERSION;
  rootPublicKey: string;
  agentPnIdentifier: string;
  agentPublicKey: string;
  scopes: AiScope[];
  attestations: AgentAttestation[];
  issuedAt: string;
  expiresAt: string | null;
  nonce: string;
}

/** What the dashboard proposes; Unlock fills in the keys and agent ids before signing. */
export type AgentDelegationDraft = Pick<
  AgentDelegationStatement,
  'scopes' | 'attestations' | 'issuedAt' | 'expiresAt' | 'nonce'
>;

const NONCE_RE = /^[A-Za-z0-9_-]{16,128}$/;
const KEY_MAX = 4096;

function isoOrNull(v: unknown): string | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) return undefined;
  return new Date(v).toISOString();
}

function parseAttestation(raw: unknown): AgentAttestation | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.dataPointId !== 'string' || !isAttestableDataPointId(row.dataPointId)) return null;
  if (typeof row.satisfied !== 'boolean') return null;
  if (row.level !== 'attested' && row.level !== 'verified') return null;
  const expiresAt = isoOrNull(row.expiresAt);
  if (expiresAt === undefined) return null;
  return { dataPointId: row.dataPointId, satisfied: row.satisfied, level: row.level, expiresAt };
}

function sortedScopes(scopes: readonly AiScope[]): AiScope[] {
  return [...new Set(scopes)].sort();
}

function sortedAttestations(list: readonly AgentAttestation[]): AgentAttestation[] {
  return [...list].sort((a, b) => (a.dataPointId < b.dataPointId ? -1 : a.dataPointId > b.dataPointId ? 1 : 0));
}

/** Strict parse; null on any unknown scope, unattestable proof, duplicate or malformed field. */
export function parseAgentDelegationDraft(raw: unknown): AgentDelegationDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (!Array.isArray(row.scopes) || !Array.isArray(row.attestations)) return null;
  if (!row.scopes.every((s) => typeof s === 'string' && isKnownAiScope(s))) return null;
  const scopes = sortedScopes(row.scopes as AiScope[]);
  if (scopes.length === 0) return null;
  const attestations: AgentAttestation[] = [];
  for (const item of row.attestations) {
    const parsed = parseAttestation(item);
    if (!parsed || attestations.some((a) => a.dataPointId === parsed.dataPointId)) return null;
    attestations.push(parsed);
  }
  if (attestations.length > 0 && !scopes.includes(AI_SCOPES.proofs)) return null;
  const issuedAt = isoOrNull(row.issuedAt);
  if (!issuedAt) return null;
  const expiresAt = isoOrNull(row.expiresAt);
  if (expiresAt === undefined) return null;
  if (typeof row.nonce !== 'string' || !NONCE_RE.test(row.nonce)) return null;
  return { scopes, attestations: sortedAttestations(attestations), issuedAt, expiresAt, nonce: row.nonce };
}

export function parseAgentDelegationStatement(raw: unknown): AgentDelegationStatement | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.v !== AGENT_DELEGATION_VERSION) return null;
  for (const key of ['rootPublicKey', 'agentPnIdentifier', 'agentPublicKey'] as const) {
    const v = row[key];
    if (typeof v !== 'string' || !v || v.length > KEY_MAX) return null;
  }
  const draft = parseAgentDelegationDraft(row);
  if (!draft) return null;
  return {
    v: AGENT_DELEGATION_VERSION,
    rootPublicKey: row.rootPublicKey as string,
    agentPnIdentifier: row.agentPnIdentifier as string,
    agentPublicKey: row.agentPublicKey as string,
    ...draft,
  };
}

/**
 * Bytes the owner signs. Fixed key order, sorted scopes and attestations, so the same
 * delegation always yields the same bytes on the dashboard, in Unlock and on the API.
 */
export function canonicalDelegationBytes(statement: AgentDelegationStatement): Uint8Array {
  const ordered = {
    v: statement.v,
    rootPublicKey: statement.rootPublicKey,
    agentPnIdentifier: statement.agentPnIdentifier,
    agentPublicKey: statement.agentPublicKey,
    scopes: sortedScopes(statement.scopes),
    attestations: sortedAttestations(statement.attestations).map((a) => ({
      dataPointId: a.dataPointId,
      satisfied: a.satisfied,
      level: a.level,
      expiresAt: a.expiresAt,
    })),
    issuedAt: statement.issuedAt,
    expiresAt: statement.expiresAt,
    nonce: statement.nonce,
  };
  return new TextEncoder().encode(`${AGENT_DELEGATION_DOMAIN}\n${JSON.stringify(ordered)}`);
}
