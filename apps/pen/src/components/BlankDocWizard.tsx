/** Blank document setup — pick Blank or a Social rail form; click opens the editor. */

import type { BlankDocChoice } from '../services/createBlankDoc';
import {
  SOCIAL_TEMPLATE_RAIL_FORMS,
  SOCIAL_TEMPLATE_RAIL_LABELS
} from '../services/classFeedRailItems';
import { FormDocIcon } from './FormDocIcon';

export function BlankDocWizard({
  busy,
  error,
  onCancel,
  onCreate
}: {
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onCreate: (choice: BlankDocChoice) => void | Promise<void>;
}) {
  function pick(choice: BlankDocChoice) {
    if (busy) return;
    void onCreate(choice);
  }

  return (
    <div
      className="pen-template-preview-overlay"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="pen-blank-wizard"
        role="dialog"
        aria-modal="true"
        aria-label="New blank document"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pen-blank-wizard-bar">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-black">Blank document</h2>
            <p className="text-xs text-neutral-500">
              Choose a form to open in the editor.
            </p>
          </div>
          <button
            type="button"
            className="pen-template-icon-btn"
            aria-label="Close"
            title="Close"
            onClick={onCancel}
            disabled={busy}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="pen-blank-wizard-body">
          <div className="pen-blank-wizard-options">
            <button
              type="button"
              className="pen-blank-wizard-option"
              disabled={busy}
              onClick={() => pick({ kind: 'custom' })}
            >
              <FormDocIcon classId="custom.doc" />
              <span className="font-semibold capitalize text-black">Blank</span>
            </button>

            {SOCIAL_TEMPLATE_RAIL_FORMS.map((classId) => (
              <button
                key={classId}
                type="button"
                className="pen-blank-wizard-option"
                disabled={busy}
                onClick={() => pick({ kind: 'form', classId })}
              >
                <FormDocIcon classId={classId} />
                <span className="font-semibold capitalize text-black">
                  {SOCIAL_TEMPLATE_RAIL_LABELS[classId]}
                </span>
              </button>
            ))}
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {busy ? <p className="text-xs text-neutral-500">Creating…</p> : null}
        </div>
      </div>
    </div>
  );
}
