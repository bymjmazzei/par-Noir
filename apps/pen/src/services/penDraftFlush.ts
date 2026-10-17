import type { PenPagePresentation, PenSectionContent } from '@par-noir/pen-protocol';
import type { LocalDocBundle } from './penLocalStore';
import { saveLocalDocAsync } from './penLocalStore';
import { ensureDocScopedMedia } from './penDocMedia';
import type { PenSession } from './penSession';

/** Await draft cloud + doc-scoped media upload before feed publish. */
export async function flushDraftForPublish(params: {
  session: PenSession;
  bundle: LocalDocBundle;
}): Promise<LocalDocBundle> {
  let bundle = params.bundle;
  const media = await ensureDocScopedMedia({
    session: params.session,
    docId: bundle.manifest.docId,
    sections: bundle.sections,
    pagePresentation: bundle.manifest.pagePresentation
  });
  if (media.rewritten) {
    bundle = {
      ...bundle,
      sections: media.sections,
      manifest: {
        ...bundle.manifest,
        ...(media.pagePresentation ? { pagePresentation: media.pagePresentation } : {})
      }
    };
    await saveLocalDocAsync(params.session.pnIdentifier, bundle);
  }
  return bundle;
}
