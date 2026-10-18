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

/** Matches the art frame: square 360x360, story 360x640, banner 360x120. */
export type CuratedWidgetSize = 'square' | 'story' | 'banner';

type Entry = {
  id: string;
  category: CuratedWidgetCategory;
  size: CuratedWidgetSize;
  title: string;
  description: string;
  focus: string;
  seed: () => SeedBundle;
};

const ASPECT: Record<CuratedWidgetSize, NonNullable<PenTemplate['seedGalleryAspect']>> = {
  square: '1/1',
  story: '9/16',
  banner: '16/9'
};

function w(
  id: string,
  category: CuratedWidgetCategory,
  title: string,
  description: string,
  focus: string,
  seed: () => SeedBundle,
  size: CuratedWidgetSize = 'square'
): Entry {
  return { id: `widget.${id}.v1`, category, size, title, description, focus, seed };
}

export const CURATED_WIDGET_ENTRIES: Entry[] = [
  w('poll_quick', 'polls', 'Quick poll', 'One question, three tap-to-vote answers.', 'Edit the question and the three vote buttons.', polls.seedPollQuick),
  w('poll_writein', 'polls', 'Poll with write-in', 'Three options, an Other field, and a closing countdown.', 'Keep the vote buttons and the write-in.', polls.seedPollWriteInWidget),
  w('poll_thisorthat', 'polls', 'This or that', 'Two bold halves; tap the one you pick.', 'Edit the two choices.', polls.seedPollThisorthat),
  w('poll_rating', 'polls', 'Rating scale', 'Rate from 1 to 5 with labelled ends.', 'Edit the prompt and scale labels.', polls.seedPollRating),
  w('poll_hottake', 'polls', 'Hot take meter', 'A spicy prompt with Agree and Disagree.', 'Edit the take.', polls.seedPollHottake),
  w('poll_hidden', 'polls', 'Hidden result poll', 'Vote first, then reveal how others voted.', 'Update the reveal text with results.', polls.seedPollHidden),
  w('poll_rank', 'polls', 'Rank favorites', 'Tap items in order to rank them.', 'Edit the items to rank.', polls.seedPollRank),
  w('poll_budget', 'polls', 'Budget split', 'Spread a fixed budget across buckets.', 'Edit the buckets and total.', polls.seedPollBudget),
  w('quiz', 'quizzes', 'Trivia quiz', 'Three answers, one correct, with an explanation.', 'Mark the correct answer.', quizzes.seedQuizWidget),
  w('quiz_truefalse', 'quizzes', 'True or false', 'A single statement to judge.', 'Edit the statement and correct side.', quizzes.seedQuizTruefalse),
  w('quiz_image', 'quizzes', 'Guess the image', 'Name the landmark from the art.', 'Edit the art and answers.', quizzes.seedQuizImage),
  w('quiz_riddle', 'quizzes', 'Riddle of the day', 'A riddle with a hidden answer.', 'Edit the riddle and answer.', quizzes.seedQuizRiddle),
  w('quiz_personality', 'quizzes', 'Personality pick', 'Choose the vibe that fits you.', 'Edit the three vibes.', quizzes.seedQuizPersonality),
  w('quiz_multi', 'quizzes', 'Multi-question quiz', 'Three questions with a running score, then send it.', 'Edit each question frame.', quizzes.seedQuizMulti),
  w('quiz_uncover', 'quizzes', 'Tap to uncover', 'Tap to uncover a hidden code.', 'Edit the hidden message.', quizzes.seedQuizUncover),
  w('rsvp', 'events', 'RSVP', "Going, Maybe, Can't go with a countdown.", 'Edit event copy and countdown.', events.seedRsvpWidget),
  w('event_launch', 'events', 'Launch countdown', 'Countdown to launch with a calendar reminder.', 'Edit the launch date.', events.seedEventLaunch),
  w('event_live', 'events', 'Live now banner', 'Wide banner pointing to a live stream.', 'Set the stream link.', events.seedEventLive, 'banner'),
  w('event_checkin', 'events', 'Event check-in', 'Stamp when you arrive.', 'Edit the event name.', events.seedEventCheckin),
  w('event_savedate', 'events', 'Save the date', 'Date, place, and Add to calendar.', 'Set the event start.', events.seedEventSavedate),
  w('event_agenda', 'events', 'Agenda card', 'Three sessions; tap one to see details.', 'Edit the sessions.', events.seedEventAgenda),
  w('link_card', 'links', 'Link card', 'Headline and an open button.', 'Set the open URL.', links.seedLinkCardWidget),
  w('link_bio', 'links', 'Link in bio', 'Avatar, a short bio, and four stacked links.', 'Set the link URLs.', links.seedLinkBio),
  w('link_teaser', 'links', 'Read more teaser', 'A teaser that expands, then links out.', 'Edit the teaser and link.', links.seedLinkTeaser),
  w('link_appbadge', 'links', 'App badge', 'App icon with store badges.', 'Set the store links.', links.seedLinkAppbadge),
  w('link_swipeup', 'links', 'Story swipe-up', 'Tall story card with a swipe-up link.', 'Set the link.', links.seedLinkSwipeup, 'story'),
  w('link_message', 'links', 'Message me', 'Start a direct conversation.', 'Edit the invite copy.', links.seedLinkMessage),
  w('form_newsletter', 'forms', 'Newsletter', 'Email field and Subscribe.', 'Edit the pitch.', forms.seedFormNewsletter),
  w('form_contact', 'forms', 'Contact', 'Name, email, and message.', 'Edit the fields.', forms.seedFormContact),
  w('form_feedback', 'forms', 'Feedback box', 'An open question and a feedback field.', 'Edit the prompt.', forms.seedFormFeedback),
  w('form_waitlist', 'forms', 'Waitlist', 'Join the waitlist by email.', 'Edit the product copy.', forms.seedFormWaitlist),
  w('form_quote', 'forms', 'Request a quote', 'Project details and budget.', 'Edit the fields.', forms.seedFormQuote),
  w('form_multistep', 'forms', 'Multi-step form', 'Three short steps, then submit.', 'Edit each step.', forms.seedFormMultistep),
  w('community_features', 'community', 'Feature board', 'Rank the ideas you want most.', 'Edit the ideas.', community.seedCommunityFeatures),
  w('community_guestbook', 'community', 'Guestbook', 'Leave a note in the guestbook.', 'Edit the welcome copy.', community.seedCommunityGuestbook),
  w('community_challenge', 'community', 'Challenge tracker', 'Tick off each day of the week.', 'Edit the challenge.', community.seedCommunityChallenge),
  w('community_reactions', 'community', 'Reaction bar', 'Pick a reaction.', 'Edit the prompt.', community.seedCommunityReactions),
  w('community_ama', 'community', 'AMA box', 'Ask a question for the next AMA.', 'Edit the host and date.', community.seedCommunityAma),
  w('social_quote', 'social', 'Quote card', 'Pull quote with attribution.', 'Edit the quote and source link.', social.seedSocialQuote),
  w('social_announce', 'social', 'Announcement', 'Bold news, what changes, and a details link.', 'Edit the news.', social.seedSocialAnnounce),
  w('social_beforeafter', 'social', 'Before / after', 'Tab between two states.', 'Edit both panels.', social.seedSocialBeforeafter),
  w('social_tip', 'social', 'Tip of the day', 'Tap to reveal the tip.', 'Edit the tip.', social.seedSocialTip),
  w('social_stat', 'social', 'Stat highlight', 'One big number with context.', 'Edit the number and source.', social.seedSocialStat),
  w('social_bts', 'social', 'Behind the scenes', 'A scene with a caption reveal.', 'Edit the caption.', social.seedSocialBts),
  w('social_milestone', 'social', 'Milestone', 'Celebrate a milestone with a stamp.', 'Edit the milestone.', social.seedSocialMilestone),
  w('creator_product', 'creator', 'Product card', 'Product, price, and Buy.', 'Edit the product and shop link.', creator.seedCreatorProduct),
  w('creator_tipjar', 'creator', 'Tip jar', 'Three tip amounts.', 'Set the tip links.', creator.seedCreatorTipjar),
  w('creator_portfolio', 'creator', 'Portfolio piece', 'A project, your role, and the case study.', 'Edit the project.', creator.seedCreatorPortfolio),
  w('web_nav', 'website', 'Nav bar', 'Wordmark with Home, About, and Contact.', 'Keep the page links.', website.seedWebNav, 'banner'),
  w('web_hero', 'website', 'Hero', 'Headline, subhead, and two CTAs.', 'Edit the headline and CTA link.', website.seedWebHero),
  w('web_features', 'website', 'Feature grid', 'Three feature tiles.', 'Edit each tile.', website.seedWebFeatures),
  w('web_testimonial', 'website', 'Testimonial', 'A customer quote with stars.', 'Edit the quote and person.', website.seedWebTestimonial),
  w('web_pricing', 'website', 'Pricing tiers', 'Free, Pro, and Team plans.', 'Edit prices and checkout links.', website.seedWebPricing),
  w('web_team', 'website', 'Team', 'Three people and Join us.', 'Edit names and roles.', website.seedWebTeam),
  w('web_gallery', 'website', 'Gallery carousel', 'Step through three slides.', 'Edit each slide.', website.seedWebGallery),
  w('web_contact', 'website', 'Contact section', 'Contact details and a short form.', 'Edit the details.', website.seedWebContact),
  w('web_footer', 'website', 'Footer', 'Links and copyright.', 'Set the links.', website.seedWebFooter, 'banner'),
  w('web_stats', 'website', 'Stats strip', 'Three numbers across a banner.', 'Edit the numbers.', website.seedWebStats, 'banner'),
  w('web_logos', 'website', 'Logo wall', 'Partner wordmarks in a row.', 'Edit the partner names.', website.seedWebLogos, 'banner'),
  w('web_cta', 'website', 'CTA band', 'Full-width call to action.', 'Edit the headline and link.', website.seedWebCta, 'banner'),
  w('web_faq', 'website', 'FAQ accordion', 'Three questions; tap to open an answer.', 'Edit questions and answers.', website.seedWebFaq),
  w('web_tabs', 'website', 'Tabs section', 'Three tabs, each with its own panel.', 'Edit each tab.', website.seedWebTabs),
  w('edu_flashcard', 'education', 'Flashcard', 'A term; flip for the definition.', 'Edit the term and definition.', education.seedEduFlashcard),
  w('edu_deck', 'education', 'Flashcard deck', 'Three cards with answers and Prev/Next.', 'Edit each card.', education.seedEduDeck),
  w('edu_checklist', 'education', 'Lesson checklist', 'Four lesson tasks to tick off.', 'Edit the tasks.', education.seedEduChecklist),
  w('edu_check', 'education', 'Knowledge check', 'One question, three answers, and a score.', 'Mark the correct answer.', education.seedEduCheck),
  w('edu_vocab', 'education', 'Vocabulary card', 'A word with its meaning and an example.', 'Edit the word.', education.seedEduVocab),
  w('util_countdown', 'utilities', 'Countdown', 'A large countdown to your event.', 'Set the end time.', utilities.seedUtilCountdown),
  w('util_clock', 'utilities', 'Clock', 'Two cities side by side.', 'Set the cities and times.', utilities.seedUtilClock),
  w('util_banner', 'utilities', 'Announcement banner', 'A one-line notice with Learn more.', 'Edit the notice and link.', utilities.seedUtilBanner, 'banner'),
  w('util_checklist', 'utilities', 'Checklist', 'Five items to tick off.', 'Edit the items.', utilities.seedUtilChecklist),
  w('util_tally', 'utilities', 'Tally counter', 'Tap +1 to count.', 'Edit what you count.', utilities.seedUtilTally)
];

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
        seedGalleryAspect: ASPECT[entry.size],
        agentStarter: proseStarter({ title: entry.title, focus: entry.focus })
      },
      entry.seed()
    )
  );
}

export { seedPollWriteInWidget } from './polls.js';
export { seedQuizWidget } from './quizzes.js';
export { seedRsvpWidget } from './events.js';
export { seedLinkCardWidget } from './links.js';
