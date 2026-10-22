/**
 * Public addresses for the remote MCP endpoint and its OAuth issuer. Taken from config,
 * never from the request's Host header, so discovery and token audiences cannot be spoofed.
 */

const DEFAULT_PUBLIC_API_URL = 'https://api.parnoir.com';

export function publicApiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.API_PUBLIC_URL || env.PUBLIC_API_URL || DEFAULT_PUBLIC_API_URL).trim();
  return raw.replace(/\/+$/, '');
}

/** RFC 8707 resource and the `aud` of every connector access token. */
export function mcpResourceUrl(env: NodeJS.ProcessEnv = process.env): string {
  return `${publicApiBaseUrl(env)}/mcp`;
}

export function protectedResourceMetadataUrl(env: NodeJS.ProcessEnv = process.env): string {
  return `${publicApiBaseUrl(env)}/.well-known/oauth-protected-resource`;
}

export function isMcpResource(value: unknown, env: NodeJS.ProcessEnv = process.env): boolean {
  return typeof value === 'string' && value.trim().replace(/\/+$/, '') === mcpResourceUrl(env);
}
