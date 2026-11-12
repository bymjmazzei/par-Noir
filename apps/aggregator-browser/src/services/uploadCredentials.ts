/**
 * Uploads that carry Content Credentials (Photoshop, a camera, Pen) keep them in the feed:
 * the original bytes are stored unchanged, and each feed rendition is re-signed as a
 * `parentOf` derivative of the original, so the server can verify credit from the preview.
 */

import { maxBytesForVariant, type EncodedPreview } from '@par-noir/aggregator-domain';
import { PARNOIR_RENDITION_GENERATOR } from '@par-noir/pn-provenance';
import {
  c2paLoader,
  credentialOr,
  hasManifest,
  signDerivative,
  type ApiRequest,
  type C2paWeb
} from '@par-noir/pn-provenance/web';
import { ownerFetch } from './ownerApiFetch';

const RENDITION_VERSION = '1.0.0';

const loadC2pa = c2paLoader(async () => (await import('@contentauth/c2pa-web/resources/c2pa.wasm?url')).default);

export type CredentialRendition = (encoded: EncodedPreview) => Promise<EncodedPreview>;

/** Re-signs renditions of `file` when it has a manifest; null when there's nothing to carry over. */
export async function renditionCredentials(
  file: Blob,
  title: string,
  deps: { web?: () => Promise<C2paWeb>; request?: ApiRequest } = {}
): Promise<CredentialRendition | null> {
  const web = await (deps.web ?? loadC2pa)().catch(() => null);
  if (!web || !(await hasManifest(web, file))) return null;
  const request: ApiRequest = deps.request ?? ((method, path, body) => ownerFetch(method, path, body));
  return async (encoded) => {
    const action = encoded.variant === 'poster' && file.type.startsWith('image/') ? 'c2pa.resized' : 'c2pa.transcoded';
    const blob = await credentialOr(
      encoded.blob,
      () =>
        signDerivative({
          web,
          request,
          blob: encoded.blob,
          parent: file,
          title,
          action,
          generator: PARNOIR_RENDITION_GENERATOR,
          version: RENDITION_VERSION
        }),
      maxBytesForVariant(encoded.variant)
    );
    return blob === encoded.blob ? encoded : { ...encoded, blob, byteSize: blob.size };
  };
}
