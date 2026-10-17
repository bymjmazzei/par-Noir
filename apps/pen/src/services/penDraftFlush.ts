import { collectLocalMediaRefs } from '@par-noir/pen-media';
import type { LocalDocBundle } from './penLocalStore';

/**
 * Publish needs every media ref on Drive. Attach uploads before a layer exists, so a
 * device-only (`penlocal:`) ref here means the media never reached Drive.
 */
export function assertDocMediaOnDrive(bundle: LocalDocBundle): void {
  const left = collectLocalMediaRefs(bundle.sections, bundle.manifest.pagePresentation);
  if (left.length) throw new Error('media_not_uploaded');
}
