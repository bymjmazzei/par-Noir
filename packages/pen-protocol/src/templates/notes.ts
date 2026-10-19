import type { PenTemplate } from '../templates.js';
import {
  FRAMES,
  artHtml,
  box,
  buttonLayer,
  countdownLayer,
  embedWidget,
  eventStartIn,
  motion,
  pageArt,
  pageSeed,
  panelLayer,
  textLayer,
  themes
} from '../curated/kit.js';
import { seedPollWriteInWidget } from '../curated/polls.js';
import { chipLayer, postTemplate } from './shared.js';

function openQuestion(): PenTemplate {
  const f = FRAMES.portrait;
  const muted = 'rgba(236,253,245,0.72)';
  return postTemplate({
    id: 'note.open_question.v1',
    classId: 'social.note',
    title: 'Open question',
    description: 'Ask your audience to vote, with a write-in for ideas you missed.',
    aspect: 'portrait',
    featured: true,
    focus:
      'Write a short headline that says what you are deciding, one line on why their vote matters, and the poll question. Keep three answer options under four words each.',
    seed: pageSeed(f, [
      {
        slug: 'body',
        layers: [
          pageArt(
            'oq_art',
            artHtml(
              'linear-gradient(170deg,#022c22 0%,#064e3b 55%,#0f172a 100%)',
              '<div class="q">?</div><div class="s" style="width:90px;height:90px;left:250px;top:150px;background:rgba(253,230,138,0.18)"></div><div class="s" style="width:14px;height:14px;left:40px;top:250px;background:#fde68a"></div>',
              '.q{position:absolute;right:18px;top:6px;font:700 180px/1 Georgia,serif;color:rgba(253,230,138,0.14)}'
            ),
            f
          ),
          chipLayer('oq_kicker', box(24, 40, 132, 26, 2), 'ROADMAP · Q3', '#fde68a', '#022c22'),
          motion(
            textLayer('oq_head', box(24, 82, 312, 96, 3), 'We are planning Q3 and want your vote.', { family: 'serif', size: 28, color: '#ecfdf5', bold: true }),
            { in: 'rise' }
          ),
          textLayer('oq_sub', box(24, 186, 312, 60, 4), 'Pick the one you would use every week, or tell us what we missed.', { size: 14, color: muted }),
          ...embedWidget('oq_poll', 'widget.poll_writein.v1', 'Poll', seedPollWriteInWidget, { x: 18, y: 270, scale: 0.9, z: 10 }),
          textLayer('oq_foot', box(24, 606, 312, 20, 30), 'Voting closes Friday. Results go up Monday.', { size: 11, color: muted })
        ]
      }
    ])
  });
}

function hotTake(): PenTemplate {
  const f = FRAMES.square;
  const ink = '#0b0b0c';
  return postTemplate({
    id: 'note.hot_take.v1',
    classId: 'social.note',
    title: 'Hot take',
    description: 'One bold opinion, an Agree stamp, and your reasoning behind a tap.',
    aspect: 'square',
    featured: true,
    focus:
      'Write one opinion in a single sentence under 14 words, a byline with name and role, and a two-sentence reason that appears when readers tap Why.',
    seed: pageSeed(
      f,
      [
        {
          slug: 'body',
          layers: [
            pageArt(
              'ht_art',
              artHtml(
                '#facc15',
                '<div class="mark">&ldquo;</div><div class="r" style="left:0;right:0;bottom:0;height:8px;background:#0b0b0c"></div>',
                '.mark{position:absolute;right:12px;top:-40px;font:700 260px/1 Georgia,serif;color:rgba(11,11,12,0.1)}'
              ),
              f
            ),
            chipLayer('ht_kicker', box(24, 24, 150, 24, 2), 'UNPOPULAR OPINION', ink, '#facc15'),
            motion(
              textLayer('ht_quote', box(24, 64, 312, 132, 3), 'Meetings without an agenda should be declined on sight.', { family: 'serif', size: 26, color: ink, bold: true }),
              { in: 'pop' }
            ),
            textLayer('ht_by', box(24, 204, 312, 20, 4), 'Dana Okafor, ops lead', { size: 12, color: '#3f3f46' }),
            panelLayer(
              'ht_why',
              box(24, 232, 312, 72, 5),
              ink,
              'An agenda is the cheapest way to respect six calendars. No agenda, no meeting.',
              { size: 13, color: '#facc15' },
              { name: 'Why', visible: false }
            ),
            buttonLayer('ht_agree', box(24, 312, 150, 36, 6), 'Agree', { fill: ink, color: '#facc15' }, { behavior: 'widget.stamp', label: 'Agreed' }),
            buttonLayer('ht_why_btn', box(186, 312, 150, 36, 7), 'Why?', { fill: 'rgba(11,11,12,0.12)', color: ink }, { behavior: 'widget.reveal', revealLayerId: 'ht_why', revealMode: 'toggle' })
          ]
        }
      ],
      { backgroundColor: '#facc15' }
    )
  });
}

function lessonList(): PenTemplate {
  const f = FRAMES.portrait;
  const t = themes.paper;
  const lessons = [
    'Ask the obvious question in week one. It only gets more expensive.',
    'Write down how things work. Your notes become the onboarding doc.',
    'Ship small. A merged fix beats a perfect draft.',
    'Learn who decides, not just who talks the most.',
    'Take the lunch invite. That is where the context lives.'
  ];
  return postTemplate({
    id: 'note.lesson.v1',
    classId: 'social.note',
    title: 'Lesson list',
    description: 'Five numbered lessons on notebook paper, with a Save stamp.',
    aspect: 'portrait',
    featured: true,
    focus:
      'Write a headline that promises a numbered list, then exactly five lessons of one sentence each. Each lesson should be concrete advice, not a slogan.',
    seed: pageSeed(
      f,
      [
        {
          slug: 'body',
          layers: [
            pageArt(
              'ls_art',
              artHtml(
                '#fbf7ee',
                '<div class="lines"></div><div class="r" style="left:44px;top:0;bottom:0;width:2px;background:#f87171"></div><div class="s" style="left:14px;top:120px;width:14px;height:14px;background:#e7e0d2"></div><div class="s" style="left:14px;top:320px;width:14px;height:14px;background:#e7e0d2"></div><div class="s" style="left:14px;top:520px;width:14px;height:14px;background:#e7e0d2"></div>',
                '.lines{position:absolute;inset:0;background:repeating-linear-gradient(180deg,transparent 0 35px,#dbeafe 35px 36px)}'
              ),
              f
            ),
            chipLayer('ls_kicker', box(60, 40, 150, 26, 2), 'FIRST-JOB NOTES', t.ink, t.bg),
            motion(
              textLayer('ls_head', box(60, 80, 276, 96, 3), 'Five things I wish I knew on day one', { family: 'serif', size: 28, color: t.ink, bold: true }),
              { in: 'rise' }
            ),
            ...lessons.flatMap((lesson, i) => [
              textLayer(`ls_n${i + 1}`, box(60, 196 + i * 72, 32, 32, 4 + i * 2), `0${i + 1}`, { family: 'serif', size: 22, color: t.accent, bold: true }),
              textLayer(`ls_t${i + 1}`, box(100, 196 + i * 72, 236, 60, 5 + i * 2), lesson, { size: 14, color: t.ink })
            ]),
            buttonLayer('ls_save', box(60, 568, 160, 40, 20), 'Save this', t.primary, { behavior: 'widget.stamp', label: 'Saved' }),
            textLayer('ls_by', box(232, 578, 104, 20, 21), '@mara.writes', { size: 11, color: t.muted })
          ]
        }
      ],
      { backgroundColor: '#fbf7ee', textColor: '#1c1917' }
    )
  });
}

function announcement(): PenTemplate {
  const f = FRAMES.portrait;
  const t = themes.sunset;
  return postTemplate({
    id: 'note.announcement.v1',
    classId: 'social.note',
    title: 'Announcement',
    description: 'Big news, what changes for your readers, a countdown, and Add to calendar.',
    aspect: 'portrait',
    focus:
      'Write the news as a headline, one or two sentences with the date and place, and three short lines on what changes for the reader. Set the calendar event to the same date.',
    seed: pageSeed(f, [
      {
        slug: 'body',
        layers: [
          pageArt(
            'an_art',
            artHtml(
              'linear-gradient(180deg,#7c2d12 0%,#c2410c 60%,#ea580c 100%)',
              '<div class="s" style="width:150px;height:150px;right:-30px;top:-30px;background:#fdba74;opacity:.55"></div><div class="roofs"></div>',
              '.roofs{position:absolute;left:0;right:0;bottom:0;height:120px;background:linear-gradient(135deg,transparent 33%,rgba(67,20,7,.55) 33% 66%,transparent 66%) 0 0/60px 60px,linear-gradient(180deg,transparent 50%,rgba(67,20,7,.7) 50%)}'
            ),
            f
          ),
          chipLayer('an_kicker', box(24, 48, 128, 26, 2), 'STUDIO NEWS', t.ink, '#7c2d12'),
          motion(
            textLayer('an_head', box(24, 90, 312, 110, 3), 'Fieldwork Studio is moving to Lisbon', { family: 'serif', size: 32, color: t.ink, bold: true }),
            { in: 'drop' }
          ),
          textLayer('an_sub', box(24, 208, 312, 64, 4), 'New light, new street, same team. Doors open at Rua das Flores 28 on 1 September.', { size: 14, color: t.muted }),
          panelLayer(
            'an_changes',
            box(24, 290, 312, 150, 5),
            'rgba(255,247,237,0.12)',
            ['What changes for you', 'Same email, same phone, same hours.', 'Visits by appointment for the first month.', 'Orders ship from Lisbon from 1 September.'],
            { size: 13, color: t.ink },
            { name: 'What changes' }
          ),
          textLayer('an_cd_label', box(24, 462, 140, 20, 6), 'Opening in', { size: 12, color: t.muted }),
          countdownLayer('an_cd', box(22, 486, 120, 32, 7), t.accent, 30),
          buttonLayer('an_cal', box(24, 548, 312, 48, 8), 'Add opening day to calendar', t.primary, {
            behavior: 'cta.calendar',
            eventTitle: 'Fieldwork Studio opening',
            eventLocation: 'Rua das Flores 28, Lisbon',
            eventStart: eventStartIn(30, 18),
            eventDurationMin: 120
          })
        ]
      }
    ])
  });
}

function devTip(): PenTemplate {
  const f = FRAMES.landscape;
  const muted = 'rgba(230,237,243,0.68)';
  return postTemplate({
    id: 'note.dev_tip.v1',
    classId: 'social.note',
    title: 'Dev tip',
    description: 'A coding tip with a code panel, Copy snippet, and a docs link.',
    aspect: 'landscape',
    focus:
      'Write a tip headline that names the result, two sentences explaining why it works, and a snippet of at most six lines in the Code panel. Link to official documentation.',
    seed: pageSeed(f, [
      {
        slug: 'body',
        layers: [
          pageArt(
            'dt_art',
            artHtml(
              '#0d1117',
              '<div class="grid"></div><div class="s" style="left:316px;top:30px;width:10px;height:10px;background:#f85149"></div><div class="s" style="left:332px;top:30px;width:10px;height:10px;background:#d29922"></div><div class="s" style="left:348px;top:30px;width:10px;height:10px;background:#3fb950"></div>',
              '.grid{position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px) 0 0/32px 32px,linear-gradient(180deg,rgba(255,255,255,.03) 1px,transparent 1px) 0 0/32px 32px}'
            ),
            f
          ),
          chipLayer('dt_kicker', box(32, 28, 110, 24, 2), 'JS TIP #14', '#facc15', '#0d1117'),
          motion(
            textLayer('dt_head', box(32, 64, 260, 100, 3), 'Dedupe an array in one line', { family: 'serif', size: 28, color: '#e6edf3', bold: true }),
            { in: 'slideRight' }
          ),
          textLayer('dt_body', box(32, 172, 260, 80, 4), 'A Set keeps the first copy of each value, in order. Spread it back into an array and you are done.', { size: 13, color: muted }),
          motion(
            panelLayer(
              'dt_code',
              box(316, 64, 292, 150, 5),
              '#161b22',
              ['const tags = ["ux", "js", "ux", "css"];', '', 'const unique = [...new Set(tags)];', '// ["ux", "js", "css"]'],
              { family: 'mono', size: 13, color: '#7ee787' },
              { name: 'Code', strokeColor: '#30363d', strokeWidth: 1 }
            ),
            { in: 'fade' }
          ),
          buttonLayer('dt_copy', box(316, 236, 140, 40, 6), 'Copy snippet', { fill: '#238636', color: '#ffffff' }, { behavior: 'widget.stamp', label: 'Copied' }),
          buttonLayer(
            'dt_docs',
            box(468, 236, 140, 40, 7),
            'MDN docs',
            { fill: 'rgba(255,255,255,0.08)', color: '#e6edf3' },
            { behavior: 'cta.open', openUrl: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set' }
          ),
          textLayer('dt_by', box(32, 300, 260, 20, 8), '@devon.codes · new tip every Friday', { size: 11, color: muted })
        ]
      }
    ])
  });
}

export function noteTemplates(): PenTemplate[] {
  return [openQuestion(), hotTake(), lessonList(), announcement(), devTip()];
}
