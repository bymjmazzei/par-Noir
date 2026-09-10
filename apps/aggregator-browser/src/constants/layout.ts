import { MESSAGING_ONLY } from '../config/buildFlags';

/** Matches fixed BottomNav height (4rem + safe area). Messaging silo has no bottom nav. */
export const BOTTOM_NAV_PADDING = MESSAGING_ONLY
  ? 'env(safe-area-inset-bottom, 0px)'
  : 'calc(4rem + env(safe-area-inset-bottom, 0px))';
