import type { PenSession } from '../services/penSession';
import { useDocEditorController } from './docEditor/useDocEditorController';
import { DocEditorShell } from './docEditor/DocEditorShell';
import { Link } from 'react-router-dom';

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
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-stone-600">Document not found.</p>
          <Link to="/" className="mt-2 inline-block text-sm text-sky-700 underline">
            Back
          </Link>
        </div>
      </div>
    );
  }
  return <DocEditorShell state={state} />;
}
