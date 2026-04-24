/**
 * Track registry rows for licensed library music (API persistence only).
 */

import type { Pool } from 'pg';
import { getDatabasePool } from '../utils/database';

export type MusicTrackStatus = 'draft' | 'active' | 'retired';

export interface MusicRegistryTrackRow {
  id: string;
  ownerPnIdentifier: string;
  title: string;
  displayArtist: string | null;
  isrc: string | null;
  status: MusicTrackStatus;
  splitsMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function rowToTrack(r: Record<string, unknown>): MusicRegistryTrackRow {
  const splits = r.splits_metadata;
  return {
    id: String(r.id),
    ownerPnIdentifier: String(r.owner_pn_identifier),
    title: String(r.title),
    displayArtist: r.display_artist != null ? String(r.display_artist) : null,
    isrc: r.isrc != null ? String(r.isrc) : null,
    status: String(r.status) as MusicTrackStatus,
    splitsMetadata:
      splits && typeof splits === 'object' && !Array.isArray(splits)
        ? (splits as Record<string, unknown>)
        : {},
    createdAt: new Date(r.created_at as string).toISOString(),
    updatedAt: new Date(r.updated_at as string).toISOString()
  };
}

function normalizeSplits(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

export class MusicTrackRegistryService {
  static pool(): Pool {
    return getDatabasePool();
  }

  /** Active tracks for attach UI (any authenticated client; titles only). */
  static async listActiveCatalog(opts?: {
    limit?: number;
    q?: string;
  }): Promise<Array<{ id: string; title: string; displayArtist: string | null }>> {
    const limit = Math.min(Math.max(opts?.limit ?? 80, 1), 200);
    const rawQ = opts?.q?.trim().slice(0, 80) ?? '';
    const q = rawQ.replace(/[%_\\]/g, '');
    const pool = this.pool();
    if (q.length > 0) {
      const pattern = `%${q}%`;
      const res = await pool.query(
        `SELECT id, title, display_artist FROM music_registry_tracks
         WHERE status = 'active'
           AND (title ILIKE $1 OR COALESCE(display_artist, '') ILIKE $1 OR COALESCE(isrc, '') ILIKE $1)
         ORDER BY updated_at DESC
         LIMIT $2`,
        [pattern, limit]
      );
      return res.rows.map((r) => ({
        id: String(r.id),
        title: String(r.title),
        displayArtist: r.display_artist != null ? String(r.display_artist) : null
      }));
    }
    const res = await pool.query(
      `SELECT id, title, display_artist FROM music_registry_tracks
       WHERE status = 'active'
       ORDER BY updated_at DESC
       LIMIT $1`,
      [limit]
    );
    return res.rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      displayArtist: r.display_artist != null ? String(r.display_artist) : null
    }));
  }

  static async listByOwner(
    ownerPn: string,
    opts?: { status?: MusicTrackStatus; limit?: number; offset?: number }
  ): Promise<MusicRegistryTrackRow[]> {
    const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
    const offset = Math.max(opts?.offset ?? 0, 0);
    const status = opts?.status;
    const pool = this.pool();
    if (status) {
      const res = await pool.query(
        `SELECT * FROM music_registry_tracks
         WHERE owner_pn_identifier = $1 AND status = $2
         ORDER BY updated_at DESC
         LIMIT $3 OFFSET $4`,
        [ownerPn, status, limit, offset]
      );
      return res.rows.map(rowToTrack);
    }
    const res = await pool.query(
      `SELECT * FROM music_registry_tracks
       WHERE owner_pn_identifier = $1
       ORDER BY updated_at DESC
       LIMIT $2 OFFSET $3`,
      [ownerPn, limit, offset]
    );
    return res.rows.map(rowToTrack);
  }

  static async create(
    ownerPn: string,
    input: {
      title: string;
      displayArtist?: string | null;
      isrc?: string | null;
      status?: MusicTrackStatus;
      splitsMetadata?: unknown;
    }
  ): Promise<MusicRegistryTrackRow> {
    const title = input.title.trim();
    if (!title) {
      throw new Error('title_required');
    }
    const status = input.status ?? 'draft';
    if (!['draft', 'active', 'retired'].includes(status)) {
      throw new Error('invalid_status');
    }
    const splits = normalizeSplits(input.splitsMetadata);
    const res = await this.pool().query(
      `INSERT INTO music_registry_tracks
       (owner_pn_identifier, title, display_artist, isrc, status, splits_metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING *`,
      [
        ownerPn,
        title,
        input.displayArtist?.trim() || null,
        input.isrc?.trim() || null,
        status,
        JSON.stringify(splits)
      ]
    );
    return rowToTrack(res.rows[0]);
  }

  static async getByIdForOwner(
    trackId: string,
    ownerPn: string
  ): Promise<MusicRegistryTrackRow | null> {
    const res = await this.pool().query(
      `SELECT * FROM music_registry_tracks WHERE id = $1::uuid AND owner_pn_identifier = $2`,
      [trackId, ownerPn]
    );
    if (res.rows.length === 0) return null;
    return rowToTrack(res.rows[0]);
  }

  static async update(
    trackId: string,
    ownerPn: string,
    patch: {
      title?: string;
      displayArtist?: string | null;
      isrc?: string | null;
      status?: MusicTrackStatus;
      splitsMetadata?: unknown;
    }
  ): Promise<MusicRegistryTrackRow | null> {
    const existing = await this.getByIdForOwner(trackId, ownerPn);
    if (!existing) return null;

    const title =
      patch.title !== undefined ? patch.title.trim() : existing.title;
    if (!title) {
      throw new Error('title_required');
    }
    const displayArtist =
      patch.displayArtist !== undefined
        ? patch.displayArtist?.trim() || null
        : existing.displayArtist;
    const isrc =
      patch.isrc !== undefined ? patch.isrc?.trim() || null : existing.isrc;
    let status = patch.status !== undefined ? patch.status : existing.status;
    if (!['draft', 'active', 'retired'].includes(status)) {
      throw new Error('invalid_status');
    }
    const splitsMetadata =
      patch.splitsMetadata !== undefined
        ? normalizeSplits(patch.splitsMetadata)
        : existing.splitsMetadata;

    const res = await this.pool().query(
      `UPDATE music_registry_tracks SET
         title = $3,
         display_artist = $4,
         isrc = $5,
         status = $6,
         splits_metadata = $7::jsonb,
         updated_at = NOW()
       WHERE id = $1::uuid AND owner_pn_identifier = $2
       RETURNING *`,
      [
        trackId,
        ownerPn,
        title,
        displayArtist,
        isrc,
        status,
        JSON.stringify(splitsMetadata)
      ]
    );
    if (res.rows.length === 0) return null;
    return rowToTrack(res.rows[0]);
  }

  static async getActiveTrackById(trackId: string): Promise<MusicRegistryTrackRow | null> {
    const res = await this.pool().query(
      `SELECT * FROM music_registry_tracks WHERE id = $1::uuid AND status = 'active'`,
      [trackId]
    );
    if (res.rows.length === 0) return null;
    return rowToTrack(res.rows[0]);
  }

  /**
   * Links a public aggregator post (file_id) to an active registry track for fund / royalty attribution.
   * Caller must own the post (aggregator row pn_identifier matches claimant).
   */
  static async attachPublicPostToTrack(
    claimantPn: string,
    postFileId: string,
    registryTrackId: string
  ): Promise<{ postFileId: string; registryTrackId: string }> {
    const fileId = postFileId.trim();
    if (!fileId) {
      throw new Error('post_file_id_required');
    }
    const track = await this.getActiveTrackById(registryTrackId);
    if (!track) {
      throw new Error('track_not_found_or_inactive');
    }
    const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
    const agg = AggregatorMetadataServiceDB.getInstance();
    const meta = await agg.getFileMetadata(fileId);
    const owner = meta?.pnIdentifier?.trim();
    if (!owner || owner !== claimantPn.trim()) {
      throw new Error('not_post_owner');
    }
    await this.pool().query(
      `INSERT INTO music_registry_post_uses (post_file_id, registry_track_id, claimant_pn_identifier, updated_at)
       VALUES ($1, $2::uuid, $3, NOW())
       ON CONFLICT (post_file_id) DO UPDATE SET
         registry_track_id = EXCLUDED.registry_track_id,
         claimant_pn_identifier = EXCLUDED.claimant_pn_identifier,
         updated_at = NOW()`,
      [fileId, registryTrackId, claimantPn.trim()]
    );
    return { postFileId: fileId, registryTrackId };
  }

  static async getPostUseForOwner(
    claimantPn: string,
    postFileId: string
  ): Promise<{ registryTrackId: string } | null> {
    const fileId = postFileId.trim();
    if (!fileId) return null;
    const res = await this.pool().query(
      `SELECT registry_track_id FROM music_registry_post_uses
       WHERE post_file_id = $1 AND claimant_pn_identifier = $2`,
      [fileId, claimantPn.trim()]
    );
    if (res.rows.length === 0) return null;
    return { registryTrackId: String(res.rows[0].registry_track_id) };
  }

  static async detachPostFromRegistry(claimantPn: string, postFileId: string): Promise<boolean> {
    const fileId = postFileId.trim();
    if (!fileId) throw new Error('post_file_id_required');
    const res = await this.pool().query(
      `DELETE FROM music_registry_post_uses WHERE post_file_id = $1 AND claimant_pn_identifier = $2`,
      [fileId, claimantPn.trim()]
    );
    return (res.rowCount ?? 0) > 0;
  }
}
