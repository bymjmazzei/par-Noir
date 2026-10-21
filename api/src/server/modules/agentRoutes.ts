/**
 * Read routes for AI agent sub-pNs (pn-agent-mcp). Every request re-checks the owner's
 * live delegation in Postgres, so revoke takes effect on the next call. Public data only:
 * responses are allowlist projections of published rows authored by the owning root pN.
 */

import type { Application, NextFunction, Request, Response } from 'express';
import {
  AGENT_MCP_CLIENT_ID,
  AI_SCOPES,
  isAttestableDataPointId,
  type AgentAttestation,
  type AgentDelegationStatement,
  type AiScope
} from '@par-noir/standard-data-points';
import {
  PEN_AGENT_DRAFT_MAX_BYTES,
  parsePenAgentDraftSubmission,
  penAgentDraftSubmissionBytes
} from '@par-noir/pen-protocol';
import { getBearerTokenPayload } from '../middleware/authMiddleware';
import { OwnedAssetService } from './ownedAssetService';
import { getOwnerMlKemPublicKey, submitAgentPenDraft } from './agentPenDraftService';
import { hashIdentifier, safeLogger } from '../../utils/logger';

const SEARCH_LIMIT_MAX = 50;
const PEN_SCAN_LIMIT = 200;
const TEXT_MAX_CHARS = 20_000;

export interface AgentRequestContext {
  agentPnIdentifier: string;
  rootPnIdentifier: string;
  scopes: AiScope[];
  attestations: AgentAttestation[];
  statement: AgentDelegationStatement;
}

/** What the agent may see of its own delegation: no owner key, no attestations. */
export interface AgentDelegationView {
  v: number;
  agentPnIdentifier: string;
  agentPublicKey: string;
  scopes: AiScope[];
  issuedAt: string;
  expiresAt: string | null;
  nonce: string;
}

/** Exactly the four fields an agent may learn about one proof. */
export function projectAttestation(a: AgentAttestation): AgentAttestation {
  return { dataPointId: a.dataPointId, satisfied: a.satisfied, level: a.level, expiresAt: a.expiresAt };
}

export function projectDelegation(statement: AgentDelegationStatement, liveScopes: AiScope[]): AgentDelegationView {
  return {
    v: statement.v,
    agentPnIdentifier: statement.agentPnIdentifier,
    agentPublicKey: statement.agentPublicKey,
    scopes: liveScopes,
    issuedAt: statement.issuedAt,
    expiresAt: statement.expiresAt,
    nonce: statement.nonce
  };
}

type AgentRequest = Request & { agent?: AgentRequestContext };

export interface AgentFileSummary {
  fileId: string;
  title: string;
  description: string;
  fileType: string;
  contentClass: string;
  tags: string[];
  publishedAt: string;
}

export interface AgentFile extends AgentFileSummary {
  text: string | null;
  textTruncated: boolean;
}

export interface AgentPenDocument {
  docId: string;
  fileId: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt: string;
  text: string | null;
  textTruncated: boolean;
}

function normalizePn(pn: string): string {
  const t = pn.trim();
  return t.startsWith('pn-') ? t : `pn-${t}`;
}

function deny(res: Response, status: number, error: string): void {
  res.status(status).json({ error });
}

/**
 * Bearer must be a pn-agent-mcp token whose agent sub-pN still holds an owner-signed
 * delegation, and `scope` when given. Fails closed: unknown, revoked, unsigned or expired
 * delegation → 403 delegation_revoked.
 */
export function requireAgentDelegation(scope?: AiScope) {
  return async (req: AgentRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = getBearerTokenPayload(req);
      if (!payload?.pnIdentifier) return deny(res, 401, 'unauthorized');
      if (payload.clientId !== AGENT_MCP_CLIENT_ID) return deny(res, 403, 'agent_client_required');
      const tokenScopes = Array.isArray(payload.scope) ? payload.scope : [];
      if (scope && !tokenScopes.includes(scope)) return deny(res, 403, 'insufficient_scope');

      const agentPn = normalizePn(payload.pnIdentifier);
      const delegation = await OwnedAssetService.resolveAgentDelegation(agentPn);
      if (!delegation) {
        safeLogger.info('[agent] delegation missing or revoked', { agentHash: hashIdentifier(agentPn) });
        return deny(res, 403, 'delegation_revoked');
      }
      if (scope && !delegation.scopes.includes(scope)) return deny(res, 403, 'insufficient_scope');

      req.agent = {
        agentPnIdentifier: agentPn,
        rootPnIdentifier: normalizePn(delegation.rootPnIdentifier),
        scopes: delegation.scopes as AiScope[],
        attestations: delegation.attestations,
        statement: delegation.statement
      };
      next();
    } catch (e) {
      safeLogger.warn('[agent] delegation check failed', {
        err: e instanceof Error ? e.message : 'unknown'
      });
      deny(res, 503, 'delegation_unavailable');
    }
  };
}

type Meta = Record<string, unknown>;

function isPublished(meta: Meta): boolean {
  return meta.isPublic === true || meta.isPublic === 'true';
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 25) : [];
}

function textOf(meta: Meta): { text: string | null; textTruncated: boolean } {
  const post = meta.textPost as { content?: unknown } | undefined;
  const content = typeof post?.content === 'string' ? post.content : null;
  if (content === null) return { text: null, textTruncated: false };
  return {
    text: content.slice(0, TEXT_MAX_CHARS),
    textTruncated: content.length > TEXT_MAX_CHARS
  };
}

export function projectFileSummary(fileId: string, meta: Meta): AgentFileSummary {
  return {
    fileId,
    title: str(meta.name) || str(meta.title),
    description: str(meta.description).slice(0, 2_000),
    fileType: str(meta.fileType),
    contentClass: str(meta.contentClass),
    tags: strList(meta.keywords).length > 0 ? strList(meta.keywords) : strList(meta.tags),
    publishedAt: str(meta.uploadDate)
  };
}

export function projectFile(fileId: string, meta: Meta): AgentFile {
  return { ...projectFileSummary(fileId, meta), ...textOf(meta) };
}

export function projectPenDocument(fileId: string, meta: Meta): AgentPenDocument {
  const base = projectFileSummary(fileId, meta);
  return {
    docId: str(meta.penDocId),
    fileId,
    title: base.title,
    description: base.description,
    publishedAt: base.publishedAt,
    updatedAt: str(meta.penPostUpdatedAt) || base.publishedAt,
    ...textOf(meta)
  };
}

async function metadataService() {
  const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
  return AggregatorMetadataServiceDB.getInstance();
}

export function registerAgentRoutes(app: Application): void {
  /**
   * For Unlock's local custody bridge: is this agent still delegated, and for which scopes.
   * Exactly `{active, scopes}`; never the owner, statement or attestations.
   */
  app.get('/api/agent/delegation-status', async (req: Request, res: Response) => {
    const payload = getBearerTokenPayload(req);
    if (!payload?.pnIdentifier) return deny(res, 401, 'unauthorized');
    if (payload.clientId !== AGENT_MCP_CLIENT_ID) return deny(res, 403, 'agent_client_required');
    const tokenScopes = Array.isArray(payload.scope) ? payload.scope : [];
    try {
      const delegation = await OwnedAssetService.resolveAgentDelegation(normalizePn(payload.pnIdentifier));
      if (!delegation) return res.json({ active: false, scopes: [] });
      const scopes = (delegation.scopes as AiScope[]).filter((s) => tokenScopes.includes(s));
      return res.json({ active: true, scopes });
    } catch (e) {
      safeLogger.warn('[agent] delegation status failed', {
        err: e instanceof Error ? e.message : 'unknown'
      });
      return deny(res, 503, 'delegation_unavailable');
    }
  });

  app.get('/api/agent/delegation', requireAgentDelegation(), (req: AgentRequest, res: Response) => {
    const agent = req.agent!;
    return res.json({ delegation: projectDelegation(agent.statement, agent.scopes) });
  });

  /** Answers only from the owner-signed attestations; never opens Drive or a proof. */
  app.get(
    '/api/agent/proofs/:dataPointId',
    requireAgentDelegation(AI_SCOPES.proofs),
    (req: AgentRequest, res: Response) => {
      const id = String(req.params.dataPointId || '');
      if (!isAttestableDataPointId(id)) return res.status(400).json({ error: 'invalid_request' });
      const attestation = req.agent!.attestations.find((a) => a.dataPointId === id);
      if (!attestation) return res.status(404).json({ error: 'not_attested' });
      if (attestation.expiresAt && Date.parse(attestation.expiresAt) <= Date.now()) {
        return res.status(410).json({ error: 'expired' });
      }
      return res.json(projectAttestation(attestation));
    }
  );

  /** The owner's published ML-KEM key, so the agent can seal a draft. Never the owner's pN. */
  app.get(
    '/api/agent/owner-key',
    requireAgentDelegation(AI_SCOPES.penDrafts),
    async (req: AgentRequest, res: Response) => {
      try {
        const key = await getOwnerMlKemPublicKey(req.agent!.rootPnIdentifier);
        if (!key) return res.status(404).json({ error: 'owner_key_missing' });
        return res.json({ mlKemPublicKey: key });
      } catch (e) {
        safeLogger.warn('[agent] owner key failed', { err: e instanceof Error ? e.message : 'unknown' });
        return res.status(500).json({ error: 'owner_key_failed' });
      }
    }
  );

  /** Accepts only `{draftId, envelope}` sealed to the owner; Pen opens it, the owner decides. */
  app.post(
    '/api/agent/pen/drafts',
    requireAgentDelegation(AI_SCOPES.penDrafts),
    async (req: AgentRequest, res: Response) => {
      const submission = parsePenAgentDraftSubmission(req.body);
      if (!submission) return res.status(400).json({ error: 'sealed_draft_required' });
      if (penAgentDraftSubmissionBytes(submission) > PEN_AGENT_DRAFT_MAX_BYTES) {
        return res.status(413).json({ error: 'draft_too_large' });
      }
      const agent = req.agent!;
      try {
        const result = await submitAgentPenDraft({
          agentPnIdentifier: agent.agentPnIdentifier,
          rootPnIdentifier: agent.rootPnIdentifier,
          submission
        });
        if (!result.ok) {
          safeLogger.info('[agent] draft refused', {
            agentHash: hashIdentifier(agent.agentPnIdentifier),
            reason: result.reason
          });
          return res
            .status(result.reason === 'draft_rate_limited' ? 429 : 409)
            .json({ error: result.reason });
        }
        return res
          .status(result.created ? 201 : 200)
          .json({ draftId: submission.draftId, status: 'awaiting_owner' });
      } catch (e) {
        safeLogger.warn('[agent] draft enqueue failed', { err: e instanceof Error ? e.message : 'unknown' });
        return res.status(500).json({ error: 'draft_failed' });
      }
    }
  );

  app.get(
    '/api/agent/files/search',
    requireAgentDelegation(AI_SCOPES.filesPublished),
    async (req: AgentRequest, res: Response) => {
      try {
        const root = req.agent!.rootPnIdentifier;
        const q = String(req.query.q || '').trim().slice(0, 200);
        const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, SEARCH_LIMIT_MAX);
        const service = await metadataService();
        const result = await service.searchMetadata(q, { authorDid: root, limit, offset: 0 });
        const files = result.files
          .filter((entry) => normalizePn(String(entry.pnIdentifier || '')) === root)
          .filter((entry) => isPublished(entry.metadata as unknown as Meta))
          .map((entry) => projectFileSummary(entry.fileId, entry.metadata as unknown as Meta));
        return res.json({ files });
      } catch (e) {
        safeLogger.warn('[agent] search failed', { err: e instanceof Error ? e.message : 'unknown' });
        return res.status(500).json({ error: 'search_failed' });
      }
    }
  );

  app.get(
    '/api/agent/files/:fileId',
    requireAgentDelegation(AI_SCOPES.filesPublished),
    async (req: AgentRequest, res: Response) => {
      try {
        const root = req.agent!.rootPnIdentifier;
        const service = await metadataService();
        const entry = await service.getFileMetadata(String(req.params.fileId || ''));
        const meta = entry?.metadata as unknown as Meta | undefined;
        if (!entry || !meta || normalizePn(String(entry.pnIdentifier || '')) !== root || !isPublished(meta)) {
          return res.status(404).json({ error: 'not_found' });
        }
        return res.json({ file: projectFile(entry.fileId, meta) });
      } catch (e) {
        safeLogger.warn('[agent] read file failed', { err: e instanceof Error ? e.message : 'unknown' });
        return res.status(500).json({ error: 'read_failed' });
      }
    }
  );

  /** Pen docs live on the owner's device cloud; the published post row is the public copy. */
  app.get(
    '/api/agent/pen/:docId',
    requireAgentDelegation(AI_SCOPES.penPublished),
    async (req: AgentRequest, res: Response) => {
      try {
        const root = req.agent!.rootPnIdentifier;
        const docId = String(req.params.docId || '').trim();
        if (!docId) return res.status(400).json({ error: 'invalid_request' });
        const service = await metadataService();
        const result = await service.searchMetadata('', {
          authorDid: root,
          limit: PEN_SCAN_LIMIT,
          offset: 0
        });
        const entry = result.files.find((e) => {
          const meta = e.metadata as unknown as Meta;
          return (
            str(meta.penDocId) === docId &&
            normalizePn(String(e.pnIdentifier || '')) === root &&
            isPublished(meta)
          );
        });
        if (!entry) return res.status(404).json({ error: 'not_found' });
        return res.json({ document: projectPenDocument(entry.fileId, entry.metadata as unknown as Meta) });
      } catch (e) {
        safeLogger.warn('[agent] read pen failed', { err: e instanceof Error ? e.message : 'unknown' });
        return res.status(500).json({ error: 'read_failed' });
      }
    }
  );
}
