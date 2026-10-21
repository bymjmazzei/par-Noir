import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AgentApiClient } from './apiClient';
import type { AgentCustodyClient } from './custodyClient';
import { ERROR_MESSAGES, toErrorCode } from './errors';
import type { Logger } from './log';
import {
  PRIVATE_TOOL_DEFS,
  readPrivateFile,
  readPrivatePenDocument,
  searchPrivateFiles,
  type PrivateToolName,
} from './privateTools';
import {
  TOOL_DEFS,
  proposePenDraft,
  proveDataPoint,
  readFile,
  readPenDocument,
  searchMyFiles,
  type ToolName,
} from './tools';

export const SERVER_VERSION = '0.1.0';

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/** Writes only a sealed proposal the owner must accept; the client-supplied draftId makes retries safe. */
const OWNER_CONFIRMED_WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export interface PnMcpDeps {
  client: AgentApiClient;
  logger: Logger;
  /** Local mode only: par Noir Unlock on this Mac. Without it no private tool exists. */
  custody?: AgentCustodyClient;
}

function scopesFor(name: ToolName | PrivateToolName): readonly string[] {
  return name in PRIVATE_TOOL_DEFS
    ? PRIVATE_TOOL_DEFS[name as PrivateToolName].scopes
    : [TOOL_DEFS[name as ToolName].scope];
}

async function run(
  name: ToolName | PrivateToolName,
  deps: PnMcpDeps,
  call: () => Promise<Record<string, unknown>>
): Promise<CallToolResult> {
  try {
    await deps.client.requireAnyScope(scopesFor(name));
    const structuredContent = await call();
    deps.logger.info('tool_ok', { tool: name });
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
  } catch (err) {
    const code = toErrorCode(err);
    deps.logger.warn('tool_error', { tool: name, code });
    return { isError: true, content: [{ type: 'text', text: ERROR_MESSAGES[code] }] };
  }
}

/** Lists only the tools the agent's token grants; each call checks the scope again. */
export async function createPnMcpServer(deps: PnMcpDeps): Promise<McpServer> {
  const granted = new Set(await deps.client.grantedScopes());
  if (granted.size === 0) deps.logger.warn('no_tools', { reason: 'not_signed_in' });
  const allowed = (name: ToolName) => granted.has(TOOL_DEFS[name].scope);
  const custody = deps.custody?.available() ? deps.custody : null;
  const privateAllowed = (name: PrivateToolName) =>
    Boolean(custody) && PRIVATE_TOOL_DEFS[name].scopes.some((s) => granted.has(s));
  const anyPrivate = (Object.keys(PRIVATE_TOOL_DEFS) as PrivateToolName[]).some(privateAllowed);

  const server = new McpServer(
    { name: 'par-noir', version: SERVER_VERSION },
    {
      instructions:
        'Access, through an AI agent the owner approved, to what they have published on par Noir and to ' +
        'yes/no answers about proofs they chose to share. The only write is proposing a Pen draft, which the ' +
        'owner must accept in Pen. ' +
        (anyPrivate
          ? 'Private files and Pen documents are read through par Noir Unlock on this Mac, only after the owner approves with Touch ID.'
          : 'Nothing private is available.'),
    }
  );
  const config = (name: ToolName, hints: typeof READ_ONLY | typeof OWNER_CONFIRMED_WRITE = READ_ONLY) => {
    const { title, description, inputSchema, outputSchema } = TOOL_DEFS[name];
    return { title, description, inputSchema, outputSchema, annotations: { ...hints, title } };
  };

  if (allowed('search_my_files')) {
    server.registerTool('search_my_files', config('search_my_files'), (args) =>
      run('search_my_files', deps, () => searchMyFiles(deps.client, args))
    );
  }
  if (allowed('read_file')) {
    server.registerTool('read_file', config('read_file'), (args) =>
      run('read_file', deps, () => readFile(deps.client, args))
    );
  }
  if (allowed('read_pen_document')) {
    server.registerTool('read_pen_document', config('read_pen_document'), (args) =>
      run('read_pen_document', deps, () => readPenDocument(deps.client, args))
    );
  }
  if (allowed('prove_data_point')) {
    server.registerTool('prove_data_point', config('prove_data_point'), (args) =>
      run('prove_data_point', deps, async () => ({ ...(await proveDataPoint(deps.client, args)) }))
    );
  }
  if (allowed('propose_pen_draft')) {
    server.registerTool('propose_pen_draft', config('propose_pen_draft', OWNER_CONFIRMED_WRITE), (args) =>
      run('propose_pen_draft', deps, async () => ({ ...(await proposePenDraft(deps.client, args)) }))
    );
  }
  if (custody) {
    const privateConfig = (name: PrivateToolName) => {
      const { title, description, inputSchema, outputSchema } = PRIVATE_TOOL_DEFS[name];
      return { title, description, inputSchema, outputSchema, annotations: { ...READ_ONLY, title } };
    };
    if (privateAllowed('search_private_files')) {
      server.registerTool('search_private_files', privateConfig('search_private_files'), (args) =>
        run('search_private_files', deps, async () => ({ ...(await searchPrivateFiles(custody, args)) }))
      );
    }
    if (privateAllowed('read_private_file')) {
      server.registerTool('read_private_file', privateConfig('read_private_file'), (args) =>
        run('read_private_file', deps, () => readPrivateFile(custody, args))
      );
    }
    if (privateAllowed('read_private_pen_document')) {
      server.registerTool('read_private_pen_document', privateConfig('read_private_pen_document'), (args) =>
        run('read_private_pen_document', deps, () => readPrivatePenDocument(custody, args))
      );
    }
  }
  return server;
}
