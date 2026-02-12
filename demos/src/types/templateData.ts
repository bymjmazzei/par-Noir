/**
 * Canonical template data type. Same data points for all 6 templates;
 * link-in-bio uses a subset, one-page uses the full set.
 */

export interface SocialLink {
  label: string;
  url: string;
}

export interface Product {
  id: string;
  name: string;
  imageUrl: string;
  description?: string;
  url?: string;
}

export type MediaPostType = 'instagram' | 'youtube' | 'google_drive';

export interface MediaPost {
  id: string;
  type: MediaPostType;
  url: string;
  thumbnailUrl?: string;
  title?: string;
}

/** Shared by both link-in-bio and one-page. */
export interface TemplateDataBase {
  brandName: string;
  tagline: string;
  bio: string;
  logoUrl: string;
  emailCtaHeading: string;
  emailCtaButtonText: string;
  emailSignupUrl: string;
  unsubscribeLink: string;
}

/** Link-in-bio specific. */
export interface TemplateDataLinkBio extends TemplateDataBase {
  backgroundImageUrl?: string;
  backgroundVideoUrl?: string;
  websiteUrl: string;
  socialLinks: SocialLink[];
  fontFamily?: string;
  primaryColor?: string;
  secondaryColor?: string;
  buttonJustification?: 'left' | 'center' | 'right';
}

/** One-page specific. */
export interface TemplateDataOnePage extends TemplateDataBase {
  heroImageUrl: string;
  products: Product[];
  mediaPosts: MediaPost[];
}

/** Union: link-in-bio data or one-page data. */
export type TemplateData = TemplateDataLinkBio | TemplateDataOnePage;

export function isLinkBioData(
  data: TemplateData
): data is TemplateDataLinkBio {
  return 'websiteUrl' in data && 'socialLinks' in data;
}

export function isOnePageData(
  data: TemplateData
): data is TemplateDataOnePage {
  return 'products' in data && 'mediaPosts' in data;
}
