/**
 * Local custody bridge between the par Noir MCP server and par Noir Unlock on the owner's Mac.
 * One JSON object per line over a 0600 Unix socket. The agent's access token rides on every
 * request; Unlock re-checks the token, the delegation and its own vault before reading anything,
 * and answers with the allowlisted shapes below only.
 */

import { AI_SCOPES, type AiScope } from './agentClient';

export const AGENT_CUSTODY_PROTOCOL_VERSION = 1 as const;

/** Electron userData folder name for par Noir Unlock on macOS. */
export const AGENT_CUSTODY_APP_DIR = 'par Noir Unlock';
export const AGENT_CUSTODY_SOCKET_FILE = 'agent.sock';

/** Longest request or response line either side accepts, in bytes. */
export const AGENT_CUSTODY_MAX_LINE_BYTES = 256 * 1024;

/** Owner approval lasts this long per agent, then everything unlocked for it is wiped. */
export const AGENT_CUSTODY_SESSION_MS = 60 * 60 * 1000;

export const PRIVATE_TEXT_MAX_CHARS = 20_000;
/** Largest encrypted private file Unlock downloads to decode as text. */
export const PRIVATE_FILE_MAX_BYTES = 8 * 1024 * 1024;
export const PRIVATE_SEARCH_MAX_RESULTS = 25;

export const AGENT_CUSTODY_TOOLS = [
  'search_private_files',
  'read_private_file',
  'read_private_pen_document',
] as const;

export type AgentCustodyTool = (typeof AGENT_CUSTODY_TOOLS)[number];

/** Any listed scope enables the tool; search only covers the kinds the agent was granted. */
export const AGENT_CUSTODY_TOOL_SCOPES: Readonly<Record<AgentCustodyTool, readonly AiScope[]>> = {
  search_private_files: [AI_SCOPES.filesPrivate, AI_SCOPES.penPrivate],
  read_private_file: [AI_SCOPES.filesPrivate],
  read_private_pen_document: [AI_SCOPES.penPrivate],
};

export const AGENT_CUSTODY_ERRORS = [
  'invalid_request',
  'access_revoked',
  'insufficient_scope',
  'agent_not_on_this_mac',
  'owner_declined',
  'not_found',
  'unsupported_type',
  'too_large',
  'unavailable',
] as const;

export type AgentCustodyErrorCode = (typeof AGENT_CUSTODY_ERRORS)[number];

export type AgentCustodyRequest = {
  v: typeof AGENT_CUSTODY_PROTOCOL_VERSION;
  id: string;
  token: string;
  tool: AgentCustodyTool;
  args: Record<string, unknown>;
};

export type AgentCustodyResponse =
  | { v: typeof AGENT_CUSTODY_PROTOCOL_VERSION; id: string; ok: true; result: unknown }
  | { v: typeof AGENT_CUSTODY_PROTOCOL_VERSION; id: string; ok: false; error: AgentCustodyErrorCode };

export type PrivateFileHit = { fileId: string; name: string; mimeType: string; modifiedTime: string | null };
export type PrivatePenHit = { docId: string; title: string; updatedAt: string | null };
export type PrivateSearchResult = { files: PrivateFileHit[]; penDocuments: PrivatePenHit[] };
export type PrivateFileText = {
  fileId: string;
  name: string;
  mimeType: string;
  text: string;
  truncated: boolean;
};
export type PrivatePenText = {
  docId: string;
  title: string;
  updatedAt: string | null;
  text: string;
  truncated: boolean;
};

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TOKEN_MAX = 16 * 1024;
const NAME_MAX = 256;
const ID_MAX = 256;

const TOOLS = new Set<string>(AGENT_CUSTODY_TOOLS);
const ERRORS = new Set<string>(AGENT_CUSTODY_ERRORS);

export function isAgentCustodyTool(tool: unknown): tool is AgentCustodyTool {
  return typeof tool === 'string' && TOOLS.has(tool);
}

export function isAgentCustodyErrorCode(code: unknown): code is AgentCustodyErrorCode {
  return typeof code === 'string' && ERRORS.has(code);
}

export function isAgentCustodyRequestId(id: unknown): id is string {
  return typeof id === 'string' && REQUEST_ID_RE.test(id);
}

export function parseAgentCustodyRequest(raw: unknown): AgentCustodyRequest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.v !== AGENT_CUSTODY_PROTOCOL_VERSION) return null;
  if (!isAgentCustodyRequestId(row.id)) return null;
  if (typeof row.token !== 'string' || !row.token || row.token.length > TOKEN_MAX) return null;
  if (!isAgentCustodyTool(row.tool)) return null;
  const args = row.args ?? {};
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
  return {
    v: AGENT_CUSTODY_PROTOCOL_VERSION,
    id: row.id,
    token: row.token,
    tool: row.tool,
    args: args as Record<string, unknown>,
  };
}

export function parseAgentCustodyResponse(raw: unknown): AgentCustodyResponse | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.v !== AGENT_CUSTODY_PROTOCOL_VERSION || !isAgentCustodyRequestId(row.id)) return null;
  if (row.ok === true) return { v: AGENT_CUSTODY_PROTOCOL_VERSION, id: row.id, ok: true, result: row.result };
  if (row.ok === false && isAgentCustodyErrorCode(row.error)) {
    return { v: AGENT_CUSTODY_PROTOCOL_VERSION, id: row.id, ok: false, error: row.error };
  }
  return null;
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

function isoOrNull(v: unknown): string | null {
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) return null;
  return new Date(v).toISOString();
}

/** Cut at the character cap without splitting a surrogate pair. */
export function capPrivateText(text: string): { text: string; truncated: boolean } {
  if (text.length <= PRIVATE_TEXT_MAX_CHARS) return { text, truncated: false };
  let cut = PRIVATE_TEXT_MAX_CHARS;
  const code = text.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
  return { text: text.slice(0, cut), truncated: true };
}

function projectFileHit(raw: unknown): PrivateFileHit | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const fileId = str(row.fileId, ID_MAX);
  const name = str(row.name, NAME_MAX);
  if (!fileId || !name) return null;
  return {
    fileId,
    name,
    mimeType: str(row.mimeType, NAME_MAX) || 'application/octet-stream',
    modifiedTime: isoOrNull(row.modifiedTime),
  };
}

function projectPenHit(raw: unknown): PrivatePenHit | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const docId = str(row.docId, ID_MAX);
  if (!docId) return null;
  return { docId, title: str(row.title, NAME_MAX) || 'Untitled', updatedAt: isoOrNull(row.updatedAt) };
}

function hits<T>(list: unknown, project: (raw: unknown) => T | null): T[] {
  if (!Array.isArray(list)) return [];
  const out: T[] = [];
  for (const item of list) {
    const hit = project(item);
    if (hit) out.push(hit);
    if (out.length >= PRIVATE_SEARCH_MAX_RESULTS) break;
  }
  return out;
}

/** Allowlisted fields only. Anything else a reader returns is dropped here. */
export function projectPrivateSearch(raw: unknown): PrivateSearchResult {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { files: hits(row.files, projectFileHit), penDocuments: hits(row.penDocuments, projectPenHit) };
}

export function projectPrivateFileText(raw: unknown): PrivateFileText | null {
  const hit = projectFileHit(raw);
  if (!hit) return null;
  const text = (raw as Record<string, unknown>).text;
  if (typeof text !== 'string') return null;
  const capped = capPrivateText(text);
  return { fileId: hit.fileId, name: hit.name, mimeType: hit.mimeType, ...capped };
}

export function projectPrivatePenText(raw: unknown): PrivatePenText | null {
  const hit = projectPenHit(raw);
  if (!hit) return null;
  const text = (raw as Record<string, unknown>).text;
  if (typeof text !== 'string') return null;
  return { ...hit, ...capPrivateText(text) };
}

const TEXT_MIME_EXACT = new Set([
  'application/json',
  'application/ld+json',
  'application/xml',
  'application/x-yaml',
  'application/yaml',
  'application/javascript',
  'application/x-javascript',
  'application/typescript',
  'application/x-sh',
  'application/csv',
  'application/x-ndjson',
  'application/toml',
]);

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'ndjson', 'xml', 'yaml', 'yml', 'log',
  'html', 'htm', 'css', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'sh', 'ini', 'toml',
]);

/** Text bodies only; images, PDFs, media and office files are never decoded for an agent. */
export function isPrivateTextType(mimeType: string | null | undefined, name: string | null | undefined): boolean {
  const mime = String(mimeType || '').toLowerCase().split(';')[0]!.trim();
  if (mime.startsWith('text/')) return true;
  if (TEXT_MIME_EXACT.has(mime)) return true;
  if (mime && mime !== 'application/octet-stream') return false;
  const ext = String(name || '').toLowerCase().split('.').pop() || '';
  return TEXT_EXTENSIONS.has(ext);
}
