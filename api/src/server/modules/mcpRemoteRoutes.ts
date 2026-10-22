/**
 * Remote MCP endpoint for hosted AI connectors (claude.ai, ChatGPT). Stateless Streamable
 * HTTP; the tool core is @par-noir/mcp-server in remote mode, so private tools never exist.
 *
 * Bearer only, and only tokens minted for this resource (aud = /mcp). Every request re-checks
 * the agent's live owner delegation, so revoke applies on the next call. Rate limited per agent;
 * logs carry hashed ids only.
 */
import type { Application, NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  McpToolError,
  handleRemoteMcpRequest,
  type LogFields,
  type Logger,
  type PnMcpSource,
} from '@par-noir/mcp-server';
import { hashIdentifier, safeLogger } from '../../utils/logger';
import { AGENT_CONNECTOR_ORIGINS } from '../utils/agentConnectorRequest';
import {
  agentProof,
  proposeAgentPenDraft,
  readAgentFile,
  readAgentPenDocument,
  resolveAgentContext,
  searchAgentFiles,
  type AgentRequestContext,
} from './agentRoutes';
import { getOwnerMlKemPublicKey } from './agentPenDraftService';
import { mcpResourceUrl, protectedResourceMetadataUrl } from './mcpResource';
import { PNOAuthService } from './pnOAuthService';

const MCP_PATH = '/mcp';
const PER_AGENT_WINDOW_MS = 60_000;
const PER_AGENT_MAX = 120;

type McpLocals = { agent: AgentRequestContext; tokenScopes: string[]; agentHash: string };

const mcpLogger: Logger = {
  info: (event: string, fields?: LogFields) => safeLogger.info(`[mcp] ${event}`, fields ?? {}),
  warn: (event: string, fields?: LogFields) => safeLogger.warn(`[mcp] ${event}`, fields ?? {}),
};

function unauthorized(res: Response, error?: 'invalid_token'): void {
  const challenge = [`Bearer resource_metadata="${protectedResourceMetadataUrl()}"`];
  if (error) challenge.push(`error="${error}"`);
  res.set('WWW-Authenticate', challenge.join(', '));
  res.status(401).json({ error: error ?? 'unauthorized' });
}

/** Browsers send Origin; connector backends do not. Only known connector web origins pass. */
function requireConnectorOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (origin && !AGENT_CONNECTOR_ORIGINS.includes(origin)) {
    res.status(403).json({ error: 'origin_not_allowed' });
    return;
  }
  next();
}

async function requireMcpBearer(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ') || !header.slice(7).trim()) return unauthorized(res);
  const payload = PNOAuthService.validateAccessToken(header.slice(7).trim(), mcpResourceUrl());
  if (!payload?.pnIdentifier) return unauthorized(res, 'invalid_token');
  try {
    const result = await resolveAgentContext(payload);
    if (!result.ok) {
      if (result.error === 'agent_client_required') {
        res.status(403).json({ error: result.error });
        return;
      }
      // Revoked or expired delegation: the connector must send the owner through sign-in again.
      return unauthorized(res, 'invalid_token');
    }
    const locals: McpLocals = {
      agent: result.agent,
      tokenScopes: Array.isArray(payload.scope) ? payload.scope : [],
      agentHash: hashIdentifier(result.agent.agentPnIdentifier),
    };
    res.locals.mcp = locals;
    next();
  } catch (e) {
    safeLogger.warn('[mcp] delegation check failed', { err: e instanceof Error ? e.message : 'unknown' });
    res.status(503).json({ error: 'delegation_unavailable' });
  }
}

const perAgentLimiter = rateLimit({
  windowMs: PER_AGENT_WINDOW_MS,
  max: PER_AGENT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (_req, res) => `mcp:${(res.locals.mcp as McpLocals).agentHash}`,
  handler: (_req, res) => {
    res.status(429).json({ error: 'rate_limited' });
  },
});

async function call<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof McpToolError) throw e;
    safeLogger.warn('[mcp] source failed', { err: e instanceof Error ? e.message : 'unknown' });
    throw new McpToolError('unavailable');
  }
}

/** This request's agent, already delegation-checked. Rows go back raw; the core allowlists them. */
export function createAgentMcpSource(agent: AgentRequestContext, tokenScopes: string[]): PnMcpSource {
  const granted: string[] = agent.scopes.filter((s) => tokenScopes.includes(s));
  return {
    grantedScopes: async () => [...granted],
    async requireAnyScope(scopes) {
      if (!scopes.some((s) => granted.includes(s))) throw new McpToolError('insufficient_scope');
    },
    searchFiles: ({ query, limit }) => call(() => searchAgentFiles(agent, query, limit)),
    readFile: (fileId) =>
      call(async () => {
        const file = await readAgentFile(agent, fileId);
        if (!file) throw new McpToolError('not_found');
        return file;
      }),
    readPen: (docId) =>
      call(async () => {
        if (!docId.trim()) throw new McpToolError('invalid_request');
        const document = await readAgentPenDocument(agent, docId.trim());
        if (!document) throw new McpToolError('not_found');
        return document;
      }),
    prove: (dataPointId) =>
      call(async () => {
        const result = agentProof(agent, dataPointId);
        if (result.ok) return result.attestation;
        throw new McpToolError(result.error === 'expired' ? 'proof_expired' : result.error);
      }),
    ownerMlKemPublicKey: () =>
      call(async () => {
        const key = await getOwnerMlKemPublicKey(agent.rootPnIdentifier);
        if (!key) throw new McpToolError('owner_inbox_unavailable');
        return key;
      }),
    proposeDraft: (submission) =>
      call(async () => {
        const result = await proposeAgentPenDraft(agent, submission);
        if (result.ok) return { draftId: result.draftId, status: 'awaiting_owner' };
        throw new McpToolError(result.error === 'sealed_draft_required' ? 'invalid_request' : result.error);
      }),
  };
}

export function registerMcpRemoteRoutes(app: Application): void {
  app.post(MCP_PATH, requireConnectorOrigin, requireMcpBearer, perAgentLimiter, async (req: Request, res: Response) => {
    const { agent, tokenScopes, agentHash } = res.locals.mcp as McpLocals;
    try {
      await handleRemoteMcpRequest({
        source: createAgentMcpSource(agent, tokenScopes),
        logger: mcpLogger,
        req,
        res,
        body: req.body,
      });
    } catch (e) {
      safeLogger.warn('[mcp] request failed', { agentHash, err: e instanceof Error ? e.message : 'unknown' });
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
      }
    }
  });

  // Stateless: no server-initiated stream and no session to delete. Still 401 first, so a
  // connector probing with GET learns where to sign in.
  app.all(MCP_PATH, requireConnectorOrigin, requireMcpBearer, (_req: Request, res: Response) => {
    res.set('Allow', 'POST').status(405).json({ error: 'method_not_allowed' });
  });
}
