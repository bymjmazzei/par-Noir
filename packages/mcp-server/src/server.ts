import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { errorMessage, toErrorCode } from './errors';
import type { Logger } from './log';
import {
  PRIVATE_TOOL_DEFS,
  readPrivateFile,
  readPrivatePenDocument,
  searchPrivateFiles,
  type PrivateToolName,
} from './privateTools';
import type { PnMcpMode, PnMcpSource } from './source';
import {
  TOOL_DEFS,
  fetchAlias,
  proposePenDraft,
  proveDataPoint,
  readFile,
  readPenDocument,
  searchAlias,
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

interface ToolDef {
  title: string;
  description: string;
  inputSchema: unknown;
  outputSchema: unknown;
}

/** Generic over the definition object (not the tool name) so each registerTool call infers its args. */
function toolConfig<D extends ToolDef>(
  { title, description, inputSchema, outputSchema }: D,
  hints: typeof READ_ONLY | typeof OWNER_CONFIRMED_WRITE = READ_ONLY
) {
  return {
    title,
    description,
    inputSchema: inputSchema as D['inputSchema'],
    outputSchema: outputSchema as D['outputSchema'],
    annotations: { ...hints, title },
  };
}

export interface CreatePnMcpServerOptions {
  source: PnMcpSource;
  /** Remote never registers a private tool, whatever the source or token holds. */
  mode: PnMcpMode;
  logger: Logger;
}

function scopesFor(name: ToolName | PrivateToolName): readonly string[] {
  return name in PRIVATE_TOOL_DEFS
    ? PRIVATE_TOOL_DEFS[name as PrivateToolName].scopes
    : [TOOL_DEFS[name as ToolName].scope];
}

/** Lists only the tools the agent's token grants; each call checks the scope again. */
export async function createPnMcpServer({ source, mode, logger }: CreatePnMcpServerOptions): Promise<McpServer> {
  const granted = new Set(await source.grantedScopes());
  if (granted.size === 0) logger.warn('no_tools', { reason: 'not_signed_in' });
  const allowed = (name: ToolName) => granted.has(TOOL_DEFS[name].scope);
  const priv = mode === 'local' && source.private?.available() ? source.private : null;
  const privateAllowed = (name: PrivateToolName) =>
    Boolean(priv) && PRIVATE_TOOL_DEFS[name].scopes.some((s) => granted.has(s));
  const anyPrivate = (Object.keys(PRIVATE_TOOL_DEFS) as PrivateToolName[]).some(privateAllowed);

  const run = async (
    name: ToolName | PrivateToolName,
    call: () => Promise<Record<string, unknown>>
  ): Promise<CallToolResult> => {
    try {
      await source.requireAnyScope(scopesFor(name));
      const structuredContent = await call();
      logger.info('tool_ok', { tool: name });
      return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
    } catch (err) {
      const code = toErrorCode(err);
      logger.warn('tool_error', { tool: name, code });
      return { isError: true, content: [{ type: 'text', text: errorMessage(code, mode) }] };
    }
  };

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
  if (allowed('search_my_files')) {
    server.registerTool('search_my_files', toolConfig(TOOL_DEFS.search_my_files), (args) =>
      run('search_my_files', () => searchMyFiles(source, args))
    );
  }
  if (allowed('read_file')) {
    server.registerTool('read_file', toolConfig(TOOL_DEFS.read_file), (args) =>
      run('read_file', () => readFile(source, args))
    );
  }
  if (allowed('read_pen_document')) {
    server.registerTool('read_pen_document', toolConfig(TOOL_DEFS.read_pen_document), (args) =>
      run('read_pen_document', () => readPenDocument(source, args))
    );
  }
  if (allowed('search')) {
    server.registerTool('search', toolConfig(TOOL_DEFS.search), (args) => run('search', () => searchAlias(source, args)));
  }
  if (allowed('fetch')) {
    server.registerTool('fetch', toolConfig(TOOL_DEFS.fetch), (args) =>
      run('fetch', async () => ({ ...(await fetchAlias(source, args)) }))
    );
  }
  if (allowed('prove_data_point')) {
    server.registerTool('prove_data_point', toolConfig(TOOL_DEFS.prove_data_point), (args) =>
      run('prove_data_point', async () => ({ ...(await proveDataPoint(source, args)) }))
    );
  }
  if (allowed('propose_pen_draft')) {
    server.registerTool('propose_pen_draft', toolConfig(TOOL_DEFS.propose_pen_draft, OWNER_CONFIRMED_WRITE), (args) =>
      run('propose_pen_draft', async () => ({ ...(await proposePenDraft(source, args)) }))
    );
  }
  if (priv) {
    if (privateAllowed('search_private_files')) {
      server.registerTool('search_private_files', toolConfig(PRIVATE_TOOL_DEFS.search_private_files), (args) =>
        run('search_private_files', async () => ({ ...(await searchPrivateFiles(priv, args)) }))
      );
    }
    if (privateAllowed('read_private_file')) {
      server.registerTool('read_private_file', toolConfig(PRIVATE_TOOL_DEFS.read_private_file), (args) =>
        run('read_private_file', () => readPrivateFile(priv, args))
      );
    }
    if (privateAllowed('read_private_pen_document')) {
      server.registerTool('read_private_pen_document', toolConfig(PRIVATE_TOOL_DEFS.read_private_pen_document), (args) =>
        run('read_private_pen_document', () => readPrivatePenDocument(priv, args))
      );
    }
  }
  return server;
}
