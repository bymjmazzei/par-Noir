/**
 * Domain services should use resolveSocialCloudContext + openTable (or portableTable*).
 * Google Sheets remain only behind DelegateTableAdapter hooks in sheetsTableBridge.
 *
 * Collapse progress: indexes, devices, ZKP, notifications, ledgers, groups, requests,
 * social graph, inbox already have portable/facade paths. Companion + platform registry
 * use dedicated facades (CompanionMetadataService, PlatformRegistryStorage).
 */
export { resolveSocialCloudContext, openTable } from './storageFacade';
export {
  portableTableAppend,
  portableTableGetByKey,
  portableTableScan,
  portableTableDelete,
  portableTableReplaceAll
} from './portableTableService';
