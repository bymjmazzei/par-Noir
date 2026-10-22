import type { PnMcpMode } from './source';

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
  unlock_not_running: 'par Noir Unlock is not running on this Mac. Open it, then try again.',
  owner_declined: 'The owner did not approve this on their Mac. Ask them before trying again.',
  agent_not_on_this_mac: 'This AI agent was added on a different Mac. Private reads only work on the Mac that added it.',
  private_not_found: 'No private file or Pen document with that id.',
  unsupported_type: 'Only text files can be read: plain text, Markdown, CSV, JSON and similar.',
  file_too_large: 'That file is too large to read here.',
} as const;

export type McpErrorCode = keyof typeof ERROR_MESSAGES;

/** A hosted AI app has no pn-mcp CLI; the owner reconnects par Noir in that app instead. */
const REMOTE_MESSAGES: Partial<Record<McpErrorCode, string>> = {
  not_signed_in: 'Not connected to par Noir. Reconnect par Noir in this app.',
  access_revoked: 'Access revoked or expired. Reconnect par Noir in this app.',
};

export function errorMessage(code: McpErrorCode, mode: PnMcpMode = 'local'): string {
  return (mode === 'remote' && REMOTE_MESSAGES[code]) || ERROR_MESSAGES[code];
}

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
