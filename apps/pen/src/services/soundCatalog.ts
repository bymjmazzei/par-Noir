/** Licensed catalog tracks land on an image or video layer's audio lane. */

import { patchLayerStyle, type PenPageLayer, type PenSectionContent } from '@par-noir/pen-protocol';
import { ownerGet } from './penOwnerFetch';

export type CatalogTrack = {
  id: string;
  title: string;
  displayArtist: string | null;
};

export function layerHoldsSound(layer: PenPageLayer | undefined): boolean {
  return layer?.kind === 'image' || layer?.kind === 'video';
}

export function soundHostLayer(
  section: PenSectionContent,
  activeLayerId: string | null
): PenPageLayer | null {
  const layers = section.layers || [];
  const active = layers.find((layer) => layer.id === activeLayerId);
  if (layerHoldsSound(active)) return active || null;
  return layers.find((layer) => layerHoldsSound(layer)) || null;
}

export async function fetchMusicCatalog(query?: string): Promise<CatalogTrack[]> {
  const q = query?.trim();
  const path = q
    ? `/api/v1/music/registry/catalog?q=${encodeURIComponent(q)}`
    : '/api/v1/music/registry/catalog';
  const res = await ownerGet(path);
  if (!res.ok) throw new Error('catalog_unavailable');
  const body = (await res.json()) as { tracks?: CatalogTrack[] };
  return (body.tracks || []).filter((track) => typeof track.id === 'string' && track.id);
}

/** Sets the media layer's audio lane to the chosen registry track. */
export function attachCatalogTrack(
  section: PenSectionContent,
  layerId: string,
  track: { id: string }
): PenSectionContent {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  if (!layerHoldsSound(layer)) return section;
  return patchLayerStyle(section, layerId, {
    audioTracks: [{ id: track.id, licensedDocId: track.id }]
  });
}
