/**
 * App-provided hooks. The package never imports from apps/pen; Pen wires these at startup.
 */

export type PenMediaConfig = {
  /** Doc key for decrypting downloads; null when this device has not joined the doc. */
  loadDocKey: (docId: string) => string | null;
  /** Doc key for encrypting uploads (mints one if the doc has none yet). */
  mintDocKey: (docId: string) => string;
  /** Drive folder id for a doc's encrypted media. */
  resolveUploadFolder: (pnIdentifier: string, docId: string) => Promise<string>;
};

let config: PenMediaConfig | null = null;

export function configurePenMedia(next: PenMediaConfig): void {
  config = next;
}

export function penMediaConfig(): PenMediaConfig {
  if (!config) throw new Error('pen_media_not_configured');
  return config;
}
