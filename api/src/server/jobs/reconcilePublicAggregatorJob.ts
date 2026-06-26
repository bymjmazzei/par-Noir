/**
 * Scheduled job: align aggregator DB with each owner's public-file-index.
 */
import { reconcilePublicAggregator, type ReconcilePublicAggregatorResult } from '../modules/aggregatorReconcileService';

export async function runReconcilePublicAggregator(): Promise<ReconcilePublicAggregatorResult> {
  return reconcilePublicAggregator();
}
