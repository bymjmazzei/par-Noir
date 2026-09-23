/** Closed / open folder glyph for explorer directory rows. */

export function ExplorerFolderGlyph({
  open,
  className = ''
}: {
  open: boolean;
  className?: string;
}) {
  return (
    <span
      className={`pen-explorer-folder-glyph ${className}`}
      aria-hidden
      title={open ? 'Expanded folder' : 'Folder'}
    >
      {open ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M3 8.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7.5a1 1 0 0 0-1-1H11l-1.8-2.1A1 1 0 0 0 8.4 7H5a2 2 0 0 0-2 1.5Z"
            fill="currentColor"
            opacity="0.18"
          />
          <path
            d="M3 9.5V7a2 2 0 0 1 2-2h3.2a1 1 0 0 1 .75.34L10.8 7H20a1 1 0 0 1 1 1v1.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3 9.5h18V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5Z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M3 7a2 2 0 0 1 2-2h3.2a1 1 0 0 1 .75.34L10.8 7H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}
