#!/usr/bin/env node
/**
 * Seeds LAUNCH TOPICS: platform-curated conversation starters, honestly
 * attributed to "ShowItGlo Curators", with ZERO fabricated backing — every
 * cent on these posts will come from real customers.
 *
 * Idempotent (fixed slugs; existing slugs are skipped). Safe to re-run.
 *
 *   DATABASE_URL=<url> node scripts/seed-launch-topics.mjs --yes
 */
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is required.'); process.exit(1); }
if (!process.argv.includes('--yes')) { console.error('Refusing to run without --yes.'); process.exit(1); }

const ssl = /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: true };
const client = new Client({ connectionString: url, ssl });

const CURATOR_ALIAS = 'ShowItGlo Curators';

const POSTS = [
  // — The classics people fight about at every dinner table —
  { slug: 'messi-goat-of-football', kind: 'opinion', title: '🐐 Messi is the greatest footballer of all time', body: 'Eight Ballon d’Ors, a World Cup, and two decades of playmaking no one has matched. The debate is over.' },
  { slug: 'ronaldo-goat-longevity', kind: 'opinion', counterOfSlug: 'messi-goat-of-football', title: '⚽ Ronaldo’s 900+ goals and five Champions League titles settle it', body: 'Dominated three different leagues, scored more goals than anyone in history, and stayed elite past 38. The machine wins.' },
  { slug: 'pineapple-belongs-on-pizza', kind: 'opinion', title: '🍍 Pineapple belongs on pizza', body: 'Sweet, salty, acidic, savory — it is objectively a great topping and the outrage is pure tradition.' },
  { slug: 'pineapple-pizza-is-a-crime', kind: 'opinion', counterOfSlug: 'pineapple-belongs-on-pizza', title: '🇮🇹 Pineapple on pizza is a crime against Italian cuisine', body: 'Some lines exist for a reason. Hot fruit does not belong on a Margherita.' },
  { slug: 'ai-writes-most-code-in-5-years', kind: 'opinion', title: '🤖 AI will write most production code within 5 years', body: 'Coding agents already ship real features. The economics only point one way.' },
  { slug: 'senior-engineers-more-valuable-ai-era', kind: 'opinion', counterOfSlug: 'ai-writes-most-code-in-5-years', title: '🧠 AI makes senior engineers MORE valuable, not obsolete', body: 'Someone has to specify, verify, and own what the machines produce. Judgment is the new scarcity.' },
  // — Work & life —
  { slug: 'four-day-week-global-standard', kind: 'opinion', title: '📅 The 4-day work week should be the global standard', body: 'Every large trial shows equal output and better health. The 5th day is inertia, not productivity.' },
  { slug: 'remote-beats-office-deep-work', kind: 'opinion', title: '🏠 Remote work beats the office for deep work', body: 'No commute, no interruption theater. Offices are for meetings; real work happens in quiet.' },
  // — Tech & products —
  { slug: 'physical-buttons-must-return-to-cars', kind: 'opinion', title: '🚗 Physical buttons must return to cars', body: 'Touchscreen-only climate controls at 120 km/h are a safety problem, not a design aesthetic.' },
  { slug: 'evs-outsell-gas-cars-2030', kind: 'opinion', title: '⚡ Electric cars will outsell gas cars worldwide by 2030', body: 'Price parity is here, charging is compounding, and every major maker has already committed.' },
  // — Food fights —
  { slug: 'ny-pizza-beats-chicago', kind: 'opinion', title: '🍕 New York pizza beats Chicago deep dish', body: 'A foldable slice is pizza. A casserole in a crust is dinner pretending.' },
  // — Consumer demands (companies, never individuals) —
  { slug: 'netflix-bring-back-reviews', kind: 'demand', demandTarget: 'Netflix', title: '📺 Netflix: bring back user reviews and star ratings', body: 'A thumbs system tells nobody anything. Let viewers rate and review so good shows get found.' },
  { slug: 'ikea-replacement-parts-forever', kind: 'demand', demandTarget: 'IKEA', title: '🪑 IKEA: sell replacement parts for every product, forever', body: 'One broken cam lock should not send a whole BILLY to landfill. Parts availability is the real sustainability.' },
];

const DEBATES = [
  { slug: 'messi-vs-ronaldo', question: 'Who is the GOAT of football?', sides: [
    { key: 'messi', label: 'Team Messi', postSlug: 'messi-goat-of-football' },
    { key: 'ronaldo', label: 'Team Ronaldo', postSlug: 'ronaldo-goat-longevity' } ] },
  { slug: 'pineapple-pizza-war', question: 'Pineapple on pizza — genius or crime?', sides: [
    { key: 'genius', label: 'Team Pineapple', postSlug: 'pineapple-belongs-on-pizza' },
    { key: 'crime', label: 'Team Tradition', postSlug: 'pineapple-pizza-is-a-crime' } ] },
  { slug: 'ai-vs-engineers', question: 'Will AI replace programmers or promote them?', sides: [
    { key: 'ai', label: 'AI writes the code', postSlug: 'ai-writes-most-code-in-5-years' },
    { key: 'engineers', label: 'Engineers level up', postSlug: 'senior-engineers-more-valuable-ai-era' } ] },
];

try {
  await client.connect();
  await client.query('BEGIN');

  // Curator identity — a real, honestly-labeled platform user.
  let curator = await client.query('SELECT id FROM users WHERE alias = $1 AND deleted_at IS NULL', [CURATOR_ALIAS]);
  let curatorId;
  if (curator.rows[0]) {
    curatorId = curator.rows[0].id;
  } else {
    curatorId = randomUUID();
    await client.query(
      `INSERT INTO users (id, email, alias, is_profile_public, role, status)
       VALUES ($1, $2, $3, true, 'user', 'active')`,
      [curatorId, `curators_${curatorId.slice(0, 8)}@anon.showitglo.local`, CURATOR_ALIAS]
    );
    await client.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [curatorId]);
  }

  const idBySlug = new Map();
  let created = 0;
  for (const p of POSTS) {
    const existing = await client.query('SELECT id FROM posts WHERE slug = $1', [p.slug]);
    if (existing.rows[0]) { idBySlug.set(p.slug, existing.rows[0].id); continue; }
    const id = randomUUID();
    idBySlug.set(p.slug, id);
    await client.query(
      `INSERT INTO posts (id, slug, author_id, category_id, kind, demand_target, counter_of, title, body,
                          is_ad, author_display, status, score_base, total_raised_cents, backers_count, like_units, streak_days)
       VALUES ($1,$2,$3,'global',$4,$5,$6,$7,$8,false,$9,'live',0,0,0,0,0)`,
      [id, p.slug, curatorId, p.kind, p.demandTarget ?? null,
       p.counterOfSlug ? idBySlug.get(p.counterOfSlug) : null, p.title, p.body, CURATOR_ALIAS]
    );
    created += 1;
  }

  let debatesCreated = 0;
  for (const d of DEBATES) {
    const existing = await client.query('SELECT id FROM debates WHERE slug = $1', [d.slug]);
    if (existing.rows[0]) continue;
    const debateId = `deb_${d.slug.replace(/-/g, '_')}`;
    await client.query(
      `INSERT INTO debates (id, slug, question, status, curated, is_political, category_id)
       VALUES ($1,$2,$3,'live',true,false,'global')`,
      [debateId, d.slug, d.question]
    );
    for (const s of d.sides) {
      await client.query(
        'INSERT INTO debate_sides (debate_id, side_key, label, post_id) VALUES ($1,$2,$3,$4)',
        [debateId, s.key, s.label, idBySlug.get(s.postSlug)]
      );
    }
    debatesCreated += 1;
  }

  const inv = await client.query(
    `SELECT (SELECT COALESCE(SUM(delta_cents),0) FROM wallet_ledger) AS ledger,
            (SELECT COALESCE(SUM(balance_cents),0) FROM wallets) AS balances,
            (SELECT COALESCE(SUM(total_raised_cents),0) FROM posts WHERE slug = ANY($1)) AS seeded_raised`,
    [POSTS.map((p) => p.slug)]
  );
  const { ledger, balances, seeded_raised } = inv.rows[0];
  if (ledger !== balances || Number(seeded_raised) !== 0) throw new Error('invariant broken — rolling back');

  await client.query('COMMIT');
  console.log(`✅ ${created} topics + ${debatesCreated} debates created, all at $0.00 — ledger=${ledger} balances=${balances}`);
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('rolled back:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
