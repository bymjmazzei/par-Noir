/**
 * Request policy for hosted AI connectors. Their OAuth discovery, registration and token
 * calls come server-to-server (no Origin) or from the connector's own web origin, and carry
 * no cookies, so these paths may skip the production Origin requirement.
 */

/** Web origins of hosted AI apps that call the connector endpoints from a browser. */
export const AGENT_CONNECTOR_ORIGINS: readonly string[] = [
  'https://claude.ai',
  'https://chatgpt.com',
  'https://chat.openai.com',
];

const DISCOVERY_PATHS = ['/.well-known/oauth-protected-resource', '/.well-known/oauth-authorization-server'];

export function isAgentConnectorPath(path: string, method: string): boolean {
  const m = (method || 'GET').toUpperCase();
  if (DISCOVERY_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
    return m === 'GET' || m === 'HEAD' || m === 'OPTIONS';
  }
  if (path === '/oauth/authorize') return m === 'GET' || m === 'HEAD';
  if (path === '/oauth/register' || path === '/oauth/token') return m === 'POST' || m === 'OPTIONS';
  return false;
}

export function isAgentConnectorCorsOrigin(origin: string, path: string, method: string): boolean {
  return AGENT_CONNECTOR_ORIGINS.includes(origin) && isAgentConnectorPath(path, method);
}
