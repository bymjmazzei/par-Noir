import type { SeedBundle } from '../starterSeeds.js';
import type { PenTemplate } from '../templates.js';
import { proseStarter, withSeedBundle } from './registerHelpers.js';
import * as polls from './polls.js';
import * as quizzes from './quizzes.js';
import * as events from './events.js';
import * as links from './links.js';
import * as forms from './forms.js';
import * as community from './community.js';
import * as social from './social.js';
import * as creator from './creator.js';
import * as website from './website.js';
import * as education from './education.js';
import * as utilities from './utilities.js';
import * as legacy from './legacy.js';

export type CuratedWidgetCategory =
  | 'polls'
  | 'quizzes'
  | 'events'
  | 'links'
  | 'forms'
  | 'community'
  | 'social'
  | 'creator'
  | 'website'
  | 'education'
  | 'utilities';

export const CURATED_WIDGET_CATEGORIES: { id: CuratedWidgetCategory; label: string }[] = [
  { id: 'polls', label: 'Polls' },
  { id: 'quizzes', label: 'Quizzes & games' },
  { id: 'events', label: 'Events' },
  { id: 'links', label: 'Links' },
  { id: 'forms', label: 'Forms' },
  { id: 'community', label: 'Community' },
  { id: 'social', label: 'Social posts' },
  { id: 'creator', label: 'Creator' },
  { id: 'website', label: 'Website sections' },
  { id: 'education', label: 'Education' },
  { id: 'utilities', label: 'Utilities' }
];

type Entry = {
  id: string;
  category: CuratedWidgetCategory;
  title: string;
  description: string;
  focus: string;
  seed: () => SeedBundle;
};

const LEGACY: Record<string, () => SeedBundle> = {
  'widget.poll_writein.v1': legacy.seedPollWriteInWidget,
  'widget.quiz.v1': legacy.seedQuizWidget,
  'widget.rsvp.v1': legacy.seedRsvpWidget,
  'widget.link_card.v1': legacy.seedLinkCardWidget
};

const META: Omit<Entry, 'seed'>[] = [
  {
    "id": "widget.poll_quick.v1",
    "category": "polls",
    "title": "Quick poll",
    "description": "One question and three tap options.",
    "focus": "Keep the three vote buttons.",
    "seed": "seedPollQuick"
  },
  {
    "id": "widget.poll_writein.v1",
    "category": "polls",
    "title": "Poll with write-in",
    "description": "Three options, Other field, countdown.",
    "focus": "Keep vote buttons and write-in.",
    "seed": "seedPollWriteInWidget"
  },
  {
    "id": "widget.poll_thisorthat.v1",
    "category": "polls",
    "title": "This or that",
    "description": "Pick between two bold options.",
    "focus": "Two vote buttons only.",
    "seed": "seedPollThisorthat"
  },
  {
    "id": "widget.poll_rating.v1",
    "category": "polls",
    "title": "Rating scale",
    "description": "Rate from 1 to 5.",
    "focus": "Five vote buttons in a row.",
    "seed": "seedPollRating"
  },
  {
    "id": "widget.poll_hottake.v1",
    "category": "polls",
    "title": "Hot take meter",
    "description": "Agree or disagree on a spicy prompt.",
    "focus": "Two vote buttons.",
    "seed": "seedPollHottake"
  },
  {
    "id": "widget.poll_hidden.v1",
    "category": "polls",
    "title": "Hidden result poll",
    "description": "Vote first, reveal totals after.",
    "focus": "Reveal shows results text.",
    "seed": "seedPollHidden"
  },
  {
    "id": "widget.poll_rank.v1",
    "category": "polls",
    "title": "Rank favorites",
    "description": "Rank three items with drag-free taps.",
    "focus": "Rank trigger on options.",
    "seed": "seedPollRank"
  },
  {
    "id": "widget.poll_budget.v1",
    "category": "polls",
    "title": "Budget split",
    "description": "Allocate points across three buckets.",
    "focus": "Allocate trigger.",
    "seed": "seedPollBudget"
  },
  {
    "id": "widget.quiz.v1",
    "category": "quizzes",
    "title": "Trivia quiz",
    "description": "Three answers, one correct, reveal explanation.",
    "focus": "Mark correct answer.",
    "seed": "seedQuizWidget"
  },
  {
    "id": "widget.quiz_truefalse.v1",
    "category": "quizzes",
    "title": "True or false",
    "description": "A single statement to judge.",
    "focus": "Two answer buttons.",
    "seed": "seedQuizTruefalse"
  },
  {
    "id": "widget.quiz_image.v1",
    "category": "quizzes",
    "title": "Guess the image",
    "description": "Blur lifts on reveal.",
    "focus": "Reveal target is art caption.",
    "seed": "seedQuizImage"
  },
  {
    "id": "widget.quiz_riddle.v1",
    "category": "quizzes",
    "title": "Riddle of the day",
    "description": "Riddle with hidden answer.",
    "focus": "Reveal shows answer.",
    "seed": "seedQuizRiddle"
  },
  {
    "id": "widget.quiz_personality.v1",
    "category": "quizzes",
    "title": "Personality pick",
    "description": "Choose the vibe that fits you.",
    "focus": "Three vote options.",
    "seed": "seedQuizPersonality"
  },
  {
    "id": "widget.quiz_multi.v1",
    "category": "quizzes",
    "title": "Multi-question quiz",
    "description": "Step through questions with score.",
    "focus": "Step + answer + score.",
    "seed": "seedQuizMulti"
  },
  {
    "id": "widget.quiz_uncover.v1",
    "category": "quizzes",
    "title": "Tap to uncover",
    "description": "Toggle hidden message.",
    "focus": "Toggle reveal mode.",
    "seed": "seedQuizUncover"
  },
  {
    "id": "widget.rsvp.v1",
    "category": "events",
    "title": "RSVP",
    "description": "Going, Maybe, Can't go with countdown.",
    "focus": "Edit event copy and countdown.",
    "seed": "seedRsvpWidget"
  },
  {
    "id": "widget.event_launch.v1",
    "category": "events",
    "title": "Launch countdown",
    "description": "Countdown with notify CTA.",
    "focus": "Open link on notify.",
    "seed": "seedEventLaunch"
  },
  {
    "id": "widget.event_live.v1",
    "category": "events",
    "title": "Live now banner",
    "description": "Wide banner for a live stream.",
    "focus": "Open stream link.",
    "seed": "seedEventLive"
  },
  {
    "id": "widget.event_checkin.v1",
    "category": "events",
    "title": "Event check-in",
    "description": "Stamp when you arrive.",
    "focus": "Stamp trigger.",
    "seed": "seedEventCheckin"
  },
  {
    "id": "widget.event_savedate.v1",
    "category": "events",
    "title": "Save the date",
    "description": "Add to calendar button.",
    "focus": "Calendar CTA.",
    "seed": "seedEventSavedate"
  },
  {
    "id": "widget.event_agenda.v1",
    "category": "events",
    "title": "Agenda card",
    "description": "Three agenda items revealed.",
    "focus": "Tab reveal per item.",
    "seed": "seedEventAgenda"
  },
  {
    "id": "widget.link_card.v1",
    "category": "links",
    "title": "Link card",
    "description": "Headline and open button.",
    "focus": "Set open URL.",
    "seed": "seedLinkCardWidget"
  },
  {
    "id": "widget.link_bio.v1",
    "category": "links",
    "title": "Link in bio",
    "description": "Three links stacked.",
    "focus": "Three open buttons.",
    "seed": "seedLinkBio"
  },
  {
    "id": "widget.link_teaser.v1",
    "category": "links",
    "title": "Read more teaser",
    "description": "Teaser with reveal body.",
    "focus": "Reveal long copy.",
    "seed": "seedLinkTeaser"
  },
  {
    "id": "widget.link_appbadge.v1",
    "category": "links",
    "title": "App badge",
    "description": "Download badge CTA.",
    "focus": "Open store link.",
    "seed": "seedLinkAppbadge"
  },
  {
    "id": "widget.link_swipeup.v1",
    "category": "links",
    "title": "Story swipe-up",
    "description": "Tall story CTA.",
    "focus": "Open link.",
    "seed": "seedLinkSwipeup"
  },
  {
    "id": "widget.link_message.v1",
    "category": "links",
    "title": "Message me",
    "description": "Start a conversation.",
    "focus": "Open messaging handoff.",
    "seed": "seedLinkMessage"
  },
  {
    "id": "widget.form_newsletter.v1",
    "category": "forms",
    "title": "Newsletter",
    "description": "Email field and subscribe.",
    "focus": "Submit sends row.",
    "seed": "seedFormNewsletter"
  },
  {
    "id": "widget.form_contact.v1",
    "category": "forms",
    "title": "Contact",
    "description": "Name, email, message.",
    "focus": "Submit form.",
    "seed": "seedFormContact"
  },
  {
    "id": "widget.form_feedback.v1",
    "category": "forms",
    "title": "Feedback box",
    "description": "Short feedback field.",
    "focus": "Submit.",
    "seed": "seedFormFeedback"
  },
  {
    "id": "widget.form_waitlist.v1",
    "category": "forms",
    "title": "Waitlist",
    "description": "Join waitlist field.",
    "focus": "Submit.",
    "seed": "seedFormWaitlist"
  },
  {
    "id": "widget.form_quote.v1",
    "category": "forms",
    "title": "Request a quote",
    "description": "Project details field.",
    "focus": "Submit.",
    "seed": "seedFormQuote"
  },
  {
    "id": "widget.form_multistep.v1",
    "category": "forms",
    "title": "Multi-step form",
    "description": "Three steps with next.",
    "focus": "Step through fields.",
    "seed": "seedFormMultistep"
  },
  {
    "id": "widget.community_features.v1",
    "category": "community",
    "title": "Feature board",
    "description": "Rank three feature ideas.",
    "focus": "Rank buttons.",
    "seed": "seedCommunityFeatures"
  },
  {
    "id": "widget.community_guestbook.v1",
    "category": "community",
    "title": "Guestbook",
    "description": "Sign with stamp + note.",
    "focus": "Stamp and input.",
    "seed": "seedCommunityGuestbook"
  },
  {
    "id": "widget.community_challenge.v1",
    "category": "community",
    "title": "Challenge tracker",
    "description": "Toggle daily habits.",
    "focus": "Toggle rows.",
    "seed": "seedCommunityChallenge"
  },
  {
    "id": "widget.community_reactions.v1",
    "category": "community",
    "title": "Reaction bar",
    "description": "Pick a reaction.",
    "focus": "Vote options.",
    "seed": "seedCommunityReactions"
  },
  {
    "id": "widget.community_ama.v1",
    "category": "community",
    "title": "AMA box",
    "description": "Ask a question field.",
    "focus": "Submit question.",
    "seed": "seedCommunityAma"
  },
  {
    "id": "widget.social_quote.v1",
    "category": "social",
    "title": "Quote card",
    "description": "Pull quote typography.",
    "focus": "Open source link.",
    "seed": "seedSocialQuote"
  },
  {
    "id": "widget.social_announce.v1",
    "category": "social",
    "title": "Announcement",
    "description": "Bold news headline.",
    "focus": "Open details.",
    "seed": "seedSocialAnnounce"
  },
  {
    "id": "widget.social_beforeafter.v1",
    "category": "social",
    "title": "Before / after",
    "description": "Tab between two shots.",
    "focus": "Tab reveal.",
    "seed": "seedSocialBeforeafter"
  },
  {
    "id": "widget.social_tip.v1",
    "category": "social",
    "title": "Tip of the day",
    "description": "Hidden tip on tap.",
    "focus": "Reveal tip.",
    "seed": "seedSocialTip"
  },
  {
    "id": "widget.social_stat.v1",
    "category": "social",
    "title": "Stat highlight",
    "description": "Big number story.",
    "focus": "Open report.",
    "seed": "seedSocialStat"
  },
  {
    "id": "widget.social_bts.v1",
    "category": "social",
    "title": "Behind the scenes",
    "description": "Photo with caption reveal.",
    "focus": "Reveal caption.",
    "seed": "seedSocialBts"
  },
  {
    "id": "widget.social_milestone.v1",
    "category": "social",
    "title": "Milestone",
    "description": "Celebrate with stamp.",
    "focus": "Stamp celebration.",
    "seed": "seedSocialMilestone"
  },
  {
    "id": "widget.creator_product.v1",
    "category": "creator",
    "title": "Product card",
    "description": "Product pitch and buy link.",
    "focus": "Open shop.",
    "seed": "seedCreatorProduct"
  },
  {
    "id": "widget.creator_tipjar.v1",
    "category": "creator",
    "title": "Tip jar",
    "description": "Support link.",
    "focus": "Open tip URL.",
    "seed": "seedCreatorTipjar"
  },
  {
    "id": "widget.creator_portfolio.v1",
    "category": "creator",
    "title": "Portfolio piece",
    "description": "Case study teaser.",
    "focus": "Open project.",
    "seed": "seedCreatorPortfolio"
  },
  {
    "id": "widget.web_nav.v1",
    "category": "website",
    "title": "Nav bar",
    "description": "Home About Contact links.",
    "focus": "Page go buttons.",
    "seed": "seedWebNav"
  },
  {
    "id": "widget.web_hero.v1",
    "category": "website",
    "title": "Hero",
    "description": "Hero headline band.",
    "focus": "Open CTA.",
    "seed": "seedWebHero"
  },
  {
    "id": "widget.web_features.v1",
    "category": "website",
    "title": "Feature grid",
    "description": "Three feature blurbs.",
    "focus": "Static layout.",
    "seed": "seedWebFeatures"
  },
  {
    "id": "widget.web_testimonial.v1",
    "category": "website",
    "title": "Testimonial",
    "description": "Quote from a customer.",
    "focus": "Open case study.",
    "seed": "seedWebTestimonial"
  },
  {
    "id": "widget.web_pricing.v1",
    "category": "website",
    "title": "Pricing tiers",
    "description": "Three plan buttons.",
    "focus": "Open checkout links.",
    "seed": "seedWebPricing"
  },
  {
    "id": "widget.web_team.v1",
    "category": "website",
    "title": "Team",
    "description": "Three team cards.",
    "focus": "Open profiles.",
    "seed": "seedWebTeam"
  },
  {
    "id": "widget.web_gallery.v1",
    "category": "website",
    "title": "Gallery carousel",
    "description": "Step through slides.",
    "focus": "Step frames.",
    "seed": "seedWebGallery"
  },
  {
    "id": "widget.web_contact.v1",
    "category": "website",
    "title": "Contact section",
    "description": "Contact form strip.",
    "focus": "Submit.",
    "seed": "seedWebContact"
  },
  {
    "id": "widget.web_footer.v1",
    "category": "website",
    "title": "Footer",
    "description": "Links and copyright.",
    "focus": "Open links.",
    "seed": "seedWebFooter"
  },
  {
    "id": "widget.web_stats.v1",
    "category": "website",
    "title": "Stats strip",
    "description": "Three metrics banner.",
    "focus": "Open report.",
    "seed": "seedWebStats"
  },
  {
    "id": "widget.web_logos.v1",
    "category": "website",
    "title": "Logo wall",
    "description": "Partner logos row.",
    "focus": "Open partners.",
    "seed": "seedWebLogos"
  },
  {
    "id": "widget.web_cta.v1",
    "category": "website",
    "title": "CTA band",
    "description": "Full-width call to action.",
    "focus": "Open signup.",
    "seed": "seedWebCta"
  },
  {
    "id": "widget.web_faq.v1",
    "category": "website",
    "title": "FAQ accordion",
    "description": "Questions with tab answers.",
    "focus": "Tab reveal.",
    "seed": "seedWebFaq"
  },
  {
    "id": "widget.web_tabs.v1",
    "category": "website",
    "title": "Tabs section",
    "description": "Switch tab panels.",
    "focus": "Tab reveal.",
    "seed": "seedWebTabs"
  },
  {
    "id": "widget.edu_flashcard.v1",
    "category": "education",
    "title": "Flashcard",
    "description": "Term with toggle definition.",
    "focus": "Toggle back.",
    "seed": "seedEduFlashcard"
  },
  {
    "id": "widget.edu_deck.v1",
    "category": "education",
    "title": "Flashcard deck",
    "description": "Step through cards.",
    "focus": "Step + toggle.",
    "seed": "seedEduDeck"
  },
  {
    "id": "widget.edu_checklist.v1",
    "category": "education",
    "title": "Lesson checklist",
    "description": "Toggle lesson items.",
    "focus": "Toggle rows.",
    "seed": "seedEduChecklist"
  },
  {
    "id": "widget.edu_check.v1",
    "category": "education",
    "title": "Knowledge check",
    "description": "One question quiz.",
    "focus": "Answer buttons.",
    "seed": "seedEduCheck"
  },
  {
    "id": "widget.edu_vocab.v1",
    "category": "education",
    "title": "Vocabulary card",
    "description": "Word and reveal meaning.",
    "focus": "Reveal definition.",
    "seed": "seedEduVocab"
  },
  {
    "id": "widget.util_countdown.v1",
    "category": "utilities",
    "title": "Countdown",
    "description": "Event countdown clock.",
    "focus": "Edit end time.",
    "seed": "seedUtilCountdown"
  },
  {
    "id": "widget.util_clock.v1",
    "category": "utilities",
    "title": "Clock",
    "description": "Live clock face.",
    "focus": "Set clock time.",
    "seed": "seedUtilClock"
  },
  {
    "id": "widget.util_banner.v1",
    "category": "utilities",
    "title": "Announcement banner",
    "description": "Wide promo strip.",
    "focus": "Open link.",
    "seed": "seedUtilBanner"
  },
  {
    "id": "widget.util_checklist.v1",
    "category": "utilities",
    "title": "Checklist",
    "description": "Toggle tasks.",
    "focus": "Toggle items.",
    "seed": "seedUtilChecklist"
  },
  {
    "id": "widget.util_tally.v1",
    "category": "utilities",
    "title": "Tally counter",
    "description": "Increment counter stamps.",
    "focus": "Stamp tally.",
    "seed": "seedUtilTally"
  }
];

export const CURATED_WIDGET_ENTRIES: Entry[] = META.map((row) => {
  const mod = { ...polls, ...quizzes, ...events, ...links, ...forms, ...community, ...social, ...creator, ...website, ...education, ...utilities, ...legacy } as Record<string, () => SeedBundle>;
  const legacyFn = LEGACY[row.id];
  const fn = legacyFn || mod[row.seed];
  if (!fn) throw new Error(`missing seed ${row.seed} for ${row.id}`);
  return { ...row, seed: fn };
});

export const CURATED_WIDGET_IDS = CURATED_WIDGET_ENTRIES.map((e) => e.id);

export function curatedWidgetTemplates(): PenTemplate[] {
  return CURATED_WIDGET_ENTRIES.map((entry) =>
    withSeedBundle(
      {
        id: entry.id,
        classId: 'widgets.widget',
        docType: 'widget',
        version: '1',
        title: entry.title,
        description: entry.description,
        widgetCategory: entry.category,
        sections: [{ slug: 'card', title: 'Card', required: true }],
        seedGalleryAspect: entry.id.includes('swipeup') ? '9/16' : entry.id.includes('banner') || entry.id.includes('live') || entry.id.includes('stats') || entry.id.includes('cta') || entry.id.includes('logos') ? '16/9' : '1/1',
        agentStarter: proseStarter({ title: entry.title, focus: entry.focus })
      },
      entry.seed()
    )
  );
}

export {
  seedPollWriteInWidget,
  seedQuizWidget,
  seedRsvpWidget,
  seedLinkCardWidget
} from './legacy.js';
