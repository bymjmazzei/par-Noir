import type { DataPointRequestRow } from '../dataPointRequestSheetsService';
import type { StoredMessageRequestRow } from '../messageRequestSheetsService';
import {
  portableTableAppend,
  portableTableGetByKey,
  portableTableScan
} from './portableTableService';
import { DATA_POINT_REQUESTS_SCHEMA, MESSAGE_REQUESTS_SCHEMA } from './tableSchemas';

export const PORTABLE_MESSAGE_REQUESTS_SHEET = 'pn-portable-message-requests';
export const PORTABLE_DATA_POINT_REQUESTS_SHEET = 'pn-portable-data-point-requests';

export async function listMessageRequestsPortable(
  pnIdentifier: string,
  accountId?: string
): Promise<StoredMessageRequestRow[]> {
  return portableTableScan<StoredMessageRequestRow>(pnIdentifier, MESSAGE_REQUESTS_SCHEMA, accountId);
}

export async function appendMessageRequestPortable(
  pnIdentifier: string,
  row: StoredMessageRequestRow,
  accountId?: string
): Promise<void> {
  await portableTableAppend(
    pnIdentifier,
    MESSAGE_REQUESTS_SCHEMA,
    row as unknown as Record<string, unknown>,
    accountId
  );
}

export async function setMessageRequestStatusPortable(
  pnIdentifier: string,
  requestId: string,
  status: StoredMessageRequestRow['status'],
  accountId?: string
): Promise<void> {
  const existing = await portableTableGetByKey<StoredMessageRequestRow>(
    pnIdentifier,
    MESSAGE_REQUESTS_SCHEMA,
    requestId,
    accountId
  );
  if (!existing) throw new Error('Message request not found');
  await portableTableAppend(
    pnIdentifier,
    MESSAGE_REQUESTS_SCHEMA,
    { ...existing, status } as unknown as Record<string, unknown>,
    accountId
  );
}

export async function listDataPointRequestsPortable(
  pnIdentifier: string,
  accountId?: string
): Promise<DataPointRequestRow[]> {
  return portableTableScan<DataPointRequestRow>(pnIdentifier, DATA_POINT_REQUESTS_SCHEMA, accountId);
}

export async function appendDataPointRequestPortable(
  pnIdentifier: string,
  row: DataPointRequestRow,
  accountId?: string
): Promise<void> {
  await portableTableAppend(
    pnIdentifier,
    DATA_POINT_REQUESTS_SCHEMA,
    row as unknown as Record<string, unknown>,
    accountId
  );
}

export async function updateDataPointRequestStatusPortable(
  pnIdentifier: string,
  requestId: string,
  status: DataPointRequestRow['status'],
  respondedAt: string,
  accountId?: string
): Promise<void> {
  const existing = await portableTableGetByKey<DataPointRequestRow>(
    pnIdentifier,
    DATA_POINT_REQUESTS_SCHEMA,
    requestId,
    accountId
  );
  if (!existing) throw new Error('Data point request not found');
  await portableTableAppend(
    pnIdentifier,
    DATA_POINT_REQUESTS_SCHEMA,
    { ...existing, status, respondedAt } as unknown as Record<string, unknown>,
    accountId
  );
}
