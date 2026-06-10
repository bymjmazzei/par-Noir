import type { PreferenceInteraction } from '../preferencesSheetsService';
import { portableTableAppend, portableTableScan } from './portableTableService';
import { PREFERENCES_INTERACTIONS_SCHEMA } from './tableSchemas';

export async function appendPreferenceInteractionPortable(
  pnIdentifier: string,
  interaction: PreferenceInteraction,
  accountId?: string
): Promise<void> {
  await portableTableAppend(
    pnIdentifier,
    PREFERENCES_INTERACTIONS_SCHEMA,
    interaction as unknown as Record<string, unknown>,
    accountId
  );
}

export async function getPreferenceInteractionsPortable(
  pnIdentifier: string,
  options?: { limit?: number; offset?: number },
  accountId?: string
): Promise<PreferenceInteraction[]> {
  const rows = await portableTableScan<PreferenceInteraction>(
    pnIdentifier,
    PREFERENCES_INTERACTIONS_SCHEMA,
    accountId
  );
  const sorted = rows.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? sorted.length;
  return sorted.slice(offset, offset + limit);
}
