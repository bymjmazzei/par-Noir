import { describe, expect, it } from 'vitest';
import {
  AGENT_MCP_CLIENT,
  AGENT_MCP_CLIENT_ID,
  AI_DATA_DISCLOSURE,
  AI_SCOPES,
  filterKnownAiScopes,
  isAiScope,
  isKnownAiScope
} from './agentClient';
import { CLIENT_CONTRACTS } from './clientContracts';
import { defaultLabelForScope } from './integratorPermissionManifest';

describe('AI agent client contract', () => {
  it('is not a first-party contract', () => {
    expect(CLIENT_CONTRACTS[AGENT_MCP_CLIENT_ID]).toBeUndefined();
  });

  it('requests only openid and known ai: scopes', () => {
    for (const scope of AGENT_MCP_CLIENT.scopes) {
      expect(scope === 'openid' || isKnownAiScope(scope)).toBe(true);
    }
    expect(AGENT_MCP_CLIENT.scopes).not.toContain('cloud:read');
    expect(AGENT_MCP_CLIENT.scopes).not.toContain('cloud:app');
  });

  it('says plainly that returned data leaves par Noir custody for the AI provider', () => {
    expect(AI_DATA_DISCLOSURE).toContain('leaves par Noir custody');
    expect(AI_DATA_DISCLOSURE).toContain('AI provider');
    expect(AI_DATA_DISCLOSURE).toContain('Revoke anytime');
  });
});

describe('ai: scopes', () => {
  it('recognises the ai: family but only accepts defined ids', () => {
    expect(isAiScope('ai:files.private')).toBe(true);
    expect(isKnownAiScope('ai:files.private')).toBe(false);
    expect(isKnownAiScope(AI_SCOPES.filesPublished)).toBe(true);
  });

  it('drops unknown and non-ai scopes and de-duplicates', () => {
    expect(
      filterKnownAiScopes(['ai:pen.published', 'cloud:read', 'ai:messages', 'ai:pen.published'])
    ).toEqual(['ai:pen.published']);
  });

  it('labels ai: scopes in human words on the consent manifest', () => {
    expect(defaultLabelForScope(AI_SCOPES.filesPublished)).not.toBe(AI_SCOPES.filesPublished);
    expect(defaultLabelForScope(AI_SCOPES.penPublished)).toMatch(/Pen/);
  });
});
