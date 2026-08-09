/**
 * PDF upload service: processPDFPagesParallel and helpers.
 * Extracted from FileStorageAggregator; used by uploadProcessor.
 */

import { getEncryptionService, EncryptedFilePackage } from './encryptionService';
import { API_ENDPOINT } from '../config/api';
import { getOwnerApiHeaders } from './ownerApiHeaders';
import { slimPublicTokenJson, type PublicShareGenerationResult } from '@par-noir/aggregator-domain';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

async function uploadFile(
  base64Data: string,
  fileName: string,
  accountId: string,
  _accessToken: string
): Promise<{ id: string }> {
  const response = await fetch(`${API_ENDPOINT}/api/drive/files`, {
    method: 'POST',
    headers: getOwnerApiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      fileData: base64Data,
      fileName,
      mimeType: 'application/json',
      accountId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Upload failed: ${errorText}`);
  }

  const result = await response.json();
  const uploadedFile = result.file;

  if (!uploadedFile || !uploadedFile.id) {
    throw new Error('Upload succeeded but no file ID returned');
  }

  return { id: uploadedFile.id };
}

async function createMetadataForThumbnail(
  fileId: string,
  fileName: string,
  _shareToken: PublicShareGenerationResult | undefined,
  accountId: string,
  _accessToken: string
): Promise<void> {
  // PDF page thumbs start private; make-public materializes envelope + slim token.
  await fetch(`${API_ENDPOINT}/api/aggregator/metadata-index/${fileId}?accountId=${accountId}`, {
    method: 'PUT',
    headers: getOwnerApiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      name: `thumb_${fileName}`,
      fileType: 'image',
      isPublic: false,
    }),
  });
}

export interface ProcessPDFPagesParallelParams {
  pdfFile: File;
  accountId: string;
  session: { did: string };
  publicKey: string;
  accessToken: string;
}

export async function processPDFPagesParallel(params: ProcessPDFPagesParallelParams): Promise<{
  thumbnailFileIds: string[];
  thumbnailTokens: Record<string, string>;
}> {
  const { pdfFile, accountId, session, publicKey, accessToken } = params;
  const { workerManager } = await import('./workerManager');
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const arrayBuffer = await pdfFile.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const baseFileName = pdfFile.name.replace(/\.pdf$/i, '');

  console.log(`[PDF Upload] Processing ${numPages} pages in parallel...`);

  // Step 1: Load all pages in parallel
  const pagePromises = Array.from({ length: numPages }, (_, i) => pdf.getPage(i + 1));
  const pages = await Promise.all(pagePromises);

  // Step 2: Generate all thumbnails in parallel (canvas rendering)
  const thumbnailBlobPromises = pages.map(async (page, index) => {
    const pageNum = index + 1;
    const viewport = page.getViewport({ scale: 1.0 });
    const scale = Math.min(800 / viewport.width, 800 / viewport.height, 1.0);
    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error(`Failed to get canvas context for page ${pageNum}`);
    }

    await page.render({ canvas, canvasContext: ctx, viewport: scaledViewport }).promise;

    const thumbnailBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Failed to create blob'))), 'image/jpeg', 0.85);
    });

    return { pageNum, thumbnailBlob, fileName: `${baseFileName}-page-${pageNum}.png` };
  });

  const thumbnailData = await Promise.all(thumbnailBlobPromises);

  // Step 3: Encrypt all thumbnails in parallel using workers
  const encryptedThumbnailPromises = thumbnailData.map(async ({ thumbnailBlob, fileName }) => {
    const thumbnailArrayBuffer = await thumbnailBlob.arrayBuffer();
    const thumbData = new Uint8Array(thumbnailArrayBuffer);
    const encrypted = await workerManager.encrypt(thumbData, session.did, publicKey);

    return {
      fileName,
      encrypted,
      thumbnailBlob,
    };
  });

  const encryptedThumbnails = await Promise.all(encryptedThumbnailPromises);

  // Step 4: Create share tokens for all thumbnails in parallel
  const encryptionService = getEncryptionService();
  const thumbnailPackagePromises = encryptedThumbnails.map(async ({ fileName, encrypted, thumbnailBlob }) => {
    const thumbnailPackage: EncryptedFilePackage = {
      encrypted: encrypted.encrypted,
      iv: encrypted.iv,
      salt: encrypted.salt,
      metadata: {
        originalName: `thumb_${fileName}`,
        originalSize: thumbnailBlob.size,
        originalMimeType: 'image/jpeg',
      },
    };

    let shareToken: PublicShareGenerationResult | undefined = undefined;
    try {
      shareToken = await encryptionService.generateShareToken(thumbnailPackage, {
        id: session.did,
        publicKey: publicKey,
      });
    } catch (err) {
      console.warn(`[PDF Upload] Failed to generate share token for ${fileName}:`, err);
    }

    return { fileName, thumbnailPackage, shareToken };
  });

  const thumbnailPackages = await Promise.all(thumbnailPackagePromises);

  // Step 5: Upload all thumbnails in parallel
  const thumbnailUploadPromises = thumbnailPackages.map(async ({ fileName, thumbnailPackage, shareToken }) => {
    const thumbnailBase64 = await blobToBase64(
      new Blob([JSON.stringify(thumbnailPackage)], { type: 'application/json' })
    );
    const thumbnailFileName = `thumb_${fileName}.encrypted`;
    const result = await uploadFile(thumbnailBase64, thumbnailFileName, accountId, accessToken);
    return { fileName, fileId: result?.id, shareToken };
  });

  const thumbnailUploadResults = await Promise.all(thumbnailUploadPromises);

  // Step 6: Create metadata for all thumbnails in parallel
  const metadataPromises = thumbnailUploadResults
    .filter((result) => result.fileId)
    .map(async ({ fileName, fileId, shareToken }) => {
      try {
        await createMetadataForThumbnail(fileId!, fileName, shareToken, accountId, accessToken);
      } catch (err) {
        console.warn(`[PDF Upload] Failed to create metadata for ${fileName}:`, err);
      }
      return { fileName, fileId, shareToken };
    });

  await Promise.all(metadataPromises);

  // Build results — slim tokens only (no envelope / shareEncrypted)
  const thumbnailFileIds: string[] = [];
  const thumbnailTokens: Record<string, string> = {};

  thumbnailUploadResults.forEach(({ fileId, shareToken }) => {
    if (fileId) {
      thumbnailFileIds.push(fileId);
      if (shareToken) {
        thumbnailTokens[fileId] = slimPublicTokenJson(shareToken.token);
      }
    }
  });

  console.log(`[PDF Upload] Completed processing ${numPages} pages in parallel`);
  return { thumbnailFileIds, thumbnailTokens };
}
