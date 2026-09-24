/** Distinct form glyphs for Pen home explorer rows — not letter badges. */

export function FormDocIcon({
  classId,
  className = '',
  compact = false
}: {
  classId?: string;
  className?: string;
  /** Inline in explorer name cells — tighter than the default tile glyph. */
  compact?: boolean;
}) {
  const id = classId || '';
  const common = compact
    ? `h-3.5 w-3.5 shrink-0 text-stone-700 ${className}`
    : `h-5 w-5 shrink-0 text-stone-700 ${className}`;
  const title = formTitle(id);

  return (
    <span
      className={
        compact
          ? 'inline-flex h-4 w-4 shrink-0 items-center justify-center'
          : 'inline-flex h-7 w-7 shrink-0 items-center justify-center'
      }
      title={title}
    >
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
    case 'social.quote':
      return 'Quote';
    case 'social.link':
      return 'Link';
    case 'social.poll':
      return 'Poll';
    case 'social.metric':
      return 'Metric';
    case 'social.code':
      return 'Code';
    case 'social.profile':
      return 'Profile';
    case 'social.audio':
      return 'Audio';
    case 'social.frame':
      return 'Frame';
    case 'community.feed':
      return 'Feed';
    case 'community.feed_embed':
      return 'Feed embed';
    case 'community.landing':
      return 'Landing';
    case 'community.home':
      return 'Community home';
    case 'community.site':
      return 'Site';
    case 'primitives.table':
      return 'Table';
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
    case 'social.quote':
      return (
        <svg {...props}>
          <path d="M7 11h4v6H5v-4a4 4 0 014-4" />
          <path d="M17 11h4v6h-6v-4a4 4 0 014-4" />
        </svg>
      );
    case 'social.link':
      return (
        <svg {...props}>
          <path d="M10 13a5 5 0 007.07 0l2.12-2.12a5 5 0 00-7.07-7.07L11 5" />
          <path d="M14 11a5 5 0 00-7.07 0L4.81 13.12a5 5 0 007.07 7.07L13 19" />
        </svg>
      );
    case 'social.poll':
      return (
        <svg {...props}>
          <path d="M5 19V9M12 19V5M19 19v-7" />
        </svg>
      );
    case 'social.metric':
      return (
        <svg {...props}>
          <path d="M4 19V5h4v14H4zM10 19v-8h4v8h-4zM16 19v-12h4v12h-4z" />
        </svg>
      );
    case 'social.code':
      return (
        <svg {...props}>
          <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13 6l-2 12" />
        </svg>
      );
    case 'social.profile':
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 19a7 7 0 0114 0" />
        </svg>
      );
    case 'social.audio':
      return (
        <svg {...props}>
          <path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" />
        </svg>
      );
    case 'social.frame':
      return (
        <svg {...props}>
          <rect x="4" y="5" width="16" height="14" rx="1.5" />
          <path d="M8 15h8" />
        </svg>
      );
    case 'community.feed':
      return (
        <svg {...props}>
          <path d="M5 18a1 1 0 110-2" />
          <path d="M5 14a5 5 0 015 5" />
          <path d="M5 10a9 9 0 019 9" />
          <path d="M5 6a13 13 0 0113 13" />
        </svg>
      );
    case 'community.feed_embed':
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="16" rx="1.5" />
          <path d="M7 8h10M7 12h10M7 16h6" />
        </svg>
      );
    case 'primitives.table':
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="14" rx="1" />
          <path d="M3 10h18M3 15h18M9 5v14M15 5v14" />
        </svg>
      );
    case 'community.landing':
      return (
        <svg {...props}>
          <rect x="4" y="4" width="16" height="16" rx="1.5" />
          <path d="M8 10h8M8 14h5" />
        </svg>
      );
    case 'community.home':
      return (
        <svg {...props}>
          <path d="M4 11l8-7 8 7" />
          <path d="M6 10v9h12v-9" />
        </svg>
      );
    case 'community.site':
      return (
        <svg {...props}>
          <rect x="3" y="5" width="7" height="14" rx="1" />
          <rect x="14" y="5" width="7" height="14" rx="1" />
          <path d="M5 9h3M5 12h3M16 9h3M16 12h3" />
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
