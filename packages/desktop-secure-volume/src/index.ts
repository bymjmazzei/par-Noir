export type { SecureVolumeConfig, VolumeDriver } from './VolumeDriver';
export { SecureVolumeManager, electronAppDirectory, type SecureVolumeManagerInit } from './SecureVolumeManager';
export { TokenStorageService } from './TokenStorageService';
export { KeychainService } from './KeychainService';
export { DarwinVolumeDriver } from './DarwinVolumeDriver';
export { VeraCryptDriver, spawnAsync } from './VeraCryptDriver';
export { VeraCryptDarwinDriver } from './VeraCryptDarwinDriver';
export { VeraCryptLinuxDriver } from './VeraCryptLinuxDriver';
export { VeraCryptWindowsDriver } from './VeraCryptWindowsDriver';
export { UnsupportedVolumeDriver } from './UnsupportedVolumeDriver';
export {
  defaultApplicationSupportRoot,
  PN_DESKTOP_DATA_DIR_NAME,
  resolvePnDesktopDataRoot
} from './dataRoot';
export {
  PEN_TREE_DIR,
  penTreeRoot,
  penDocDir,
  penDraftPath,
  penMetaPath,
  penMediaDir,
  penMediaPath,
  isPathUnderPenTree
} from './penTree';
