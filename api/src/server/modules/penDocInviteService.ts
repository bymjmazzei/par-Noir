import { randomUUID } from 'crypto';
import { getDatabasePool } from '../utils/database';
import { enqueueSocialJob } from './socialRail';
import { normalizePnIdentifier } from './deviceCapabilityService';

export type PenDocInviteRole = 'collaborator' | 'commentor' | 'viewer';

export interface PenDocInviteRow {
  inviteId: string;
  docId: string;
  groupId: string;
  ownerPn: string;
  title: string;
  role: PenDocInviteRole;
  createdAt: string;
  expiresAt: string;
  claimedBy: string | null;
  claimedAt: string | null;
}

const DEFAULT_EXPIRY_DAYS = 14;

export function penAppJoinOrigin(): string {
  const raw = (process.env.PEN_APP_ORIGIN || 'https://pen.parnoir.com').trim();
  return raw.replace(/\/$/, '');
}

export function buildPenDocJoinUrl(docId: string, inviteId: string): string {
  return `${penAppJoinOrigin()}/d/${encodeURIComponent(docId)}/join?invite=${encodeURIComponent(inviteId)}`;
}

export async function ensurePenDocInvitesTable(): Promise<void> {
  const db = getDatabasePool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS pen_doc_invites (
      invite_id VARCHAR(64) PRIMARY KEY,
      doc_id VARCHAR(255) NOT NULL,
      group_id VARCHAR(255) NOT NULL,
      owner_pn VARCHAR(255) NOT NULL,
      title VARCHAR(512) NOT NULL DEFAULT '',
      role VARCHAR(32) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      claimed_by VARCHAR(255),
      claimed_at TIMESTAMP WITH TIME ZONE
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_pen_doc_invites_doc
    ON pen_doc_invites (doc_id, owner_pn)
  `);
}

function mapRow(row: Record<string, unknown>): PenDocInviteRow {
  return {
    inviteId: String(row.invite_id),
    docId: String(row.doc_id),
    groupId: String(row.group_id),
    ownerPn: String(row.owner_pn),
    title: String(row.title || ''),
    role: String(row.role) as PenDocInviteRole,
    createdAt: new Date(String(row.created_at)).toISOString(),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    claimedBy: row.claimed_by ? String(row.claimed_by) : null,
    claimedAt: row.claimed_at ? new Date(String(row.claimed_at)).toISOString() : null
  };
}

export async function createPenDocInvite(params: {
  ownerPn: string;
  docId: string;
  groupId: string;
  title?: string;
  role: PenDocInviteRole;
  expiresInDays?: number;
}): Promise<{ inviteId: string; joinUrl: string; expiresAt: string }> {
  await ensurePenDocInvitesTable();
  const ownerPn = normalizePnIdentifier(params.ownerPn);
  const inviteId = randomUUID().replace(/-/g, '');
  const days = Math.min(Math.max(params.expiresInDays ?? DEFAULT_EXPIRY_DAYS, 1), 90);
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  const db = getDatabasePool();
  await db.query(
    `INSERT INTO pen_doc_invites (invite_id, doc_id, group_id, owner_pn, title, role, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      inviteId,
      params.docId.trim(),
      params.groupId.trim(),
      ownerPn,
      String(params.title || '').slice(0, 512),
      params.role,
      expiresAt
    ]
  );
  return {
    inviteId,
    joinUrl: buildPenDocJoinUrl(params.docId.trim(), inviteId),
    expiresAt
  };
}

export async function getPenDocInvitePublic(inviteId: string): Promise<PenDocInviteRow | null> {
  await ensurePenDocInvitesTable();
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT invite_id, doc_id, group_id, owner_pn, title, role, created_at, expires_at, claimed_by, claimed_at
     FROM pen_doc_invites
     WHERE invite_id = $1`,
    [inviteId.trim()]
  );
  if (!result.rows[0]) return null;
  const row = mapRow(result.rows[0]);
  if (new Date(row.expiresAt).getTime() <= Date.now()) return null;
  return row;
}

export async function claimPenDocInvite(params: {
  inviteId: string;
  inviteePn: string;
  inviteeMlKemPublicKey: string;
}): Promise<{ delivered: boolean; docId: string; role: PenDocInviteRole; title: string }> {
  await ensurePenDocInvitesTable();
  const inviteId = params.inviteId.trim();
  const inviteePn = normalizePnIdentifier(params.inviteePn);
  const inviteeMlKemPublicKey = params.inviteeMlKemPublicKey.trim();
  if (!inviteeMlKemPublicKey) {
    throw new Error('messaging_keys_required');
  }

  const db = getDatabasePool();
  const result = await db.query(
    `SELECT invite_id, doc_id, group_id, owner_pn, title, role, created_at, expires_at, claimed_by, claimed_at
     FROM pen_doc_invites
     WHERE invite_id = $1
     FOR UPDATE`,
    [inviteId]
  );
  if (!result.rows[0]) {
    throw new Error('invite_not_found');
  }
  const invite = mapRow(result.rows[0]);
  if (new Date(invite.expiresAt).getTime() <= Date.now()) {
    throw new Error('invite_expired');
  }
  if (invite.claimedBy && invite.claimedBy !== inviteePn) {
    throw new Error('invite_already_claimed');
  }
  if (normalizePnIdentifier(invite.ownerPn) === inviteePn) {
    throw new Error('cannot_claim_own_doc');
  }

  if (!invite.claimedBy) {
    await db.query(
      `UPDATE pen_doc_invites SET claimed_by = $2, claimed_at = NOW() WHERE invite_id = $1`,
      [inviteId, inviteePn]
    );
  }

  const envelopeContext = `pen.doc_invite_claim:${inviteId}:${inviteePn}`;
  const delivered = await enqueueSocialJob({
    jobType: 'pen.doc_invite_claim',
    peerPn: invite.ownerPn,
    requestId: envelopeContext,
    envelopeContext,
    sealed: {
      inviteId,
      docId: invite.docId,
      groupId: invite.groupId,
      role: invite.role,
      title: invite.title,
      inviteePn,
      inviteeMlKemPublicKey
    }
  });

  return {
    delivered,
    docId: invite.docId,
    role: invite.role,
    title: invite.title
  };
}
