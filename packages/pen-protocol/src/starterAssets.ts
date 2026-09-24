/** Resolved URLs for vendored Pexels starter media (see starter-assets/ATTRIBUTION.md). */

function asset(name: string): string {
  return new URL(`./starter-assets/${name}`, import.meta.url).href;
}

export const STARTER_ASSETS = {
  noteHero: asset('note-hero.jpg'),
  articleHero: asset('article-hero.jpg'),
  captionBg: asset('caption-bg.jpg'),
  imagePost: asset('image-post.jpg'),
  collection1: asset('collection-1.jpg'),
  collection2: asset('collection-2.jpg'),
  storyCover: asset('story-cover.jpg'),
  storyPage: asset('story-page.jpg'),
  setPrimary: asset('set-primary.jpg'),
  feedHero: asset('feed-hero.jpg'),
  feedCurated: asset('feed-curated.jpg'),
  journal: asset('journal.jpg'),
  listHeader: asset('list-header.jpg'),
  letter: asset('letter.jpg'),
  cardNote: asset('card-note.jpg'),
  bookCover: asset('book-cover.jpg'),
  musicCover: asset('music-cover.jpg'),
  calendar: asset('calendar.jpg'),
  event: asset('event.jpg'),
  schedule: asset('schedule.jpg'),
  videoPoster: asset('video-poster.jpg'),
  videoPost: asset('video-post-sm.mp4')
} as const;

export type StarterAssetKey = keyof typeof STARTER_ASSETS;
