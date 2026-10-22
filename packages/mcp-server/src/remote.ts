import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Logger } from './log';
import { createPnMcpServer } from './server';
import type { PnMcpSource } from './source';

/**
 * Serve one MCP request over stateless Streamable HTTP: a fresh server per request whose
 * tool list is exactly this token's scopes, in remote mode so private tools never exist.
 * The host authenticates the bearer and builds `source` for that agent before calling this.
 */
export async function handleRemoteMcpRequest(args: {
  source: PnMcpSource;
  logger: Logger;
  req: IncomingMessage;
  res: ServerResponse;
  body: unknown;
}): Promise<void> {
  const server = await createPnMcpServer({ source: args.source, mode: 'remote', logger: args.logger });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  args.res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(args.req, args.res, args.body);
}
