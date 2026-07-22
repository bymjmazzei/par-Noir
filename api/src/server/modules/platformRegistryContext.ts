/**
 * Resolve operator pN storage context for platform registry.
 * Prefer platformRegistryStorage.requirePlatformRegistryContext for new code.
 */

export {
  getPlatformRegistryContext as getPlatformRegistryDriveContext,
  requirePlatformRegistryContext as requirePlatformRegistryDriveContext,
  PlatformRegistryNotConfiguredError
} from './platformRegistryStorage';
