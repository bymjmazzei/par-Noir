/** Every failure the AI tool sees is one of these. API bodies are never echoed. */
export const ERROR_MESSAGES = {
  not_signed_in: 'Not signed in. Run pn-mcp login.',
  access_revoked: 'Access revoked or expired. Run pn-mcp login.',
  insufficient_scope: 'This AI agent does not have access to that. Add a new agent in Dashboard, Sub-pNs.',
  not_found: 'Nothing published with that id.',
  not_attested: 'The owner has not shared that proof with this AI agent.',
  proof_expired: 'That proof has expired. The owner can renew it in Dashboard, Privacy.',
  invalid_request: 'That request was not valid.',
  invalid_draft: 'That draft does not match a Pen template. Check templateId, title and the required sections.',
  draft_too_large: 'That draft is too large. Keep it under 256 KB.',
  draft_rate_limited: 'This AI agent has proposed the most drafts allowed today. Try again tomorrow.',
  owner_inbox_unavailable: 'The owner cannot receive drafts yet. Ask them to open Pen once.',
  unavailable: 'par Noir is unavailable right now. Try again shortly.',
  login_failed: 'Sign-in did not finish. Run pn-mcp login again.',
  login_timeout: 'Sign-in timed out waiting for par Noir Unlock. Run pn-mcp login again.',
} as const;

export type McpErrorCode = keyof typeof ERROR_MESSAGES;

export class McpToolError extends Error {
  readonly code: McpErrorCode;

  constructor(code: McpErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'McpToolError';
    this.code = code;
  }
}

export function toErrorCode(err: unknown): McpErrorCode {
  return err instanceof McpToolError ? err.code : 'unavailable';
}
