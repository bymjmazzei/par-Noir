/**
 * AI agent Pen drafts. An agent proposes a PenAgentBuild sealed to the owner's published
 * ML-KEM key; it rides the mailbox as ciphertext only and becomes a doc only when the
 * owner accepts it in Pen. Sealing and opening live with the callers (dm-crypto); this
 * module is the crypto-free contract every side agrees on.
 */

import { materializePenAgentBuild, type PenAgentBuild } from './agent.js';
import { docToPlainText } from './richDoc.js';
import { getTemplate } from './templates.js';

export const PEN_AGENT_DRAFT_KIND = 'pen_agent_draft';
export const PEN_AGENT_DRAFT_TTL_HOURS = 7 * 24;
export const PEN_AGENT_DRAFT_MAX_BYTES = 256 * 1024;
export const PEN_AGENT_DRAFTS_PER_DAY = 20;

const CONTEXT_PREFIX = 'pen-agent-draft:';
const DRAFT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const EXCERPT_MAX_CHARS = 600;

export interface PenAgentDraftEnvelope {
  kemCiphertext: string;
  ciphertext: string;
}

/** The only body an agent may post: its own draft id and ciphertext. */
export interface PenAgentDraftSubmission {
  draftId: string;
  envelope: PenAgentDraftEnvelope;
}

export interface PenAgentDraftPreview {
  title: string;
  templateId: string;
  templateTitle: string;
  excerpt: string;
}

export function isPenAgentDraftId(value: unknown): value is string {
  return typeof value === 'string' && DRAFT_ID_RE.test(value);
}

/** Binds the ciphertext to one draft, so an envelope lifted onto another draft does not open. */
export function penAgentDraftContextId(draftId: string): string {
  if (!isPenAgentDraftId(draftId)) throw new Error('invalid_draft_id');
  return `${CONTEXT_PREFIX}${draftId}`;
}

export function draftIdFromContextId(contextId: unknown): string | null {
  if (typeof contextId !== 'string' || !contextId.startsWith(CONTEXT_PREFIX)) return null;
  const draftId = contextId.slice(CONTEXT_PREFIX.length);
  return isPenAgentDraftId(draftId) ? draftId : null;
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((k) => own.includes(k));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Anything that is not exactly `{draftId, envelope: {kemCiphertext, ciphertext}}` is refused. */
export function parsePenAgentDraftSubmission(body: unknown): PenAgentDraftSubmission | null {
  if (!exactKeys(body, ['draftId', 'envelope'])) return null;
  if (!isPenAgentDraftId(body.draftId)) return null;
  const envelope = body.envelope;
  if (!exactKeys(envelope, ['kemCiphertext', 'ciphertext'])) return null;
  if (!nonEmptyString(envelope.kemCiphertext) || !nonEmptyString(envelope.ciphertext)) return null;
  return {
    draftId: body.draftId,
    envelope: { kemCiphertext: envelope.kemCiphertext, ciphertext: envelope.ciphertext }
  };
}

export function penAgentDraftSubmissionBytes(submission: PenAgentDraftSubmission): number {
  return new TextEncoder().encode(JSON.stringify(submission)).length;
}

/** What the owner sees before accepting. Throws `pen_agent_build_invalid:` for a bad build. */
export function previewPenAgentBuild(build: PenAgentBuild): PenAgentDraftPreview {
  const { sections } = materializePenAgentBuild(build);
  const text = sections
    .map((section) => docToPlainText(section.doc).trim())
    .filter(Boolean)
    .join('\n\n');
  return {
    title: build.title.trim(),
    templateId: build.templateId,
    templateTitle: getTemplate(build.templateId)?.title || build.templateId,
    excerpt: text.length > EXCERPT_MAX_CHARS ? `${text.slice(0, EXCERPT_MAX_CHARS)}…` : text
  };
}
