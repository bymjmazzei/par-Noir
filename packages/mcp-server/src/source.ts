import type { PenAgentDraftSubmission } from '@par-noir/pen-protocol';

/** `local`: the pn-mcp CLI on the owner's machine. `remote`: the API's /mcp endpoint for hosted AI apps. */
export type PnMcpMode = 'local' | 'remote';

/** Local only: par Noir Unlock on this Mac. Remote mode never registers a tool backed by it. */
export interface PnPrivateSource {
  available(): boolean;
  searchPrivate(args: { query: string }): Promise<unknown>;
  readPrivateFile(args: { fileId: string }): Promise<unknown>;
  readPrivatePen(args: { docId: string }): Promise<unknown>;
}

/**
 * Where tool data comes from. Methods return raw records; the tool core projects every one
 * through an allowlist, so a source can never widen what the AI sees. Failures must be
 * McpToolError, so the AI only ever sees fixed messages.
 */
export interface PnMcpSource {
  /** Scopes this agent holds right now; empty when signed out. */
  grantedScopes(): Promise<string[]>;
  /** Re-checked on every call, so revoke and scope loss apply mid-session. */
  requireAnyScope(scopes: readonly string[]): Promise<void>;
  searchFiles(args: { query: string; limit: number }): Promise<unknown[]>;
  readFile(fileId: string): Promise<unknown>;
  readPen(docId: string): Promise<unknown>;
  prove(dataPointId: string): Promise<unknown>;
  ownerMlKemPublicKey(): Promise<string>;
  /** Receives only the sealed submission; the core seals before calling this. */
  proposeDraft(submission: PenAgentDraftSubmission): Promise<unknown>;
  private?: PnPrivateSource;
}
