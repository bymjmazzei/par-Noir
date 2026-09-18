/**
 * Full-bleed brand splash for feed first paint (session-once).
 */

export type FeedBrandSplashMode = 'loading' | 'network' | 'empty';

type Props = {
  mode: FeedBrandSplashMode;
  exiting?: boolean;
  onRetry?: () => void;
};

export function FeedBrandSplash({ mode, exiting = false, onRetry }: Props) {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{
        backgroundColor: '#000',
        backgroundImage: 'url(/branding/Par-Noir-Background-Dark.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        opacity: exiting ? 0 : 1,
        transition: 'opacity 280ms ease-out',
        pointerEvents: exiting ? 'none' : 'auto',
      }}
      aria-busy={mode === 'loading'}
      aria-live="polite"
    >
      <img
        src="/branding/Par-Noir-Logo-White.png"
        alt="par Noir"
        className="w-[min(56vw,220px)] h-auto select-none"
        draggable={false}
      />
      {mode === 'network' && (
        <div className="mt-8 flex flex-col items-center gap-3 px-6 text-center">
          <p className="text-sm text-neutral-300">Can&apos;t reach par Noir</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="text-sm text-white underline underline-offset-4"
            >
              Retry
            </button>
          )}
        </div>
      )}
      {mode === 'empty' && (
        <p className="mt-8 px-6 text-center text-sm text-neutral-400">
          Nothing to show right now
        </p>
      )}
    </div>
  );
}
