/**
 * L5 data-point requests: an integrator asks, the owner approves or declines.
 * Integrators poll the status, so the API owns the request rows in Postgres.
 */

import crypto from 'crypto';
import { getDatabasePool } from '../utils/database';

export type DataPointRequestStatus = 'pending' | 'approved' | 'declined';

export interface DataPointRequestRow {
  requestId: string;
  clientId: string;
  toolName: string;
  /** Comma-separated data point ids. */
  dataPoints: string;
  reason: string;
  status: DataPointRequestStatus;
  createdAt: string;
  respondedAt?: string;
}

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

let tableReady: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = getDatabasePool()
      .query(`
        CREATE TABLE IF NOT EXISTS data_point_requests (
          request_id VARCHAR(64) PRIMARY KEY,
          pn_identifier VARCHAR(255) NOT NULL,
          client_id VARCHAR(255) NOT NULL,
          tool_name TEXT NOT NULL,
          data_points TEXT NOT NULL,
          reason TEXT NOT NULL DEFAULT '',
          status VARCHAR(16) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          responded_at TIMESTAMP WITH TIME ZONE
        )
      `)
      .then(() =>
        getDatabasePool().query(
          'CREATE INDEX IF NOT EXISTS idx_data_point_requests_pn ON data_point_requests(pn_identifier, status)'
        )
      )
      .then(() => undefined)
      .catch((error) => {
        tableReady = null;
        throw error;
      });
  }
  return tableReady;
}

function toRow(r: Record<string, unknown>): DataPointRequestRow {
  return {
    requestId: String(r.request_id),
    clientId: String(r.client_id),
    toolName: String(r.tool_name),
    dataPoints: String(r.data_points),
    reason: String(r.reason || ''),
    status: r.status as DataPointRequestStatus,
    createdAt: new Date(r.created_at as string).toISOString(),
    respondedAt: r.responded_at ? new Date(r.responded_at as string).toISOString() : undefined,
  };
}

export async function createDataPointRequest(params: {
  pnIdentifier: string;
  clientId: string;
  toolName: string;
  dataPoints: string[];
  reason: string;
}): Promise<DataPointRequestRow> {
  await ensureTable();
  const requestId = `dpr_${crypto.randomBytes(12).toString('hex')}`;
  const result = await getDatabasePool().query(
    `INSERT INTO data_point_requests (request_id, pn_identifier, client_id, tool_name, data_points, reason, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING *`,
    [
      requestId,
      normalizePn(params.pnIdentifier),
      params.clientId,
      params.toolName,
      params.dataPoints.join(','),
      params.reason,
    ]
  );
  return toRow(result.rows[0]);
}

export async function getDataPointRequest(
  pnIdentifier: string,
  requestId: string
): Promise<DataPointRequestRow | null> {
  await ensureTable();
  const result = await getDatabasePool().query(
    'SELECT * FROM data_point_requests WHERE pn_identifier = $1 AND request_id = $2',
    [normalizePn(pnIdentifier), requestId]
  );
  return result.rows[0] ? toRow(result.rows[0]) : null;
}

export async function listDataPointRequests(
  pnIdentifier: string,
  status?: DataPointRequestStatus
): Promise<DataPointRequestRow[]> {
  await ensureTable();
  const result = await getDatabasePool().query(
    `SELECT * FROM data_point_requests
       WHERE pn_identifier = $1 AND ($2::text IS NULL OR status = $2)
       ORDER BY created_at DESC`,
    [normalizePn(pnIdentifier), status ?? null]
  );
  return result.rows.map(toRow);
}

/** Returns the updated row, or null when the request is missing or already answered. */
export async function respondToDataPointRequest(
  pnIdentifier: string,
  requestId: string,
  status: Exclude<DataPointRequestStatus, 'pending'>
): Promise<DataPointRequestRow | null> {
  await ensureTable();
  const result = await getDatabasePool().query(
    `UPDATE data_point_requests SET status = $3, responded_at = NOW()
       WHERE pn_identifier = $1 AND request_id = $2 AND status = 'pending'
       RETURNING *`,
    [normalizePn(pnIdentifier), requestId, status]
  );
  return result.rows[0] ? toRow(result.rows[0]) : null;
}
