import { useState } from 'react';
import {
  credentialsBadge,
  type BadgeCredit,
  type ManifestSummary,
  type OriginalityResult
} from '@par-noir/pn-provenance';

export type PostCredentials = {
  /** Server-verified manifest summary from the index row. */
  c2pa?: ManifestSummary | null;
  originality?: OriginalityResult | null;
};

const TRUST_LINE: Record<string, string> = {
  trusted: 'Signature from a trusted signer',
  untrusted: 'Signer not on the trust list'
};

function Credit({ credit, onOpenHandle }: { credit: BadgeCredit; onOpenHandle?: (handle: string) => void }) {
  if (credit.handle && onOpenHandle) {
    const handle = credit.handle;
    return (
      <button
        type="button"
        className="pointer-events-auto font-semibold underline decoration-white/50 underline-offset-2"
        onClick={(e) => {
          e.stopPropagation();
          onOpenHandle(handle);
        }}
      >
        {credit.label}
      </button>
    );
  }
  return <span className="font-semibold">{credit.label}</span>;
}

/** Content Credentials (C2PA) for a post: the real signer, its creator, and what it was made from. */
export function ContentCredentialsBadge({
  credentials,
  onOpenHandle,
  className = ''
}: {
  credentials: PostCredentials | null | undefined;
  /** Opens a creator's handle; credits without a handle stay plain text. */
  onOpenHandle?: (handle: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const badge = credentialsBadge(credentials?.c2pa, credentials?.originality);
  if (!badge) return null;

  return (
    <div className={`pen-content-credentials text-[11px] text-white drop-shadow-md ${className}`} data-trust={badge.trust}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Content Credentials: ${badge.made}`}
        className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 backdrop-blur-sm"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span aria-hidden className="rounded-sm border border-white/80 px-0.5 text-[9px] font-bold leading-none">
          cr
        </span>
        <span>{badge.made}</span>
        {badge.trust === 'untrusted' ? <span className="text-white/70">· unverified</span> : null}
      </button>
      {badge.originalBy ? (
        <p className="pen-content-credentials-original mt-1">
          Original by <Credit credit={badge.originalBy} onOpenHandle={onOpenHandle} />
        </p>
      ) : null}
      {open ? (
        <div className="pointer-events-auto mt-1 max-w-[16rem] space-y-1 rounded-md bg-black/70 p-2 backdrop-blur-sm">
          <p>{TRUST_LINE[badge.trust]}</p>
          {badge.creator ? (
            <p>
              By <Credit credit={badge.creator} onOpenHandle={onOpenHandle} />
            </p>
          ) : null}
          {badge.ingredients.length ? (
            <div>
              <p className="text-white/70">Made from</p>
              <ul className="space-y-0.5">
                {badge.ingredients.map((ing, i) => (
                  <li key={i}>
                    {ing.title}
                    {ing.creator ? (
                      <>
                        {' by '}
                        <Credit credit={ing.creator} onOpenHandle={onOpenHandle} />
                      </>
                    ) : null}
                    {ing.made ? <span className="text-white/70"> · {ing.made}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
