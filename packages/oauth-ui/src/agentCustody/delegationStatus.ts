import { filterKnownAiScopes, type AiScope } from '@par-noir/standard-data-points';
import { AgentCustodyError } from './errors';

export type AgentDelegationStatus = { active: boolean; scopes: AiScope[] };

/** Ask the API whether the owner still delegates to this agent. The answer is `{active, scopes}` only. */
export async function fetchAgentDelegationStatus(opts: {
  apiEndpoint: string;
  agentToken: string;
  fetchImpl?: typeof fetch;
}): Promise<AgentDelegationStatus> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(`${opts.apiEndpoint.replace(/\/$/, '')}/api/agent/delegation-status`, {
      headers: { Authorization: `Bearer ${opts.agentToken}` },
    });
  } catch {
    throw new AgentCustodyError('unavailable');
  }
  if (res.status === 401 || res.status === 403) throw new AgentCustodyError('access_revoked');
  if (!res.ok) throw new AgentCustodyError('unavailable');
  const body = (await res.json().catch(() => null)) as { active?: unknown; scopes?: unknown } | null;
  if (!body || typeof body.active !== 'boolean' || !Array.isArray(body.scopes)) {
    throw new AgentCustodyError('unavailable');
  }
  const scopes = filterKnownAiScopes(body.scopes.filter((s): s is string => typeof s === 'string'));
  return { active: body.active, scopes: body.active ? scopes : [] };
}
