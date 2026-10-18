import type { SeedBundle } from '../starterSeeds.js';
import { socialPresentation } from '../starterSeeds.js';
import { plainDoc } from '../widgetElements.js';
import { artHtml, artLayer, buttonLayer, curatedCardSeed, kickerStyle, textLayer, titleStyle } from './kit.js';

function navBar(prefix: string, y: number): ReturnType<typeof buttonLayer>[] {
  const opt = { fill: 'rgba(255,255,255,0.12)', color: '#ffffff' };
  return [
    buttonLayer(`${prefix}_nav_h`, { x: 16, y, w: 100, h: 32, z: 10 }, 'Home', opt, {
      behavior: 'page.go',
      goTo: 'page:0'
    }),
    buttonLayer(`${prefix}_nav_a`, { x: 122, y, w: 100, h: 32, z: 11 }, 'About', opt, {
      behavior: 'page.go',
      goTo: 'page:1'
    }),
    buttonLayer(`${prefix}_nav_c`, { x: 228, y, w: 100, h: 32, z: 12 }, 'Contact', opt, {
      behavior: 'page.go',
      goTo: 'page:2'
    })
  ];
}

/** Home / About / Contact multipage site with nav on each page (vertical swipe). */
export function seedWebsiteDoc(): SeedBundle {
  const base = curatedCardSeed([]);
  const presentation = socialPresentation({
    backgroundColor: '#0f172a',
    textAlign: 'left',
    fontSize: 28,
    textColor: '#f8fafc',
    padding: 0,
    dropShadowBlur: 0
  });
  const home = [
    artLayer(
      'ws_home_art',
      artHtml(
        'linear-gradient(160deg,#0f766e 0%,#1e3a8a 55%,#312e81 100%)',
        '<div class="s" style="width:240px;height:240px;right:-80px;top:-60px;background:rgba(255,255,255,0.12)"></div>'
      )
    ),
    ...navBar('ws_home', 12),
    textLayer('ws_home_k', { x: 24, y: 56, w: 280, h: 24, z: 3 }, 'WELCOME', kickerStyle),
    textLayer('ws_home_t', { x: 24, y: 84, w: 312, h: 72, z: 4 }, 'Build a calm corner of the web', titleStyle),
    textLayer('ws_home_f1', { x: 24, y: 170, w: 100, h: 80, z: 5 }, 'Fast', titleStyle),
    textLayer('ws_home_f2', { x: 130, y: 170, w: 100, h: 80, z: 6 }, 'Private', titleStyle),
    textLayer('ws_home_f3', { x: 236, y: 170, w: 100, h: 80, z: 7 }, 'Yours', titleStyle),
    buttonLayer(
      'ws_home_faq',
      { x: 24, y: 270, w: 160, h: 36, z: 8 },
      'FAQ',
      { fill: 'rgba(255,255,255,0.16)', color: '#fff' },
      { behavior: 'widget.reveal', revealLayerId: 'ws_home_faq_a', revealMode: 'tab' }
    ),
    textLayer(
      'ws_home_faq_a',
      { x: 24, y: 314, w: 312, h: 40, z: 9 },
      'You own the keys. We never see your passcode.',
      kickerStyle,
      { visible: false }
    )
  ];
  const about = [
    artLayer(
      'ws_about_art',
      artHtml('linear-gradient(145deg,#1c1917 0%,#44403c 100%)', '<div class="s" style="width:160px;height:160px;left:-40px;bottom:-40px;background:rgba(255,255,255,0.08)"></div>')
    ),
    ...navBar('ws_about', 12),
    textLayer('ws_about_t', { x: 24, y: 64, w: 312, h: 120, z: 3 }, 'We help creators publish without surrendering their identity.', titleStyle)
  ];
  const contact = [
    artLayer(
      'ws_contact_art',
      artHtml('linear-gradient(135deg,#fef3c7 0%,#fde68a 100%)', '<div style="position:absolute;inset:0;background:rgba(15,23,42,0.55)"></div>')
    ),
    ...navBar('ws_contact', 12),
    textLayer('ws_contact_t', { x: 24, y: 64, w: 312, h: 48, z: 3 }, 'Say hello', titleStyle),
    {
      id: 'ws_contact_in',
      kind: 'text',
      widgetElement: 'input',
      name: 'Message',
      label: 'Your message…',
      x: 24,
      y: 130,
      w: 312,
      h: 80,
      zIndex: 4,
      positionLocked: false,
      backgroundColor: '#ffffff',
      textColor: '#111827',
      cornerRadius: 8
    },
    buttonLayer(
      'ws_contact_send',
      { x: 24, y: 224, w: 120, h: 40, z: 5 },
      'Send',
      { fill: '#0f766e', color: '#fff' },
      { behavior: 'widget.submit' }
    )
  ];
  return {
    seedPageLayout: base.seedPageLayout,
    seedPagePresentation: presentation,
    seedSections: [
      { slug: 'home', doc: plainDoc(''), layers: home },
      { slug: 'about', doc: plainDoc(''), layers: about },
      { slug: 'contact', doc: plainDoc(''), layers: contact }
    ]
  };
}
