/**
 * Local in-doc comments + suggestions (Pen collab bus; not public engagement).
 */

import type { PenDocComment, PenSuggestion, PenTipTapNode } from '@par-noir/pen-protocol';

function commentsKey(pn: string, docId: string) {
  return `pen_comments_v1:${pn}:${docId}`;
}

function suggestionsKey(pn: string, docId: string) {
  return `pen_suggestions_v1:${pn}:${docId}`;
}

export function listLocalComments(pn: string, docId: string): PenDocComment[] {
  try {
    const raw = localStorage.getItem(commentsKey(pn, docId));
    return raw ? (JSON.parse(raw) as PenDocComment[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalComments(pn: string, docId: string, comments: PenDocComment[]): void {
  localStorage.setItem(commentsKey(pn, docId), JSON.stringify(comments));
}

export function appendLocalComment(pn: string, docId: string, comment: PenDocComment): void {
  const list = listLocalComments(pn, docId);
  list.push(comment);
  saveLocalComments(pn, docId, list);
}

export function listLocalSuggestions(pn: string, docId: string): PenSuggestion[] {
  try {
    const raw = localStorage.getItem(suggestionsKey(pn, docId));
    return raw ? (JSON.parse(raw) as PenSuggestion[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalSuggestions(pn: string, docId: string, suggestions: PenSuggestion[]): void {
  localStorage.setItem(suggestionsKey(pn, docId), JSON.stringify(suggestions));
}

export function upsertLocalSuggestion(pn: string, docId: string, suggestion: PenSuggestion): void {
  const list = listLocalSuggestions(pn, docId).filter((s) => s.id !== suggestion.id);
  list.push(suggestion);
  saveLocalSuggestions(pn, docId, list);
}

export function hashPnForComment(pn: string): string {
  // Non-crypto display hash — never store raw pn in comment payload fields meant for logs.
  let h = 0;
  for (let i = 0; i < pn.length; i++) h = (h * 31 + pn.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/** Cross-app bridge: browse writes this after publish when origins share storage. */
export function readPublishedFileId(docId: string): string | null {
  try {
    return localStorage.getItem(`pen_published_file_id:${docId}`);
  } catch {
    return null;
  }
}

export function makeComment(input: {
  docId: string;
  sectionSlug: string;
  body: string;
  authorPn: string;
  from?: number;
  to?: number;
}): PenDocComment {
  return {
    id: `c_${crypto.randomUUID()}`,
    docId: input.docId,
    sectionSlug: input.sectionSlug,
    from: input.from,
    to: input.to,
    authorPnHash: hashPnForComment(input.authorPn),
    body: input.body,
    createdAt: new Date().toISOString()
  };
}

export function makeSuggestion(input: {
  docId: string;
  sectionSlug: string;
  authorPn: string;
  proposedDoc: PenTipTapNode;
  summary?: string;
}): PenSuggestion {
  return {
    id: `s_${crypto.randomUUID()}`,
    docId: input.docId,
    sectionSlug: input.sectionSlug,
    authorPnHash: hashPnForComment(input.authorPn),
    createdAt: new Date().toISOString(),
    proposedDoc: input.proposedDoc,
    summary: input.summary,
    status: 'pending'
  };
}
