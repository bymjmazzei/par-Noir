import { describe, expect, it } from 'vitest';
import {
  AGENT_CONNECTOR_CLIENT_ID_PREFIX,
  AGENT_MCP_CLIENT,
  AGENT_MCP_CLIENT_ID,
  AI_DATA_DISCLOSURE,
  REMOTE_AI_SCOPES,
  isAgentClassClientId,
  isAgentConnectorClientId,
  AI_SCOPE_LABELS,
  AI_SCOPES,
  ATTESTABLE_DATA_POINT_IDS,
  canonicalDelegationBytes,
  filterKnownAiScopes,
  isAiScope,
  isKnownAiScope,
  isLocalOnlyAiScope,
  parseAgentDelegationDraft,
  parseAgentDelegationStatement,
  type AgentDelegationStatement
} from './agentClient';
import { STANDARD_DATA_POINTS } from './catalog';
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

  it('remote connectors get every ai: scope except the local-only private reads', () => {
    expect([...REMOTE_AI_SCOPES].sort()).toEqual(['ai:files.published', 'ai:pen.drafts', 'ai:pen.published', 'ai:proofs']);
    expect(REMOTE_AI_SCOPES.some(isLocalOnlyAiScope)).toBe(false);
  });

  it('recognizes agent-class clients: the MCP client and prefixed connectors only', () => {
    expect(isAgentClassClientId(AGENT_MCP_CLIENT_ID)).toBe(true);
    expect(isAgentConnectorClientId(`${AGENT_CONNECTOR_CLIENT_ID_PREFIX}3f9a`)).toBe(true);
    expect(isAgentClassClientId(`${AGENT_CONNECTOR_CLIENT_ID_PREFIX}3f9a`)).toBe(true);
    expect(isAgentConnectorClientId(AGENT_CONNECTOR_CLIENT_ID_PREFIX)).toBe(false);
    for (const id of ['browser-app', 'pen-app', 'x-pn-connector-1', 'pn-agent-mcp-2']) {
      expect(isAgentClassClientId(id)).toBe(false);
    }
  });

  it('seeds every ai: scope on the MCP client so the API can narrow to the delegation', () => {
    for (const scope of Object.values(AI_SCOPES)) {
      expect(AGENT_MCP_CLIENT.scopes).toContain(scope);
    }
  });

  it('says plainly that returned data leaves par Noir custody for the AI provider', () => {
    expect(AI_DATA_DISCLOSURE).toContain('leaves par Noir custody');
    expect(AI_DATA_DISCLOSURE).toContain('AI provider');
    expect(AI_DATA_DISCLOSURE).toContain('Revoke anytime');
  });

  it('discloses that proofs are yes/no only and drafts wait for the owner', () => {
    expect(AI_DATA_DISCLOSURE).toMatch(/yes or no/);
    expect(AI_DATA_DISCLOSURE).toMatch(/never sent/);
    expect(AI_DATA_DISCLOSURE).toMatch(/accept them in Pen/);
  });
});

describe('ai: scopes', () => {
  it('recognises the ai: family but only accepts defined ids', () => {
    expect(isAiScope('ai:messages')).toBe(true);
    expect(isKnownAiScope('ai:messages')).toBe(false);
    for (const scope of Object.values(AI_SCOPES)) expect(isKnownAiScope(scope)).toBe(true);
  });

  it('labels every scope in human words', () => {
    for (const scope of Object.values(AI_SCOPES)) {
      expect(AI_SCOPE_LABELS[scope].length).toBeGreaterThan(10);
      expect(AI_SCOPE_LABELS[scope]).not.toContain('ai:');
    }
  });

  it('marks only the private reads as local-only', () => {
    expect(isLocalOnlyAiScope(AI_SCOPES.filesPrivate)).toBe(true);
    expect(isLocalOnlyAiScope(AI_SCOPES.penPrivate)).toBe(true);
    expect(isLocalOnlyAiScope(AI_SCOPES.filesPublished)).toBe(false);
    expect(isLocalOnlyAiScope(AI_SCOPES.penPublished)).toBe(false);
    expect(isLocalOnlyAiScope(AI_SCOPES.proofs)).toBe(false);
    expect(isLocalOnlyAiScope(AI_SCOPES.penDrafts)).toBe(false);
    expect(isLocalOnlyAiScope('ai:unknown')).toBe(false);
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

describe('attestable data points', () => {
  it('come from the catalog', () => {
    for (const id of ATTESTABLE_DATA_POINT_IDS) expect(STANDARD_DATA_POINTS[id]).toBeDefined();
  });

  it('never include raw values like birthdate, names, numbers or images', () => {
    const ids = ATTESTABLE_DATA_POINT_IDS as readonly string[];
    for (const id of ['age_attestation', 'full_name', 'first_name', 'document_number', 'document_front']) {
      expect(ids).not.toContain(id);
    }
  });
});

const statement: AgentDelegationStatement = {
  v: 1,
  rootPublicKey: 'root-pk',
  agentPnIdentifier: 'pn-agent',
  agentPublicKey: 'agent-pk',
  scopes: ['ai:proofs', 'ai:files.published'],
  attestations: [
    { dataPointId: 'over_21', satisfied: true, level: 'verified', expiresAt: null },
    { dataPointId: 'over_18', satisfied: true, level: 'attested', expiresAt: '2027-01-01T00:00:00.000Z' }
  ],
  issuedAt: '2026-10-21T13:00:00.000Z',
  expiresAt: null,
  nonce: 'abcdefghijklmnop'
};

describe('canonicalDelegationBytes', () => {
  const text = (s: AgentDelegationStatement) => new TextDecoder().decode(canonicalDelegationBytes(s));

  it('is domain-separated and stable', () => {
    expect(text(statement).startsWith('PN-AGENT-DELEGATION-V1\n')).toBe(true);
    expect(text(statement)).toBe(text(statement));
  });

  it('ignores input key order and scope / attestation order', () => {
    const shuffled = {
      nonce: statement.nonce,
      expiresAt: statement.expiresAt,
      issuedAt: statement.issuedAt,
      attestations: [...statement.attestations].reverse().map((a) => ({
        expiresAt: a.expiresAt,
        level: a.level,
        satisfied: a.satisfied,
        dataPointId: a.dataPointId
      })),
      scopes: [...statement.scopes].reverse(),
      agentPublicKey: statement.agentPublicKey,
      agentPnIdentifier: statement.agentPnIdentifier,
      rootPublicKey: statement.rootPublicKey,
      v: 1
    } as AgentDelegationStatement;
    expect(canonicalDelegationBytes(shuffled)).toEqual(canonicalDelegationBytes(statement));
  });

  it('changes when any signed field changes', () => {
    const base = text(statement);
    expect(text({ ...statement, agentPublicKey: 'other' })).not.toBe(base);
    expect(text({ ...statement, scopes: ['ai:proofs'] })).not.toBe(base);
    expect(
      text({ ...statement, attestations: [{ ...statement.attestations[0], satisfied: false }] })
    ).not.toBe(base);
    expect(text({ ...statement, nonce: 'zyxwvutsrqponmlk' })).not.toBe(base);
  });

  it('round-trips through parse to the same bytes', () => {
    const parsed = parseAgentDelegationStatement(JSON.parse(JSON.stringify(statement)));
    expect(parsed).not.toBeNull();
    expect(canonicalDelegationBytes(parsed!)).toEqual(canonicalDelegationBytes(statement));
  });
});

describe('parseAgentDelegationStatement', () => {
  it('rejects unknown scopes, unattestable proofs, duplicates and short nonces', () => {
    expect(parseAgentDelegationStatement({ ...statement, scopes: ['ai:proofs', 'cloud:read'] })).toBeNull();
    expect(
      parseAgentDelegationStatement({
        ...statement,
        attestations: [{ dataPointId: 'age_attestation', satisfied: true, level: 'attested', expiresAt: null }]
      })
    ).toBeNull();
    expect(
      parseAgentDelegationStatement({
        ...statement,
        attestations: [statement.attestations[0], statement.attestations[0]]
      })
    ).toBeNull();
    expect(parseAgentDelegationStatement({ ...statement, nonce: 'short' })).toBeNull();
    expect(parseAgentDelegationStatement({ ...statement, v: 2 })).toBeNull();
  });

  it('requires ai:proofs before carrying attestations', () => {
    expect(parseAgentDelegationStatement({ ...statement, scopes: ['ai:files.published'] })).toBeNull();
    expect(
      parseAgentDelegationStatement({ ...statement, scopes: ['ai:files.published'], attestations: [] })
    ).not.toBeNull();
  });

  it('never accepts a raw value in an attestation', () => {
    const parsed = parseAgentDelegationDraft({
      ...statement,
      attestations: [{ ...statement.attestations[0], value: '1990-01-01' }]
    });
    expect(JSON.stringify(parsed)).not.toContain('1990-01-01');
  });
});
