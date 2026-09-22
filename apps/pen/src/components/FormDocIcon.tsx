/** Distinct form glyphs for Pen home explorer rows — not letter badges. */

export function FormDocIcon({
  classId,
  className = ''
}: {
  classId?: string;
  className?: string;
}) {
  const id = classId || '';
  const common = `h-5 w-5 shrink-0 text-stone-700 ${className}`;
  const title = formTitle(id);

  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center" title={title}>
      {iconFor(id, common)}
    </span>
  );
}

function formTitle(classId: string): string {
  switch (classId) {
    case 'social.note':
      return 'Note';
    case 'social.post':
      return 'Post';
    case 'social.collection':
      return 'Collection';
    case 'social.set':
      return 'Set';
    case 'social.feed':
      return 'Feed';
    case 'projects.journal':
      return 'Journal';
    case 'projects.list':
      return 'List';
    case 'projects.letter':
      return 'Letter';
    case 'projects.note':
      return 'Project note';
    case 'library.book':
      return 'Book';
    case 'library.article':
      return 'Article';
    case 'time.calendar':
      return 'Calendar';
    case 'time.event':
      return 'Event';
    case 'time.schedule':
      return 'Schedule';
    default:
      return 'Document';
  }
}

function iconFor(classId: string, className: string) {
  const props = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const
  };

  switch (classId) {
    case 'social.note':
      // Sticky note
      return (
        <svg {...props}>
          <path d="M6 4h9l5 5v11a1 1 0 01-1 1H6a1 1 0 01-1-1V5a1 1 0 011-1z" />
          <path d="M15 4v5h5" />
          <path d="M8 12h8M8 16h5" />
        </svg>
      );
    case 'social.post':
      // Image frame / caption post
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="14" rx="1.5" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="M3 16l5-4 4 3 3-2 6 4" />
        </svg>
      );
    case 'social.collection':
      // Stacked cards
      return (
        <svg {...props}>
          <rect x="6" y="7" width="13" height="11" rx="1" />
          <path d="M4 5h13a1 1 0 011 1v1" />
          <path d="M8 18v1a1 1 0 001 1h11" />
        </svg>
      );
    case 'social.set':
      // Linked refs
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="3" />
          <circle cx="16" cy="16" r="3" />
          <path d="M10.5 10.5l3 3" />
        </svg>
      );
    case 'social.feed':
      return (
        <svg {...props}>
          <path d="M5 18a1 1 0 110-2" />
          <path d="M5 14a5 5 0 015 5" />
          <path d="M5 10a9 9 0 019 9" />
          <path d="M5 6a13 13 0 0113 13" />
        </svg>
      );
    case 'projects.journal':
      return (
        <svg {...props}>
          <path d="M6 3h11a1 1 0 011 1v16a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" />
          <path d="M9 7h6M9 11h6M9 15h4" />
        </svg>
      );
    case 'projects.list':
      return (
        <svg {...props}>
          <path d="M9 7h11M9 12h11M9 17h11" />
          <path d="M5 7h.01M5 12h.01M5 17h.01" />
        </svg>
      );
    case 'projects.letter':
      return (
        <svg {...props}>
          <rect x="3" y="6" width="18" height="12" rx="1.5" />
          <path d="M3 8l9 6 9-6" />
        </svg>
      );
    case 'projects.note':
      return (
        <svg {...props}>
          <path d="M7 4h8l4 4v12a1 1 0 01-1 1H7a1 1 0 01-1-1V5a1 1 0 011-1z" />
          <path d="M15 4v4h4" />
        </svg>
      );
    case 'library.book':
      return (
        <svg {...props}>
          <path d="M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2V5z" />
          <path d="M6 3v16" />
        </svg>
      );
    case 'library.article':
      return (
        <svg {...props}>
          <path d="M6 3h9l5 5v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" />
          <path d="M15 3v5h5" />
          <path d="M8 12h8M8 16h8M8 20h4" />
        </svg>
      );
    case 'time.calendar':
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="16" rx="1.5" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case 'time.event':
      return (
        <svg {...props}>
          <path d="M12 21s7-5.2 7-11a7 7 0 10-14 0c0 5.8 7 11 7 11z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      );
    case 'time.schedule':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <path d="M6 3h9l5 5v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" />
          <path d="M15 3v5h5" />
        </svg>
      );
  }
}
