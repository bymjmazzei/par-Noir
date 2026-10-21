import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AgentApiClient } from './apiClient';
import { ERROR_MESSAGES, toErrorCode } from './errors';
import type { Logger } from './log';
import { TOOL_DEFS, proveDataPoint, readFile, readPenDocument, searchMyFiles, type ToolName } from './tools';

export const SERVER_VERSION = '0.1.0';

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export interface PnMcpDeps {
  client: AgentApiClient;
  logger: Logger;
}

async function run(
  name: ToolName,
  deps: PnMcpDeps,
  call: () => Promise<Record<string, unknown>>
): Promise<CallToolResult> {
  try {
    await deps.client.requireScope(TOOL_DEFS[name].scope);
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
  const server = new McpServer(
    { name: 'par-noir', version: SERVER_VERSION },
    {
      instructions:
        'Read-only access, through an AI agent the owner approved, to what they have published on par Noir and to ' +
        'yes/no answers about proofs they chose to share. Nothing private is available.',
    }
  );
  const granted = new Set(await deps.client.grantedScopes());
  if (granted.size === 0) deps.logger.warn('no_tools', { reason: 'not_signed_in' });
  const allowed = (name: ToolName) => granted.has(TOOL_DEFS[name].scope);
  const config = (name: ToolName) => {
    const { title, description, inputSchema, outputSchema } = TOOL_DEFS[name];
    return { title, description, inputSchema, outputSchema, annotations: { ...READ_ONLY, title } };
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
  return server;
}
