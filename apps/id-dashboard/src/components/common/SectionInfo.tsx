import React, { useId, useState } from 'react';
import { Info, X } from 'lucide-react';

export interface SectionInfoProps {
  title: string;
  children: React.ReactNode;
  /** Accessible label for the icon button. Defaults to `About ${title}`. */
  ariaLabel?: string;
  className?: string;
}

/**
 * Icon-only control that opens a small overlay with educational / helper copy.
 * Place next to a section heading; keep actions and forms outside the popup.
 */
export function SectionInfo({ title, children, ariaLabel, className = '' }: SectionInfoProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center shrink-0 text-text-secondary hover:text-text-primary transition-colors ${className}`}
        aria-label={ariaLabel ?? `About ${title}`}
        title={ariaLabel ?? `About ${title}`}
      >
        <Info className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="bg-neutral-800 rounded-lg p-6 max-w-md w-full text-text-primary border border-neutral-700 shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <div className="flex justify-between items-center mb-4 gap-3">
              <h3 id={titleId} className="text-lg font-semibold">
                {title}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-text-secondary hover:text-text-primary transition-colors shrink-0"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="text-text-secondary text-sm space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1">
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default SectionInfo;
