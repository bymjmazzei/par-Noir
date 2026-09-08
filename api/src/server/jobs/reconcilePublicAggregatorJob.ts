/**
 * Scheduled job: public cache ↔ cloud SoT (OAuth-less envelope probe) plus
 * secondary Sheets id sync when credentials allow.
 */
import { reconcilePublicAggregator, type ReconcilePublicAggregatorResult } from '../modules/aggregatorReconcileService';

export async function runReconcilePublicAggregator(): Promise<ReconcilePublicAggregatorResult> {
  return reconcilePublicAggregator();
}
