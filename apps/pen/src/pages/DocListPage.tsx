export type { PenAddIntent } from './docList/docListTypes';
import type { PenSession } from '../services/penSession';
import type { LocalDocSummary } from '../services/penLocalStore';
import type { PenAddIntent } from './docList/docListTypes';
import { useDocListController } from './docList/useDocListController';
import { DocListShell } from './docList/DocListShell';

/** Quiet file-manager home — templates browse is an in-page view. */
export function DocListPage({
  session,
  docs,
  onDocsChange,
  onDocsRemoved,
  addIntent = null,
  onAddIntentConsumed
}: {
  session: PenSession;
  docs: LocalDocSummary[];
  onDocsChange: () => void;
  onDocsRemoved?: (docIds: string[]) => void;
  addIntent?: PenAddIntent | null;
  onAddIntentConsumed?: () => void;
}) {
  const state = useDocListController({
    session,
    docs,
    onDocsChange,
    onDocsRemoved,
    addIntent,
    onAddIntentConsumed
  });
  return <DocListShell state={state} />;
}
