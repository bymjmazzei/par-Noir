/** GIPHY search stays on the server. A hit is an image layer with the CDN URL. */

import {
  patchLayerStyle,
  placeWidgetLayer,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { ownerGet } from './penOwnerFetch';

export type GiphyStickerHit = {
  id: string;
  title: string;
  url: string;
};

export async function searchGiphyStickers(query: string): Promise<GiphyStickerHit[]> {
  const q = query.trim();
  const res = await ownerGet(`/api/pen/stickers/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error('giphy_unavailable');
  const body = (await res.json()) as { results?: GiphyStickerHit[] };
  return (body.results || []).filter(
    (hit) => typeof hit.url === 'string' && hit.url.startsWith('https://')
  );
}

export function placeGiphySticker(
  section: PenSectionContent,
  hit: GiphyStickerHit
): { section: PenSectionContent; layerId: string } {
  const placed = placeWidgetLayer(section, null, 'image');
  const title = hit.title.trim() || 'Sticker';
  return {
    layerId: placed.layerId,
    section: patchLayerStyle(placed.section, placed.layerId, {
      name: title,
      imageSrc: hit.url
    })
  };
}
