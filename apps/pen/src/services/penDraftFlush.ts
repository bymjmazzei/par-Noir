import { awaitDocMedia } from '@par-noir/pen-media';
import type { LocalDocBundle } from './penLocalStore';
import { saveLocalDocAsync } from './penLocalStore';
import type { PenSession } from './penSession';

/** Publish waits for doc media to reach Drive so feed refs are penmedia:, not device-only. */
export async function flushDraftForPublish(params: {
  session: PenSession;
  bundle: LocalDocBundle;
}): Promise<LocalDocBundle> {
  const bundle = params.bundle;
  const media = await awaitDocMedia({
    pnIdentifier: params.session.pnIdentifier,
    docId: bundle.manifest.docId,
    sections: bundle.sections,
    pagePresentation: bundle.manifest.pagePresentation
  });
  if (
    media.sections === bundle.sections &&
    media.pagePresentation === bundle.manifest.pagePresentation
  ) {
    return bundle;
  }
  const next: LocalDocBundle = {
    ...bundle,
    sections: media.sections,
    manifest: {
      ...bundle.manifest,
      ...(media.pagePresentation ? { pagePresentation: media.pagePresentation } : {})
    }
  };
  await saveLocalDocAsync(params.session.pnIdentifier, next);
  return next;
}
