/**
 * AI agent access: scopes an AI agent sub-pN may hold, the disclosure shown when
 * the owner approves one, and the OAuth client the local MCP server signs in as.
 *
 * Not a first-party contract. Agents never reach first-party product routes.
 */

export const AGENT_MCP_CLIENT_ID = 'pn-agent-mcp';

export const AI_SCOPE_PREFIX = 'ai:';

export const AI_SCOPES = {
  filesPublished: 'ai:files.published',
  penPublished: 'ai:pen.published',
} as const;

export type AiScope = (typeof AI_SCOPES)[keyof typeof AI_SCOPES];

export const AI_SCOPE_LABELS: Readonly<Record<AiScope, string>> = {
  'ai:files.published': 'Search and read files you have published',
  'ai:pen.published': 'Read Pen documents you have published',
};

export const AI_DATA_DISCLOSURE =
  'Anything par Noir returns to this AI tool leaves par Noir custody and is sent to the AI provider ' +
  '(for example Anthropic or OpenAI) under their terms. par Noir cannot recall it. ' +
  'Revoke anytime in Dashboard, Privacy.';

const KNOWN_AI_SCOPES = new Set<string>(Object.values(AI_SCOPES));

export function isAiScope(scope: string): boolean {
  return scope.startsWith(AI_SCOPE_PREFIX);
}

/** Only scopes this release defines; unknown `ai:` ids are rejected, not passed through. */
export function isKnownAiScope(scope: string): scope is AiScope {
  return KNOWN_AI_SCOPES.has(scope);
}

export function filterKnownAiScopes(scopes: readonly string[]): AiScope[] {
  return [...new Set(scopes.filter(isKnownAiScope))];
}

export const AGENT_MCP_CLIENT = {
  clientId: AGENT_MCP_CLIENT_ID,
  name: 'par Noir MCP (AI agents)',
  description: 'Local MCP server that lets an AI agent sub-pN read what its owner delegated',
  scopes: ['openid', ...Object.values(AI_SCOPES)] as readonly string[],
} as const;
