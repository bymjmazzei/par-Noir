/**
 * Unlock's side of the local agent socket. Every request re-proves itself before anything is
 * read: a signed agent token, an active delegation that still grants the scope, and an agent
 * this Mac added. Only then is the owner asked, once per agent per hour.
 */

import {
  AGENT_CUSTODY_PROTOCOL_VERSION,
  AGENT_CUSTODY_TOOL_SCOPES,
  AI_SCOPES,
  isAgentCustodyRequestId,
  parseAgentCustodyRequest,
  type AgentCustodyErrorCode,
  type AgentCustodyResponse,
} from '@par-noir/standard-data-points';
import { verifyAgentAccessToken, type AgentJwksSource } from './agentToken';
import { AgentCustodySessions } from './custodySessions';
import { fetchAgentDelegationStatus } from './delegationStatus';
import { AgentCustodyError, custodyErrorCode } from './errors';
import { openOwnerCustody, ownerDriveToken, wipeOwnerCustody, type OwnerCustody, type OwnerVaultEntry } from './ownerCustody';
import { findAgentOnThisMac, resolveAgentOwner } from './ownerMapping';
import { readPrivateFileText, readPrivatePenText, searchPrivate, type PrivateReadContext } from './privateReads';

type VaultListing = { identityId: string; publicKey: string; nickname?: string };
type VaultEntry = OwnerVaultEntry & { nickname?: string; ownerIdentityId?: string };

export type AgentCustodyBridgeDeps = {
  apiEndpoint: string;
  jwks: AgentJwksSource;
  /** Non-secret vault listing; read before any prompt. */
  listVaultIdentities: () => Promise<VaultListing[]>;
  /** Touch ID with this reason, then every sealed entry. Null or a throw means the owner said no. */
  unlockVaultEntries: (reason: string) => Promise<VaultEntry[] | null>;
  fetchImpl?: typeof fetch;
  openOwner?: (owner: OwnerVaultEntry) => Promise<OwnerCustody>;
  driveToken?: (custody: OwnerCustody) => Promise<string>;
  reads?: {
    search: typeof searchPrivate;
    readFile: typeof readPrivateFileText;
    readPen: typeof readPrivatePenText;
  };
  sessions?: AgentCustodySessions<OwnerCustody>;
  now?: () => number;
};

export type AgentCustodyBridge = {
  handle: (raw: unknown) => Promise<AgentCustodyResponse>;
  /** One JSON request line in, one JSON response line out (no trailing newline). */
  handleLine: (line: string) => Promise<string>;
  /** Unlock is quitting or locking: drop every approved hour now. */
  wipeAll: () => void;
};

export function agentApprovalPrompt(label: string): string {
  return `Allow AI agent ${label} to read your private files for 1 hour?`;
}

function fail(id: string, error: AgentCustodyErrorCode): AgentCustodyResponse {
  return { v: AGENT_CUSTODY_PROTOCOL_VERSION, id, ok: false, error };
}

export function createAgentCustodyBridge(deps: AgentCustodyBridgeDeps): AgentCustodyBridge {
  const apiEndpoint = deps.apiEndpoint.replace(/\/$/, '');
  const now = deps.now ?? Date.now;
  const sessions = deps.sessions ?? new AgentCustodySessions<OwnerCustody>({ wipe: wipeOwnerCustody, now });
  const openOwner = deps.openOwner ?? ((owner) => openOwnerCustody({ apiEndpoint, owner }));
  const driveToken = deps.driveToken ?? ((custody) => ownerDriveToken(custody, apiEndpoint));
  const reads = deps.reads ?? { search: searchPrivate, readFile: readPrivateFileText, readPen: readPrivatePenText };

  const handle = async (raw: unknown): Promise<AgentCustodyResponse> => {
    const req = parseAgentCustodyRequest(raw);
    if (!req) {
      const rawId = raw && typeof raw === 'object' ? (raw as { id?: unknown }).id : undefined;
      return fail(isAgentCustodyRequestId(rawId) ? rawId : '0', 'invalid_request');
    }
    try {
      const claims = await verifyAgentAccessToken(req.token, deps.jwks, now());
      const agentPn = claims.agentPnIdentifier;
      const toolScopes = AGENT_CUSTODY_TOOL_SCOPES[req.tool];
      const tokenScopes = toolScopes.filter((s) => claims.scopes.includes(s));
      if (tokenScopes.length === 0) throw new AgentCustodyError('insufficient_scope');

      const status = await fetchAgentDelegationStatus({
        apiEndpoint,
        agentToken: req.token,
        fetchImpl: deps.fetchImpl,
      });
      if (!status.active) {
        sessions.end(agentPn);
        throw new AgentCustodyError('access_revoked');
      }
      const granted = tokenScopes.filter((s) => status.scopes.includes(s));
      if (granted.length === 0) throw new AgentCustodyError('insufficient_scope');

      const { label } = findAgentOnThisMac(await deps.listVaultIdentities(), agentPn);
      const custody = await sessions.acquire(agentPn, async () => {
        let entries: VaultEntry[] | null = null;
        try {
          entries = await deps.unlockVaultEntries(agentApprovalPrompt(label));
        } catch {
          entries = null;
        }
        if (!entries) throw new AgentCustodyError('owner_declined');
        return openOwner(resolveAgentOwner(entries, agentPn));
      });

      const ctx: PrivateReadContext = { accessToken: await driveToken(custody), custody };
      let result: unknown;
      if (req.tool === 'search_private_files') {
        result = await reads.search(ctx, {
          query: req.args.query,
          files: granted.includes(AI_SCOPES.filesPrivate),
          pen: granted.includes(AI_SCOPES.penPrivate),
        });
      } else if (req.tool === 'read_private_file') {
        result = await reads.readFile(ctx, req.args.fileId);
      } else {
        result = await reads.readPen(ctx, req.args.docId);
      }
      return { v: AGENT_CUSTODY_PROTOCOL_VERSION, id: req.id, ok: true, result };
    } catch (err) {
      return fail(req.id, custodyErrorCode(err));
    }
  };

  return {
    handle,
    handleLine: async (line) => {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(line);
      } catch {
        parsed = null;
      }
      return JSON.stringify(await handle(parsed));
    },
    wipeAll: () => sessions.wipeAll(),
  };
}
