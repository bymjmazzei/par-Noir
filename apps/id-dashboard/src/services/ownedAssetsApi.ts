/**
 * Owned-asset registry on the device sheet. The API stores the sheet id only.
 */

import {
  ensureDeviceOwnedAssetsSheet,
  listDeviceAssetDelegations,
  listDeviceOwnedAssets,
  setSessionDriveIndex,
  upsertDeviceAssetDelegation,
  upsertDeviceOwnedAsset,
  type DeviceAssetDelegation,
  type DeviceOwnedAsset,
} from '@par-noir/device-cloud-credentials';
import {
  AGENT_MCP_CLIENT_ID,
  parseAgentDelegationStatement,
  type AgentDelegationDraft,
  type AgentDelegationStatement,
} from '@par-noir/standard-data-points';
import { ownerFetch } from './ownerApiService';
import { sessionDriveFor } from './sessionDrive';
import { isDriveLayoutInitActive } from './storage/driveLayoutInitGate';

export interface OwnedAssetDto {
  id: string;
  rootPnIdentifier: string;
  subjectPnIdentifier: string | null;
  kind: string;
  status: string;
  metadata: Record<string, unknown>;
  apiKeyId: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

function pnKey(pnIdentifier: string): string {
  return pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
}

async function ownedAssetsWorkbook(
  apiToken: string,
  pnIdentifier: string
): Promise<{ accessToken: string; spreadsheetId: string }> {
  const key = pnKey(pnIdentifier);
  const drive = await sessionDriveFor(key, apiToken);
  let spreadsheetId = drive.index.sheetIds['owned-assets'];
  if (!spreadsheetId) {
    spreadsheetId = await ensureDeviceOwnedAssetsSheet(
      drive.accessToken,
      drive.index.metadataFolderId
    );
    const next = {
      ...drive.index,
      sheetIds: { ...drive.index.sheetIds, 'owned-assets': spreadsheetId },
    };
    setSessionDriveIndex(key, next);
    await ownerFetch(
      apiToken,
      'POST',
      `/api/storage/initialize/${encodeURIComponent(key)}`,
      { pnDriveIndex: next },
      { pnIdentifier: key }
    );
  }
  return { accessToken: drive.accessToken, spreadsheetId };
}

const ownedAssetsInFlight = new Map<string, Promise<OwnedAssetDto[]>>();

export async function fetchOwnedAssets(
  accessToken: string,
  pnIdentifier: string,
  opts?: { force?: boolean }
): Promise<OwnedAssetDto[]> {
  const key = pnKey(pnIdentifier);
  if (!opts?.force && isDriveLayoutInitActive()) return [];

  const existing = ownedAssetsInFlight.get(key);
  if (existing && !opts?.force) return existing;

  const run = (async (): Promise<OwnedAssetDto[]> => {
    if (!opts?.force && isDriveLayoutInitActive()) return [];
    const book = await ownedAssetsWorkbook(accessToken, key);
    return listDeviceOwnedAssets(book.accessToken, book.spreadsheetId);
  })();

  ownedAssetsInFlight.set(key, run);
  try {
    return await run;
  } catch {
    return [];
  } finally {
    if (ownedAssetsInFlight.get(key) === run) ownedAssetsInFlight.delete(key);
  }
}

export async function createOwnedAsset(
  accessToken: string,
  pnIdentifier: string,
  body: {
    kind: string;
    subjectPnIdentifier?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<OwnedAssetDto> {
  const key = pnKey(pnIdentifier);
  const book = await ownedAssetsWorkbook(accessToken, key);
  const now = new Date().toISOString();
  const asset: DeviceOwnedAsset = {
    id: crypto.randomUUID(),
    rootPnIdentifier: key,
    subjectPnIdentifier: body.subjectPnIdentifier ?? null,
    kind: body.kind,
    status: 'active',
    metadata: body.metadata ?? {},
    apiKeyId: null,
    createdAt: now,
    updatedAt: now,
    revokedAt: null,
  };
  await upsertDeviceOwnedAsset(book.accessToken, book.spreadsheetId, asset);
  return asset;
}

export async function rekeyOwnedAsset(
  accessToken: string,
  pnIdentifier: string,
  id: string,
  body: {
    newSubjectPnIdentifier: string;
    newSubjectPublicKey?: string;
    reason?: string;
    migrateDelegations?: boolean;
  }
): Promise<OwnedAssetDto> {
  const book = await ownedAssetsWorkbook(accessToken, pnIdentifier);
  const assets = await listDeviceOwnedAssets(book.accessToken, book.spreadsheetId);
  const current = assets.find((asset) => asset.id === id);
  if (!current) throw new Error('owned asset not found');
  const next: DeviceOwnedAsset = {
    ...current,
    subjectPnIdentifier: body.newSubjectPnIdentifier,
    updatedAt: new Date().toISOString(),
  };
  await upsertDeviceOwnedAsset(book.accessToken, book.spreadsheetId, next);
  return next;
}

export async function revokeOwnedAsset(
  accessToken: string,
  pnIdentifier: string,
  id: string
): Promise<void> {
  const book = await ownedAssetsWorkbook(accessToken, pnIdentifier);
  const assets = await listDeviceOwnedAssets(book.accessToken, book.spreadsheetId);
  const current = assets.find((asset) => asset.id === id);
  if (!current) return;
  const now = new Date().toISOString();
  await upsertDeviceOwnedAsset(book.accessToken, book.spreadsheetId, {
    ...current,
    status: 'revoked',
    revokedAt: now,
    updatedAt: now,
  });
}

export async function auditSubExport(
  _accessToken: string,
  _pnIdentifier: string,
  _assetId: string
): Promise<void> {
  /* Audit rows stay on the device sheet with the asset. No API Drive open. */
}

export async function fetchDelegations(
  accessToken: string,
  pnIdentifier: string,
  assetId: string
) {
  const book = await ownedAssetsWorkbook(accessToken, pnIdentifier);
  const rows = await listDeviceAssetDelegations(book.accessToken, book.spreadsheetId);
  return {
    delegations: rows
      .filter((row) => row.ownedAssetId === assetId)
      .map((row) => ({
        id: row.id,
        delegateePnIdentifier: row.delegateePnIdentifier,
        delegateeClientId: row.delegateeClientId,
        scope: row.scope,
        expiresAt: row.expiresAt,
        status: row.status,
        createdAt: row.createdAt,
      })),
  };
}

export async function createDelegation(
  accessToken: string,
  pnIdentifier: string,
  assetId: string,
  body: {
    delegateePnIdentifier?: string;
    delegateeClientId?: string;
    scope?: string;
    expiresAt?: string | null;
  }
): Promise<string> {
  const book = await ownedAssetsWorkbook(accessToken, pnIdentifier);
  const now = new Date().toISOString();
  const row: DeviceAssetDelegation = {
    id: crypto.randomUUID(),
    ownedAssetId: assetId,
    delegateePnIdentifier: body.delegateePnIdentifier ?? null,
    delegateeClientId: body.delegateeClientId ?? null,
    scope: body.scope || '*',
    expiresAt: body.expiresAt ?? null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  await upsertDeviceAssetDelegation(book.accessToken, book.spreadsheetId, row);
  return row.id;
}

export interface AiAgentDto {
  id: string;
  subjectPnIdentifier: string;
  label: string;
  scopes: string[];
  createdAt: string;
}

async function agentApi(
  accessToken: string,
  pnIdentifier: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<Record<string, unknown>> {
  const res = await ownerFetch(accessToken, method, `/api/owned-assets/agents${path}`, body, {
    pnIdentifier: pnKey(pnIdentifier),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = new Error(
      typeof json.error_description === 'string' ? json.error_description : 'AI agent request failed'
    );
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return json;
}

export interface SignedAgentFromShell {
  agentPnIdentifier: string;
  agentPublicKey: string;
  statement: AgentDelegationStatement;
  signature: string;
}

/**
 * Unlock's op=agent result: the owner who approved, the new agent's public ids, and the
 * delegation the owner signed. The statement must answer the draft this tab sent.
 */
export function agentFromShellSession(
  session: { op: string; did: string; result?: Record<string, string> },
  ownerDid: string | undefined,
  draft: AgentDelegationDraft | null
): SignedAgentFromShell {
  if (session.op !== 'agent') throw new Error('Unlock returned a different action');
  if (!ownerDid || session.did !== ownerDid) throw new Error('Unlock did not match this pN.');
  const agentPnIdentifier = session.result?.agentPnIdentifier || '';
  const agentPublicKey = session.result?.agentPublicKey || '';
  if (!agentPnIdentifier || !agentPublicKey) throw new Error('Unlock did not return the new AI agent');
  let raw: unknown = null;
  try {
    raw = JSON.parse(session.result?.statement || 'null');
  } catch {
    raw = null;
  }
  const statement = parseAgentDelegationStatement(raw);
  const signature = session.result?.signature || '';
  if (!statement || !signature) throw new Error('Unlock did not sign the AI agent delegation');
  if (
    !draft ||
    statement.nonce !== draft.nonce ||
    statement.agentPnIdentifier !== agentPnIdentifier ||
    statement.agentPublicKey !== agentPublicKey
  ) {
    throw new Error('Unlock signed a different AI agent delegation');
  }
  return { agentPnIdentifier, agentPublicKey, statement, signature };
}

/** AI agents the API currently honors for this root. */
export async function fetchAiAgents(accessToken: string, pnIdentifier: string): Promise<AiAgentDto[]> {
  const json = await agentApi(accessToken, pnIdentifier, 'GET', '');
  return Array.isArray(json.agents) ? (json.agents as AiAgentDto[]) : [];
}

/**
 * Sheet row first (the owner always sees what exists), then the API authz cache,
 * then one sheet delegation per scope with the ids the API issued.
 */
export async function registerAiAgent(
  accessToken: string,
  pnIdentifier: string,
  body: { label: string } & SignedAgentFromShell
): Promise<OwnedAssetDto> {
  const scopes = [...body.statement.scopes];
  const asset = await createOwnedAsset(accessToken, pnIdentifier, {
    kind: 'ai_agent',
    subjectPnIdentifier: body.agentPnIdentifier,
    metadata: { label: body.label, scopes },
  });
  let json: Record<string, unknown>;
  try {
    json = await agentApi(accessToken, pnIdentifier, 'POST', '', {
      assetId: asset.id,
      subjectPnIdentifier: body.agentPnIdentifier,
      subjectPublicKey: body.agentPublicKey,
      label: body.label,
      scopes,
      expiresAt: body.statement.expiresAt,
      statement: body.statement,
      signature: body.signature,
    });
  } catch (e) {
    await revokeOwnedAsset(accessToken, pnIdentifier, asset.id).catch(() => undefined);
    throw e;
  }
  const agent = json.agent as { delegations?: Array<{ id: string; scope: string }> } | undefined;
  const book = await ownedAssetsWorkbook(accessToken, pnIdentifier);
  const now = new Date().toISOString();
  for (const d of agent?.delegations ?? []) {
    await upsertDeviceAssetDelegation(book.accessToken, book.spreadsheetId, {
      id: d.id,
      ownedAssetId: asset.id,
      delegateePnIdentifier: null,
      delegateeClientId: AGENT_MCP_CLIENT_ID,
      scope: d.scope,
      expiresAt: null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  }
  return asset;
}

async function revokeSheetAgents(
  accessToken: string,
  pnIdentifier: string,
  match: (asset: DeviceOwnedAsset) => boolean
): Promise<void> {
  const book = await ownedAssetsWorkbook(accessToken, pnIdentifier);
  const now = new Date().toISOString();
  const assets = (await listDeviceOwnedAssets(book.accessToken, book.spreadsheetId)).filter(
    (a) => a.kind === 'ai_agent' && a.status === 'active' && match(a)
  );
  const ids = new Set(assets.map((a) => a.id));
  for (const a of assets) {
    await upsertDeviceOwnedAsset(book.accessToken, book.spreadsheetId, {
      ...a,
      status: 'revoked',
      revokedAt: now,
      updatedAt: now,
    });
  }
  const dels = await listDeviceAssetDelegations(book.accessToken, book.spreadsheetId);
  for (const d of dels.filter((row) => ids.has(row.ownedAssetId) && row.status === 'active')) {
    await upsertDeviceAssetDelegation(book.accessToken, book.spreadsheetId, {
      ...d,
      status: 'revoked',
      updatedAt: now,
    });
  }
}

export interface AiAgentRevokeResult {
  revoked: number;
  /** False when access is cut but the Drive list could not be updated. */
  sheetSynced: boolean;
}

async function syncSheetAfterRevoke(
  accessToken: string,
  pnIdentifier: string,
  match: (asset: DeviceOwnedAsset) => boolean
): Promise<boolean> {
  try {
    await revokeSheetAgents(accessToken, pnIdentifier, match);
    return true;
  } catch {
    return false;
  }
}

/** API first so access stops immediately; a missing API row still revokes the sheet. */
export async function revokeAiAgent(
  accessToken: string,
  pnIdentifier: string,
  assetId: string
): Promise<AiAgentRevokeResult> {
  let revoked = 1;
  try {
    await agentApi(accessToken, pnIdentifier, 'POST', `/${encodeURIComponent(assetId)}/revoke`);
  } catch (e) {
    if ((e as { status?: number }).status !== 404) throw e;
    revoked = 0;
  }
  const sheetSynced = await syncSheetAfterRevoke(accessToken, pnIdentifier, (a) => a.id === assetId);
  return { revoked, sheetSynced };
}

export async function revokeAllAiAgents(accessToken: string, pnIdentifier: string): Promise<AiAgentRevokeResult> {
  const json = await agentApi(accessToken, pnIdentifier, 'POST', '/revoke-all');
  const sheetSynced = await syncSheetAfterRevoke(accessToken, pnIdentifier, () => true);
  return { revoked: typeof json.revoked === 'number' ? json.revoked : 0, sheetSynced };
}

export async function revokeDelegation(
  accessToken: string,
  pnIdentifier: string,
  delegationId: string
): Promise<void> {
  const book = await ownedAssetsWorkbook(accessToken, pnIdentifier);
  const rows = await listDeviceAssetDelegations(book.accessToken, book.spreadsheetId);
  const current = rows.find((row) => row.id === delegationId);
  if (!current) return;
  await upsertDeviceAssetDelegation(book.accessToken, book.spreadsheetId, {
    ...current,
    status: 'revoked',
    updatedAt: new Date().toISOString(),
  });
}
