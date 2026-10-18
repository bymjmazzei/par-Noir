export function SpeakerIcon({ muted, size = 16 }: { muted: boolean; size?: number }) {
  if (muted) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M4.5 9v6h3.5l4.5 3.5V5.5L8 9H4.5z" />
        <path
          d="M16.5 9.5l4 4m0-4l-4 4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4.5 9v6h3.5l4.5 3.5V5.5L8 9H4.5z" />
      <path
        d="M15.5 9.5a3.5 3.5 0 010 5M17.5 7a6 6 0 010 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
