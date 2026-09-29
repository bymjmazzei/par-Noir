/**
 * Flattened download. Action layers stay out of the file — they only work in the browser.
 */

import { partitionLayersForCompose, type PenSectionContent } from '@par-noir/pen-protocol';

export function actionLayerIds(sections: PenSectionContent[]): string[] {
  const ids: string[] = [];
  for (const section of sections) {
    for (const layer of partitionLayersForCompose(section.layers).action) ids.push(layer.id);
  }
  return ids;
}

/** Hide action layers inside a page root. Returns a restore function. */
export function hideActionLayers(root: HTMLElement, ids: string[]): () => void {
  const want = new Set(ids);
  const touched: Array<{ el: HTMLElement; display: string }> = [];
  root.querySelectorAll<HTMLElement>('[data-layer-id]').forEach((el) => {
    const id = el.getAttribute('data-layer-id') || '';
    if (!want.has(id)) return;
    touched.push({ el, display: el.style.display });
    el.style.display = 'none';
  });
  return () => {
    for (const item of touched) item.el.style.display = item.display;
  };
}

export function saveDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadBasename(title: string): string {
  const cleaned = title.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'pen';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('download_read_failed'));
    reader.readAsDataURL(blob);
  });
}

function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => reject(new Error('download_image_failed'));
    img.src = dataUrl;
  });
}

/** One PDF page per flattened PNG, in order. */
export async function pngBlobsToPdf(pages: Blob[]): Promise<Blob> {
  if (!pages.length) throw new Error('download_empty');
  const { jsPDF } = await import('jspdf');
  const pxToMm = (px: number) => (px * 25.4) / 96;
  let pdf: InstanceType<typeof jsPDF> | null = null;
  for (const page of pages) {
    const dataUrl = await blobToDataUrl(page);
    const size = await imageSize(dataUrl);
    const w = pxToMm(size.w);
    const h = pxToMm(size.h);
    const orientation = w >= h ? 'landscape' : 'portrait';
    if (!pdf) {
      pdf = new jsPDF({ orientation, unit: 'mm', format: [w, h] });
    } else {
      pdf.addPage([w, h], orientation);
    }
    pdf.addImage(dataUrl, 'PNG', 0, 0, w, h);
  }
  return pdf!.output('blob');
}
