/**
 * Tile metadata for the demo gallery home page.
 * Six demos: 3 link-in-bio + 3 one-page.
 */

export type ProductType = 'link-in-bio' | 'one-page';

export interface DemoTileMeta {
  slug: string;
  title: string;
  category: string;
  caption: string;
  price: number;
  productType: ProductType;
  /** Thumbnail: URL (e.g. Picsum) or path to local image. Replace with real screenshot for production. */
  thumbnailPath: string;
}

/** Real photos via Picsum (seed = consistent image per demo). Swap for real screenshots when ready. */
const PICSUM = (seed: string, w: number, h: number) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;

export const DEMO_TILES: DemoTileMeta[] = [
  { slug: 'link-bio-1', title: 'Link in bio 1', category: 'Link in bio', caption: 'Stacked layout with full background.', price: 250, productType: 'link-in-bio', thumbnailPath: PICSUM('link-bio-1', 320, 200) },
  { slug: 'link-bio-2', title: 'Link in bio 2', category: 'Link in bio', caption: 'Card-style links and email capture.', price: 250, productType: 'link-in-bio', thumbnailPath: PICSUM('link-bio-2', 320, 200) },
  { slug: 'link-bio-3', title: 'Link in bio 3', category: 'Link in bio', caption: 'Minimal layout with adjustable styling.', price: 250, productType: 'link-in-bio', thumbnailPath: PICSUM('link-bio-3', 320, 200) },
  { slug: 'one-page-1', title: 'One-page brand 1', category: 'One-page brand', caption: 'Hero, email, products, media.', price: 500, productType: 'one-page', thumbnailPath: PICSUM('onepage1', 320, 200) },
  { slug: 'one-page-2', title: 'One-page brand 2', category: 'One-page brand', caption: 'Full-width sections and carousel.', price: 500, productType: 'one-page', thumbnailPath: PICSUM('onepage2', 320, 200) },
  { slug: 'one-page-3', title: 'One-page brand 3', category: 'One-page brand', caption: 'Alternate layout and typography.', price: 500, productType: 'one-page', thumbnailPath: PICSUM('onepage3', 320, 200) },
];

export const LINK_IN_BIO_TILES = DEMO_TILES.filter((t) => t.productType === 'link-in-bio');
export const ONE_PAGE_TILES = DEMO_TILES.filter((t) => t.productType === 'one-page');
