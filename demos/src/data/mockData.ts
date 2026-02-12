/**
 * Mock template data for all 6 demos. Used until Sheet/API is connected.
 * Cannabis-tailored fictional brands for personality (no real company names).
 * Logos: SVG assets in public. Images: Picsum (deterministic).
 */
import type { TemplateDataLinkBio, TemplateDataOnePage } from '@/types/templateData';
import type { DemoSlug } from '@/constants/slugs';

const PICSUM = (seed: string, w: number, h: number) => `https://picsum.photos/seed/${seed}/${w}/${h}`;
const LOGO = (n: number) => `/demos/logos/logo-${n}.svg`;

// —— Link in bio 1: dispensary / menu updates
const mockLinkBio1: TemplateDataLinkBio = {
  brandName: 'RIVERLEAF DISPENSARY',
  tagline: 'Daily drops. Local favorites.',
  bio: 'Fresh menu updates, limited releases, and community events. Tap in for what’s new today.',
  logoUrl: LOGO(1),
  emailCtaHeading: 'Menu drops',
  emailCtaButtonText: 'Get updates',
  emailSignupUrl: 'https://script.google.com/macros/s/PLACEHOLDER/exec',
  unsubscribeLink: 'https://demos.parnoir.com/unsubscribe',
  backgroundImageUrl: PICSUM('riverleaf-bg', 1200, 1600),
  websiteUrl: 'https://riverleaf.example',
  socialLinks: [
    { label: 'Menu', url: 'https://example.com/menu' },
    { label: 'Deals', url: 'https://example.com/deals' },
    { label: 'Location', url: 'https://example.com/location' },
    { label: 'Instagram', url: 'https://instagram.com' },
    { label: 'Text club', url: 'https://example.com/text' },
  ],
  fontFamily: 'var(--flyer-body-font)',
  primaryColor: '#0ea5a4',
  secondaryColor: '#fff',
  buttonJustification: 'center',
};

// —— Link in bio 2: edibles brand / launches
const mockLinkBio2: TemplateDataLinkBio = {
  brandName: 'EMBER EDIBLES',
  tagline: 'Small batch. Bright flavor.',
  bio: 'Gummies, chocolates, and seasonal drops. Made for taste first — consistent, tested, and clean.',
  logoUrl: LOGO(2),
  emailCtaHeading: 'New drops',
  emailCtaButtonText: 'Notify me',
  emailSignupUrl: 'https://script.google.com/macros/s/PLACEHOLDER/exec',
  unsubscribeLink: 'https://demos.parnoir.com/unsubscribe',
  backgroundImageUrl: PICSUM('ember-bg', 1200, 1600),
  websiteUrl: 'https://ember.example',
  socialLinks: [
    { label: 'Shop', url: 'https://example.com/shop' },
    { label: 'Flavors', url: 'https://example.com/flavors' },
    { label: 'Lab results', url: 'https://example.com/coa' },
    { label: 'Instagram', url: 'https://instagram.com' },
  ],
  fontFamily: 'Georgia, serif',
  primaryColor: '#2563eb',
  secondaryColor: '#fff',
  buttonJustification: 'center',
};

// —— Link in bio 3: grow / craft flower
const mockLinkBio3: TemplateDataLinkBio = {
  brandName: 'NORTHWIND GROW CO.',
  tagline: 'Craft flower, cold-cured.',
  bio: 'Cultivation notes, harvest timelines, and limited jars. Built for people who care how it’s grown.',
  logoUrl: LOGO(3),
  emailCtaHeading: 'Harvest notes',
  emailCtaButtonText: 'Join list',
  emailSignupUrl: 'https://script.google.com/macros/s/PLACEHOLDER/exec',
  unsubscribeLink: 'https://demos.parnoir.com/unsubscribe',
  backgroundImageUrl: PICSUM('northwind-bg', 1200, 1600),
  websiteUrl: 'https://northwind.example',
  socialLinks: [
    { label: 'Strains', url: 'https://example.com/strains' },
    { label: 'Process', url: 'https://example.com/process' },
    { label: 'Where to find', url: 'https://example.com/stockists' },
    { label: 'Instagram', url: 'https://instagram.com' },
  ],
  fontFamily: 'system-ui',
  primaryColor: '#22c55e',
  secondaryColor: '#f0fdf4',
  buttonJustification: 'left',
};

// —— One-page 1: premium wellness / tinctures
const mockOnePage1: TemplateDataOnePage = {
  brandName: 'LUCID WELLNESS',
  tagline: 'Calm you can measure.',
  bio: 'Microdose-friendly tinctures and topicals made with consistent inputs and transparent testing.',
  logoUrl: LOGO(4),
  emailCtaHeading: 'Weekly calm',
  emailCtaButtonText: 'Subscribe',
  emailSignupUrl: 'https://script.google.com/macros/s/PLACEHOLDER/exec',
  unsubscribeLink: 'https://demos.parnoir.com/unsubscribe',
  heroImageUrl: PICSUM('lucid-hero', 1200, 600),
  products: [
    { id: '1', name: 'Daily Tincture (10:1)', imageUrl: PICSUM('lucid-p1', 400, 400), description: 'Fast, consistent drops. Designed for small, repeatable routines.', url: 'https://example.com/tincture' },
    { id: '2', name: 'Sleep Gummies', imageUrl: PICSUM('lucid-p2', 400, 400), description: 'Gentle dose, clean ingredients. Nightly wind-down without the heaviness.', url: 'https://example.com/gummies' },
    { id: '3', name: 'CBD Balm', imageUrl: PICSUM('lucid-p3', 400, 400), description: 'Targeted topical for recovery days. Smooth texture, no grease.', url: 'https://example.com/balm' },
    { id: '4', name: 'Sampler Pack', imageUrl: PICSUM('lucid-p4', 400, 400), description: 'Try the lineup — tincture, gummies, and balm in one box.', url: 'https://example.com/sampler' },
  ],
  mediaPosts: [
    { id: 'm1', type: 'instagram', url: 'https://instagram.com/p/1', thumbnailUrl: PICSUM('lucid-m1', 300, 300), title: 'How we dose (simple guide)' },
    { id: 'm2', type: 'youtube', url: 'https://youtube.com/watch?v=1', thumbnailUrl: PICSUM('lucid-m2', 300, 300), title: 'Behind the lab: batch testing' },
    { id: 'm3', type: 'instagram', url: 'https://instagram.com/p/2', thumbnailUrl: PICSUM('lucid-m3', 300, 300), title: 'New: sampler pack' },
    { id: 'm4', type: 'google_drive', url: 'https://drive.google.com/file/1', thumbnailUrl: PICSUM('lucid-m4', 300, 300), title: 'COA (PDF)' },
    { id: 'm5', type: 'instagram', url: 'https://instagram.com/p/3', thumbnailUrl: PICSUM('lucid-m5', 300, 300), title: 'Routines that stick' },
  ],
};

// —— One-page 2: lifestyle / pre-rolls
const mockOnePage2: TemplateDataOnePage = {
  brandName: 'NEON JOINTS',
  tagline: 'For nights out and nights in.',
  bio: 'Limited-run pre-roll packs and collabs. Built like a streetwear drop — clean, consistent, and loud.',
  logoUrl: LOGO(5),
  emailCtaHeading: 'Drop alerts',
  emailCtaButtonText: 'Join list',
  emailSignupUrl: 'https://script.google.com/macros/s/PLACEHOLDER/exec',
  unsubscribeLink: 'https://demos.parnoir.com/unsubscribe',
  heroImageUrl: PICSUM('neon-hero', 1200, 600),
  products: [
    { id: '1', name: '6-Pack Minis', imageUrl: PICSUM('neon-p1', 400, 400), description: 'Six minis, mixed strains. Easy to share, easy to carry.', url: 'https://example.com/minis' },
    { id: '2', name: 'Live Resin Vape', imageUrl: PICSUM('neon-p2', 400, 400), description: 'High terp, smooth pull. Hardware tuned for flavor.', url: 'https://example.com/vape' },
    { id: '3', name: 'Collab Pack', imageUrl: PICSUM('neon-p3', 400, 400), description: 'Monthly collab with a featured grow. Limited quantities.', url: 'https://example.com/collab' },
    { id: '4', name: 'Merch Drop', imageUrl: PICSUM('neon-p4', 400, 400), description: 'Hats, tees, and lighters. When it’s gone, it’s gone.', url: 'https://example.com/merch' },
  ],
  mediaPosts: [
    { id: 'm1', type: 'instagram', url: 'https://instagram.com/p/1', thumbnailUrl: PICSUM('neon-m1', 300, 300), title: 'Drop recap (sold out)' },
    { id: 'm2', type: 'youtube', url: 'https://youtube.com/watch?v=1', thumbnailUrl: PICSUM('neon-m2', 300, 300), title: 'How we roll (tour)' },
    { id: 'm3', type: 'instagram', url: 'https://instagram.com/p/2', thumbnailUrl: PICSUM('neon-m3', 300, 300), title: 'Collab tease' },
    { id: 'm4', type: 'instagram', url: 'https://instagram.com/p/3', thumbnailUrl: PICSUM('neon-m4', 300, 300), title: 'New pack photos' },
    { id: 'm5', type: 'google_drive', url: 'https://drive.google.com/file/1', thumbnailUrl: PICSUM('neon-m5', 300, 300), title: 'Menu sheet (PDF)' },
  ],
};

// —— One-page 3: solventless / rosin
const mockOnePage3: TemplateDataOnePage = {
  brandName: 'PURESOL SOLVENTLESS',
  tagline: 'Cold-cured, terp-forward.',
  bio: 'Small-batch rosin and curated hardware. Transparent process, clean inputs, consistent results.',
  logoUrl: LOGO(6),
  emailCtaHeading: 'Batch notes',
  emailCtaButtonText: 'Subscribe',
  emailSignupUrl: 'https://script.google.com/macros/s/PLACEHOLDER/exec',
  unsubscribeLink: 'https://demos.parnoir.com/unsubscribe',
  heroImageUrl: PICSUM('puresol-hero', 1200, 600),
  products: [
    { id: '1', name: 'Live Rosin (90u)', imageUrl: PICSUM('puresol-p1', 400, 400), description: 'Single-source, cold-cured. Labeled by wash and press date.', url: 'https://example.com/rosin' },
    { id: '2', name: 'AIO Rosin Pen', imageUrl: PICSUM('puresol-p2', 400, 400), description: 'Solventless hardware tuned for low-temp flavor.', url: 'https://example.com/pen' },
    { id: '3', name: 'Glass & Tools', imageUrl: PICSUM('puresol-p3', 400, 400), description: 'Caps, tools, and cleaning kit. Built for daily use.', url: 'https://example.com/tools' },
  ],
  mediaPosts: [
    { id: 'm1', type: 'youtube', url: 'https://youtube.com/watch?v=1', thumbnailUrl: PICSUM('puresol-m1', 300, 300), title: 'Press room walkthrough' },
    { id: 'm2', type: 'instagram', url: 'https://instagram.com/p/1', thumbnailUrl: PICSUM('puresol-m2', 300, 300), title: 'Batch notes: terps' },
    { id: 'm3', type: 'instagram', url: 'https://instagram.com/p/2', thumbnailUrl: PICSUM('puresol-m3', 300, 300), title: 'Jar shots' },
    { id: 'm4', type: 'google_drive', url: 'https://drive.google.com/file/1', thumbnailUrl: PICSUM('puresol-m4', 300, 300), title: 'COA (PDF)' },
    { id: 'm5', type: 'instagram', url: 'https://instagram.com/p/3', thumbnailUrl: PICSUM('puresol-m5', 300, 300), title: 'Hardware tips' },
  ],
};

const MOCK_DATA: Record<DemoSlug, TemplateDataLinkBio | TemplateDataOnePage> = {
  'link-bio-1': mockLinkBio1,
  'link-bio-2': mockLinkBio2,
  'link-bio-3': mockLinkBio3,
  'one-page-1': mockOnePage1,
  'one-page-2': mockOnePage2,
  'one-page-3': mockOnePage3,
};

export function getMockData(slug: DemoSlug): TemplateDataLinkBio | TemplateDataOnePage {
  return MOCK_DATA[slug];
}
