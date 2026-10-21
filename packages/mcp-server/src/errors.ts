/** Every failure the AI tool sees is one of these. API bodies are never echoed. */
export const ERROR_MESSAGES = {
  not_signed_in: 'Not signed in. Run pn-mcp login.',
  access_revoked: 'Access revoked or expired. Run pn-mcp login.',
  insufficient_scope: 'This AI agent does not have access to that. Add a new agent in Dashboard, Sub-pNs.',
  not_found: 'Nothing published with that id.',
  invalid_request: 'That request was not valid.',
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
