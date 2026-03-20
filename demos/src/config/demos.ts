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
  /** Thumbnail: path to local image (Leonardo.ai). Replace with real screenshot for production. */
  thumbnailPath: string;
}

/** Thumbnails: Leonardo.ai–generated images (same as demo content). */
const IMG = (filename: string) => `/demos/images/${filename}`;
const LEONARDO = {
  dispensary: 'lucid-origin_Premium_dispensary_or_retail_vibe_interior_of_a_clean_modern_shop_with_wooden_sh-0.jpg',
  edible: 'lucid-origin_Premium_edible_brand_photo_artfully_arranged_gummies_or_small-batch_chocolates_o-0.jpg',
  flower: 'lucid-origin_Lifestyle_product_photo_premium_craft_cannabis_flower_brand_minimalist_flat_lay_-0.jpg',
  influencer: 'lucid-origin_Lifestyle_portrait_for_a_cannabis-adjacent_influencer_one_person_from_chest_up_r-0.jpg',
  preroll: 'lucid-origin_Lifestyle_brand_photo_for_a_preroll_company_sleek_pre-roll_tubes_or_tins_on_a_co-0.jpg',
  event: 'lucid-origin_Event_photo_cannabis-friendly_brand_activation_wide_shot_of_a_minimal_pop-up_or_-0.jpg',
} as const;

export const DEMO_TILES: DemoTileMeta[] = [
  { slug: 'link-bio-1', title: 'Link in bio 1', category: 'Link in bio', caption: 'Stacked layout with full background.', price: 250, productType: 'link-in-bio', thumbnailPath: IMG(LEONARDO.dispensary) },
  { slug: 'link-bio-2', title: 'Link in bio 2', category: 'Link in bio', caption: 'Card-style links and email capture.', price: 250, productType: 'link-in-bio', thumbnailPath: IMG(LEONARDO.edible) },
  { slug: 'link-bio-3', title: 'Link in bio 3', category: 'Link in bio', caption: 'Minimal layout with adjustable styling.', price: 250, productType: 'link-in-bio', thumbnailPath: IMG(LEONARDO.flower) },
  { slug: 'one-page-1', title: 'One-page brand 1', category: 'One-page brand', caption: 'Hero, email, products, media.', price: 500, productType: 'one-page', thumbnailPath: IMG(LEONARDO.influencer) },
  { slug: 'one-page-2', title: 'One-page brand 2', category: 'One-page brand', caption: 'Full-width sections and carousel.', price: 500, productType: 'one-page', thumbnailPath: IMG(LEONARDO.preroll) },
  { slug: 'one-page-3', title: 'One-page brand 3', category: 'One-page brand', caption: 'Alternate layout and typography.', price: 500, productType: 'one-page', thumbnailPath: IMG(LEONARDO.event) },
];

export const LINK_IN_BIO_TILES = DEMO_TILES.filter((t) => t.productType === 'link-in-bio');
export const ONE_PAGE_TILES = DEMO_TILES.filter((t) => t.productType === 'one-page');
