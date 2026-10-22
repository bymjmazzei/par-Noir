/**
 * @jest-environment node
 *
 * Only the connector OAuth endpoints skip the production Origin requirement, and connector
 * web origins are allowed on those paths only.
 */
import { isAgentConnectorCorsOrigin, isAgentConnectorPath } from './agentConnectorRequest';

describe('agent connector request policy', () => {
  it('opens discovery, authorize, register and token, with their methods only', () => {
    expect(isAgentConnectorPath('/.well-known/oauth-protected-resource', 'GET')).toBe(true);
    expect(isAgentConnectorPath('/.well-known/oauth-protected-resource/mcp', 'GET')).toBe(true);
    expect(isAgentConnectorPath('/.well-known/oauth-authorization-server', 'HEAD')).toBe(true);
    expect(isAgentConnectorPath('/oauth/authorize', 'GET')).toBe(true);
    expect(isAgentConnectorPath('/oauth/register', 'POST')).toBe(true);
    expect(isAgentConnectorPath('/oauth/token', 'POST')).toBe(true);
    expect(isAgentConnectorPath('/mcp', 'POST')).toBe(true);
    expect(isAgentConnectorPath('/mcp', 'OPTIONS')).toBe(true);

    expect(isAgentConnectorPath('/.well-known/oauth-authorization-server', 'POST')).toBe(false);
    expect(isAgentConnectorPath('/oauth/authorize/authenticate', 'POST')).toBe(false);
    expect(isAgentConnectorPath('/oauth/authorize/broker-complete', 'POST')).toBe(false);
    expect(isAgentConnectorPath('/api/agent/files/search', 'GET')).toBe(false);
    expect(isAgentConnectorPath('/oauth/registerx', 'POST')).toBe(false);
  });

  it('connector origins are allowed on connector paths only', () => {
    expect(isAgentConnectorCorsOrigin('https://claude.ai', '/oauth/token', 'POST')).toBe(true);
    expect(isAgentConnectorCorsOrigin('https://chatgpt.com', '/oauth/register', 'OPTIONS')).toBe(true);
    expect(isAgentConnectorCorsOrigin('https://claude.ai', '/api/agent/files/search', 'GET')).toBe(false);
    expect(isAgentConnectorCorsOrigin('https://evil.example', '/oauth/token', 'POST')).toBe(false);
  });
});
