import { execFile } from 'node:child_process';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AI_SCOPE_LABELS, isKnownAiScope } from '@par-noir/standard-data-points';
import { AgentApiClient } from './apiClient';
import { createApiSource } from './apiSource';
import { resolveApiUrl } from './config';
import { AgentCustodyClient, defaultAgentSocketPath } from './custodyClient';
import { ERROR_MESSAGES, McpToolError, toErrorCode } from './errors';
import { createLogger } from './log';
import { login, logout } from './login';
import { createPnMcpServer } from './server';
import { KeychainTokenStore } from './tokenStore';

const USAGE = `pn-mcp <command>

  login    Sign in an AI agent with par Noir Unlock (Touch ID)
  status   Show whether an agent is signed in and what it can read
  logout   Sign out and remove the agent's tokens from the Keychain
  serve    Run the MCP server on stdio (default)`;

/** stdout belongs to the MCP protocol during serve, so humans read stderr. */
const say = (line: string) => process.stderr.write(`${line}\n`);

function openUrl(url: string): Promise<void> {
  if (process.platform !== 'darwin') {
    return Promise.reject(new Error('pn-mcp login needs par Noir Unlock on macOS'));
  }
  return new Promise((resolve, reject) => {
    execFile('open', [url], (err) => (err ? reject(new Error('Could not open par Noir Unlock')) : resolve()));
  });
}

function describeScopes(scopes: string[]): string {
  const labels = scopes.filter(isKnownAiScope).map((s) => AI_SCOPE_LABELS[s]);
  return labels.length ? labels.join('; ') : 'nothing';
}

async function main(command: string): Promise<number> {
  const logger = createLogger();
  const store = new KeychainTokenStore();

  switch (command) {
    case 'login': {
      say('Opening par Noir Unlock. Pick your AI agent and confirm with Touch ID.');
      const { scopes } = await login({ apiUrl: resolveApiUrl(), store, logger, openUrl });
      say(`Signed in. This agent can: ${describeScopes(scopes)}.`);
      return 0;
    }
    case 'status': {
      const tokens = await store.load();
      say(tokens ? `Signed in. This agent can: ${describeScopes(tokens.scopes)}.` : ERROR_MESSAGES.not_signed_in);
      return tokens ? 0 : 1;
    }
    case 'logout': {
      say((await logout({ store })) ? 'Signed out.' : 'Already signed out.');
      return 0;
    }
    case 'serve': {
      const client = new AgentApiClient({ store, logger });
      const custody = new AgentCustodyClient({
        socketPath: defaultAgentSocketPath(),
        accessToken: () => client.accessToken(),
      });
      const server = await createPnMcpServer({ source: createApiSource(client, custody), mode: 'local', logger });
      await server.connect(new StdioServerTransport());
      logger.info('serving');
      return -1;
    }
    default:
      say(USAGE);
      return command === 'help' || command === '--help' ? 0 : 1;
  }
}

main(process.argv[2] ?? 'serve').then(
  (code) => {
    if (code >= 0) process.exit(code);
  },
  (err: unknown) => {
    say(err instanceof McpToolError || !(err instanceof Error) ? ERROR_MESSAGES[toErrorCode(err)] : err.message);
    process.exit(1);
  }
);
