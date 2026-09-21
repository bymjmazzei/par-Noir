/**
 * L5 Pen client — silo CRUD helpers + templates + compile/publish Note.
 * Multi-writer collab is first-party only (not exposed here).
 */

import {
  listStarterTemplates,
  compileDocumentToNote,
  verifyChain,
  type PenDocManifest,
  type PenHistoryChain,
  type PenSectionContent,
  type CompileToNoteResult
} from '@par-noir/pen-protocol';
import {
  integratorAuthHeaders,
  normalizeApiEndpoint,
  parseJsonResponse,
  throwIfNotOk
} from './integrator/pnApiClient';
import type { IntegratorApiContext, IntegratorClientConfig } from './integrator/types';
import { IntegratorStorageClient } from './IntegratorStorageClient';
import { IntegratorPublishClient, type PublicMetadataSubmission } from './IntegratorPublishClient';

function toBase64(text: string): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(text, 'utf8').toString('base64');
  return btoa(unescape(encodeURIComponent(text)));
}

export class IntegratorPenClient {
  private apiEndpoint: string;
  readonly storage: IntegratorStorageClient;
  readonly publish: IntegratorPublishClient;

  constructor(config: IntegratorClientConfig = {}) {
    this.apiEndpoint = normalizeApiEndpoint(config.apiEndpoint);
    this.storage = new IntegratorStorageClient(config);
    this.publish = new IntegratorPublishClient(config);
  }

  listTemplatesLocal() {
    return listStarterTemplates();
  }

  async listTemplates(ctx: IntegratorApiContext | string) {
    const res = await fetch(`${this.apiEndpoint}/api/pen/templates`, {
      headers: integratorAuthHeaders(ctx)
    });
    // L5 may 403 if first-party only — fall back to packaged templates
    if (!res.ok) return { templates: listStarterTemplates(), source: 'packaged' as const };
    const data = await parseJsonResponse<{ templates: unknown[] }>(res);
    return { templates: data.templates || listStarterTemplates(), source: 'api' as const };
  }

  compileToNote(input: {
    templateId: string;
    title: string;
    sections: PenSectionContent[];
  }): CompileToNoteResult {
    return compileDocumentToNote(input);
  }

  verifyHistory(chain: PenHistoryChain) {
    return verifyChain(chain);
  }

  /** Silo-relative path helpers for integrators mirroring par-noir-pen layout. */
  siloDocPrefix(docId: string): string {
    return `par-noir-pen/${docId}`;
  }

  async writeManifestJson(
    ctx: IntegratorApiContext,
    docId: string,
    manifest: PenDocManifest
  ): Promise<void> {
    const name = `${this.siloDocPrefix(docId)}/doc.json`;
    await this.storage.uploadFile(ctx, {
      fileDataBase64: toBase64(JSON.stringify(manifest, null, 2)),
      fileName: name,
      mimeType: 'application/json',
      encrypt: true
    });
  }

  async writeSectionJson(
    ctx: IntegratorApiContext,
    docId: string,
    sectionSlug: string,
    section: PenSectionContent
  ): Promise<void> {
    const name = `${this.siloDocPrefix(docId)}/${sectionSlug}.json`;
    await this.storage.uploadFile(ctx, {
      fileDataBase64: toBase64(JSON.stringify(section, null, 2)),
      fileName: name,
      mimeType: 'application/json',
      encrypt: true
    });
  }

  async publishCompiledNote(
    ctx: IntegratorApiContext,
    metadata: PublicMetadataSubmission
  ): Promise<void> {
    const withClass: PublicMetadataSubmission = {
      ...metadata,
      contentClass: 'note'
    };
    await this.publish.submitMetadataIndex(ctx, withClass);
  }
}

export function createIntegratorPenClient(config?: IntegratorClientConfig): IntegratorPenClient {
  return new IntegratorPenClient(config);
}
