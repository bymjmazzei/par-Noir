import type { PenSession } from '../services/penSession';
import { useDocEditorController } from './docEditor/useDocEditorController';
import { DocEditorShell } from './docEditor/DocEditorShell';
import { Link } from 'react-router-dom';

function notFoundCopy(reason?: string): { title: string; body: string } {
  switch (reason) {
    case 'cloud_token_missing':
      return {
        title: 'Cloud not connected',
        body: 'Drive credentials are not ready. Unlock again or reconnect Google Drive, then retry.'
      };
    case 'mlkem_missing':
      return {
        title: 'Missing messaging keys',
        body: 'Unlock did not include ML-KEM keys needed to open this encrypted doc. Unlock again from Pen.'
      };
    case 'groups_sheet_missing':
      return {
        title: 'Document key unavailable',
        body: 'Your Drive layout is missing the groups sheet used to unwrap the document key.'
      };
    case 'doc_key_unwrap_failed':
      return {
        title: 'Could not unlock document key',
        body: 'The doc is on cloud but this device could not unwrap its encryption key from your group wrap.'
      };
    case 'decrypt_failed':
      return {
        title: 'Could not decrypt document',
        body: 'The cloud replica was found but decryption failed with the available keys.'
      };
    case 'sections_empty':
      return {
        title: 'Document has no content yet',
        body: 'Cloud metadata exists but no readable sections were found.'
      };
    case 'cloud_fetch_empty':
      return {
        title: 'Document not on Drive',
        body: 'Library listed this doc, but the Drive folder/manifest was missing or incomplete.'
      };
    default:
      return {
        title: 'Document not found',
        body: 'This document is not available on this device.'
      };
  }
}

export function DocEditorPage({ session, docId }: { session: PenSession; docId: string }) {
  const state = useDocEditorController(session, docId);
  if (state.phase === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-white">
        <p className="text-stone-600">Loading document…</p>
      </div>
    );
  }
  if (state.phase === 'notFound') {
    const copy = notFoundCopy(state.reason);
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-white">
        <div className="max-w-md px-6 text-center">
          <p className="text-stone-800 font-medium">{copy.title}</p>
          <p className="mt-2 text-sm text-stone-600">{copy.body}</p>
          {state.reason ? (
            <p className="mt-3 font-mono text-[11px] text-stone-400">
              {state.reason}
              {state.detail ? ` — ${state.detail}` : ''}
            </p>
          ) : null}
          <Link to="/" className="mt-4 inline-block text-sm text-sky-700 underline">
            Back
          </Link>
        </div>
      </div>
    );
  }
  return <DocEditorShell {...state} />;
}
