// scripts/seed-wars.mjs
// Seeds authentic, real-world trending topics, active counter wars, and standing debates with micro-commitments.

import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

// Load environment from .env.local or .env
if (existsSync(resolve(rootDir, '.env.local'))) {
  const envContent = readFileSync(resolve(rootDir, '.env.local'), 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  }
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('❌ DATABASE_URL is not configured in .env.local');
  process.exit(1);
}

// This script writes demo content (see the header) and TRUNCATES tables.
// Running it against production would destroy the public record.
if (process.env.NODE_ENV === 'production' && process.env.DEMO_SEED !== '1') {
  console.error('❌ Refusing to seed demo wars with NODE_ENV=production. Set DEMO_SEED=1 if you really mean it.');
  process.exit(1);
}

function isLocalHost(url) {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '';
  } catch {
    return false;
  }
}

/**
 * DATABASE_SSL: verify | no-verify | disable, matching src/lib/db/pg.ts.
 * Certificate verification is ON by default for remote hosts — disabling it
 * unconditionally (as this script used to) makes every connection to a managed
 * Postgres trivially interceptable.
 */
function resolveSsl(url) {
  const mode = (process.env.DATABASE_SSL || '').toLowerCase();
  if (mode === 'disable') return undefined;
  if (mode === 'no-verify') return { rejectUnauthorized: false };
  if (mode === 'verify') return true;
  return isLocalHost(url) ? undefined : true;
}

const pool = new Pool({
  connectionString: dbUrl,
  ssl: resolveSsl(dbUrl),
});

/**
 * Mirror of calculateStoredDelta in src/lib/engine/decay.ts.
 *
 * The engine stores score_base in CENTS (`amountCents * 2^((t - T0) / H)`) and
 * divides by 100 only when rendering the display score. This helper used to
 * divide here as well, which seeded every post ~100x below the score the same
 * money earns through recordInteraction — one real $0.10 boost outranked a
 * seeded $240 war. Keep the two in step: cents in, cents out.
 */
function calculateStoredDelta(amountCents, epochDate, halfLifeHours = 168) {
  const now = new Date();
  const epoch = new Date(epochDate);
  const halfLifeMs = halfLifeHours * 3600 * 1000;
  const elapsedMs = now.getTime() - epoch.getTime();
  const decayFactor = Math.pow(2, elapsedMs / halfLifeMs);
  return amountCents * decayFactor;
}

async function seed() {
  console.log('⚔️  ShowItGlo — Seeding Current Topics & Real Wars...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Get or create category
    const catRes = await client.query("SELECT id, score_epoch, half_life_hours FROM categories WHERE id = 'global'");
    let epoch = new Date().toISOString();
    let halfLife = 168;
    if (catRes.rows.length === 0) {
      await client.query(`
        INSERT INTO categories (id, name, is_live, half_life_hours, increment_strategy, increment_config, score_epoch, min_power_cents)
        VALUES ('global', 'Global Arena', true, 168, 'percent', '{"pct": 0.10, "floor_cents": 50}', NOW(), 1000)
      `);
    } else {
      epoch = catRes.rows[0].score_epoch;
      halfLife = catRes.rows[0].half_life_hours || 168;
    }

    // 2. Users (authentic market combatants)
    const users = [
      { id: '11111111-1111-4111-8111-111111111101', alias: 'Alex Chen', email: 'alex.chen@showitglo.local', role: 'user' },
      { id: '11111111-1111-4111-8111-111111111102', alias: 'Sarah Connor', email: 'sarah.c@showitglo.local', role: 'user' },
      { id: '11111111-1111-4111-8111-111111111103', alias: 'Marcus Vance', email: 'marcus.v@showitglo.local', role: 'user' },
      { id: '11111111-1111-4111-8111-111111111104', alias: 'Elena Rostova', email: 'elena.r@showitglo.local', role: 'user' },
      { id: '11111111-1111-4111-8111-111111111105', alias: 'David Kim', email: 'david.k@showitglo.local', role: 'user' },
      { id: '11111111-1111-4111-8111-111111111106', alias: 'TechOptimist', email: 'tech.opt@showitglo.local', role: 'user' },
      { id: '11111111-1111-4111-8111-111111111107', alias: 'SatoshiNode', email: 'satoshi.node@showitglo.local', role: 'user' },
      { id: '11111111-1111-4111-8111-111111111108', alias: 'Clara Oswald', email: 'clara.o@showitglo.local', role: 'user' },
    ];

    for (const u of users) {
      await client.query(`
        INSERT INTO users (id, email, alias, is_profile_public, role, status)
        VALUES ($1, $2, $3, true, $4, 'active')
        ON CONFLICT (id) DO UPDATE SET alias = $3
      `, [u.id, u.email, u.alias, u.role]);

      await client.query(`
        INSERT INTO wallets (user_id, balance_cents, daily_cap_cents, status, lifetime_topup_cents, lifetime_spend_cents)
        VALUES ($1, 25000, 100000, 'active', 50000, 25000)
        ON CONFLICT (user_id) DO NOTHING
      `, [u.id]);
    }

    console.log(`  ✓ Registered ${users.length} market participants`);

    // 3. Clear existing seed posts & debates for a fresh high-conviction landscape
    await client.query('DELETE FROM debate_opinions');
    await client.query('DELETE FROM debate_free_votes');
    await client.query('DELETE FROM debate_sides');
    await client.query('DELETE FROM debates');
    await client.query('DELETE FROM post_backers');
    await client.query('DELETE FROM interactions');
    await client.query('DELETE FROM brand_responses');
    await client.query('DELETE FROM posts');

    // 4. Topics & Head-to-Head Wars
    const wars = [
      {
        idA: '22222222-2222-4222-8222-222222222201',
        slugA: 'reasoning-ai-makes-traditional-search-obsolete',
        titleA: 'Reasoning AI models (Claude Opus 5 & GPT-5.6) have made traditional 10-blue-links search obsolete.',
        bodyA: 'When an AI can synthesize cross-domain research, verify facts through code execution, and eliminate SEO spam farms, standard keyword search engines become relics.',
        authorA: users[0],
        commitmentsA: [
          { user: users[0], cents: 2500, kind: 'boost' },
          { user: users[5], cents: 1500, kind: 'boost' },
          { user: users[6], cents: 500, kind: 'like' },
        ],

        idB: '22222222-2222-4222-8222-222222222202',
        slugB: 'real-time-indexed-web-beats-probabilistic-llms',
        titleB: 'Real-time indexed web reporting and human attribution will always beat probabilistic LLMs.',
        bodyB: 'AI does not create original breaking news or investigative journalism; it merely regurgitates indexed human reporting. Without a live web index, AI starves.',
        authorB: users[1],
        commitmentsB: [
          { user: users[1], cents: 2000, kind: 'boost' },
          { user: users[4], cents: 1200, kind: 'boost' },
        ],
      },
      {
        idA: '22222222-2222-4222-8222-222222222203',
        slugA: 'ai-coding-agents-will-replace-80pct-routine-dev',
        titleA: 'AI coding agents will automate 80% of routine software engineering by 2027.',
        bodyA: 'Full-repo reasoning, self-debugging loops, and agentic workflows are advancing exponentially. The days of typing out boilerplate CRUD logic by hand are over.',
        authorA: users[2],
        commitmentsA: [
          { user: users[2], cents: 1800, kind: 'boost' },
          { user: users[0], cents: 1000, kind: 'boost' },
        ],

        idB: '22222222-2222-4222-8222-222222222204',
        slugB: 'systems-architects-and-engineers-more-valuable',
        titleB: 'Software engineers will be 10x more valuable as systems architects and verification leaders.',
        bodyB: 'When writing code becomes free, the bottleneck shifts entirely to systems architecture, latency constraints, database consistency, and verifying mission-critical invariants.',
        authorB: users[3],
        commitmentsB: [
          { user: users[3], cents: 2200, kind: 'boost' },
          { user: users[7], cents: 1000, kind: 'boost' },
        ],
      },
      {
        idA: '22222222-2222-4222-8222-222222222205',
        slugA: 'tesla-must-open-fsd-to-third-party-automakers',
        titleA: 'Tesla must license Full Self-Driving (FSD) to third-party automakers to win the robotaxi era.',
        bodyA: 'Android won mobile by opening its OS to every OEM. Tesla cannot manufacture all the world’s vehicles alone; licensing FSD is the only path to global autonomy monopoly.',
        authorA: users[4],
        demand_target: 'Tesla',
        commitmentsA: [
          { user: users[4], cents: 3000, kind: 'power' },
          { user: users[2], cents: 800, kind: 'boost' },
        ],

        idB: '22222222-2222-4222-8222-222222222206',
        slugB: 'tesla-vertical-integration-is-their-only-true-moat',
        titleB: 'Tesla’s custom AI silicon and vehicle vertical integration is their only unassailable moat.',
        bodyB: 'Third-party automakers lack the camera calibration, steer-by-wire hardware, and low-latency onboard inference chips required to run end-to-end vision neural networks.',
        authorB: users[5],
        commitmentsB: [
          { user: users[5], cents: 3500, kind: 'power' },
          { user: users[6], cents: 1200, kind: 'boost' },
        ],
      },
      {
        idA: '22222222-2222-4222-8222-222222222207',
        slugA: 'smr-nuclear-is-only-viable-clean-power-for-ai-compute',
        titleA: 'Small Modular Nuclear Reactors (SMRs) are the only viable clean power for gigawatt AI clusters.',
        bodyA: 'Intermittent renewables cannot guarantee 99.999% baseload uptime for hyperscale training runs without multi-billion dollar battery overbuilds. Nuclear is inevitable.',
        authorA: users[6],
        commitmentsA: [
          { user: users[6], cents: 2800, kind: 'boost' },
          { user: users[1], cents: 1400, kind: 'boost' },
        ],

        idB: '22222222-2222-4222-8222-222222222208',
        slugB: 'solar-plus-batteries-compounding-faster-than-nuclear',
        titleB: 'Solar + Grid Battery storage is compounding 5x faster than nuclear regulatory timelines.',
        bodyB: 'By the time a single SMR is permitted and built in 2032, solar panels and LFP battery packs will have dropped another 60% in cost with immediate 6-month deployment speeds.',
        authorB: users[7],
        commitmentsB: [
          { user: users[7], cents: 2400, kind: 'boost' },
          { user: users[3], cents: 900, kind: 'boost' },
        ],
      },
    ];

    for (const war of wars) {
      // Insert Post A
      await client.query(`
        INSERT INTO posts (id, slug, author_id, category_id, kind, demand_target, title, body, author_display, status, score_base, total_raised_cents, backers_count, like_units, streak_days)
        VALUES ($1, $2, $3, 'global', 'opinion', $4, $5, $6, $7, 'live', 0, 0, 0, 0, 1)
      `, [war.idA, war.slugA, war.authorA.id, war.demand_target || null, war.titleA, war.bodyA, war.authorA.alias]);

      // Insert Post B (counter of Post A)
      await client.query(`
        INSERT INTO posts (id, slug, author_id, category_id, kind, demand_target, counter_of, title, body, author_display, status, score_base, total_raised_cents, backers_count, like_units, streak_days)
        VALUES ($1, $2, $3, 'global', 'opinion', $4, $5, $6, $7, $8, 'live', 0, 0, 0, 0, 1)
      `, [war.idB, war.slugB, war.authorB.id, war.demand_target || null, war.idA, war.titleB, war.bodyB, war.authorB.alias]);

      // Back-link Post A's counter_of to Post B
      await client.query(`UPDATE posts SET counter_of = $1 WHERE id = $2`, [war.idB, war.idA]);

      // Add commitments for Post A
      let totalRaisedA = 0;
      let scoreBaseA = 0;
      const backersA = new Map();

      for (const comm of war.commitmentsA) {
        totalRaisedA += comm.cents;
        const delta = calculateStoredDelta(comm.cents, epoch, halfLife);
        scoreBaseA += delta;
        backersA.set(comm.user.id, (backersA.get(comm.user.id) || 0) + comm.cents);

        const intId = `int_${randomUUID().substring(0, 12)}`;
        await client.query(`
          INSERT INTO interactions (id, post_id, user_id, category_id, kind, units, amount_cents, stored_delta, visibility, payer_display)
          VALUES ($1, $2, $3, 'global', $4, 1, $5, $6, 'alias', $7)
        `, [intId, war.idA, comm.user.id, comm.kind, comm.cents, delta, comm.user.alias]);
      }

      for (const [userId, totalCents] of backersA.entries()) {
        const u = users.find((x) => x.id === userId);
        await client.query(`
          INSERT INTO post_backers (post_id, user_id, total_cents, visibility, user_display)
          VALUES ($1, $2, $3, 'alias', $4)
        `, [war.idA, userId, totalCents, u ? u.alias : 'Contributor']);
      }

      await client.query(`
        UPDATE posts
        SET score_base = $1, total_raised_cents = $2, backers_count = $3
        WHERE id = $4
      `, [scoreBaseA, totalRaisedA, backersA.size, war.idA]);

      // Add commitments for Post B
      let totalRaisedB = 0;
      let scoreBaseB = 0;
      const backersB = new Map();

      for (const comm of war.commitmentsB) {
        totalRaisedB += comm.cents;
        const delta = calculateStoredDelta(comm.cents, epoch, halfLife);
        scoreBaseB += delta;
        backersB.set(comm.user.id, (backersB.get(comm.user.id) || 0) + comm.cents);

        const intId = `int_${randomUUID().substring(0, 12)}`;
        await client.query(`
          INSERT INTO interactions (id, post_id, user_id, category_id, kind, units, amount_cents, stored_delta, visibility, payer_display)
          VALUES ($1, $2, $3, 'global', $4, 1, $5, $6, 'alias', $7)
        `, [intId, war.idB, comm.user.id, comm.kind, comm.cents, delta, comm.user.alias]);
      }

      for (const [userId, totalCents] of backersB.entries()) {
        const u = users.find((x) => x.id === userId);
        await client.query(`
          INSERT INTO post_backers (post_id, user_id, total_cents, visibility, user_display)
          VALUES ($1, $2, $3, 'alias', $4)
        `, [war.idB, userId, totalCents, u ? u.alias : 'Contributor']);
      }

      await client.query(`
        UPDATE posts
        SET score_base = $1, total_raised_cents = $2, backers_count = $3
        WHERE id = $4
      `, [scoreBaseB, totalRaisedB, backersB.size, war.idB]);

      console.log(`  ✓ Spawned War: "${war.titleA.slice(0, 42)}..." vs "${war.titleB.slice(0, 42)}..." ($${(totalRaisedA / 100).toFixed(2)} vs $${(totalRaisedB / 100).toFixed(2)})`);
    }

    // 5. Standing Debates (The Great Debates)
    const debatesData = [
      {
        id: 'deb_open_vs_closed_ai',
        slug: 'open-weights-vs-closed-frontier-ai',
        question: 'Will open-weights models (DeepSeek, Llama) permanently commoditize closed frontier AI labs?',
        postA: wars[0].idA,
        postB: wars[0].idB,
        labelA: 'Open Weights Win',
        labelB: 'Closed Frontier Dominates',
        opinions: [
          { side: 'a', name: 'Alex Chen', text: 'Distributed open source optimization always out-paces closed single-vendor development.', is_paid: true, cents: 1000 },
          { side: 'b', name: 'Sarah Connor', text: 'Frontier cluster scale of $10B+ runs cannot be crowdfunded on consumer hardware.', is_paid: true, cents: 1200 },
        ],
      },
      {
        id: 'deb_remote_vs_rto',
        slug: 'remote-work-vs-mandatory-rto',
        question: 'Should high-performance tech companies mandate full Return-To-Office or remain Global Remote?',
        postA: wars[1].idA,
        postB: wars[1].idB,
        labelA: 'Global Asynchronous Remote',
        labelB: 'Mandatory In-Person RTO',
        opinions: [
          { side: 'a', name: 'Marcus Vance', text: 'Top 0.1% talent will never move to overpriced metro centers when they can ship 10x faster from home.', is_paid: true, cents: 1500 },
          { side: 'b', name: 'Elena Rostova', text: 'Zero latency in-person whiteboard debates produce breakthrough architectures that Slack never can.', is_paid: true, cents: 1800 },
        ],
      },
    ];

    for (const d of debatesData) {
      await client.query(`
        INSERT INTO debates (id, slug, question, status, curated, is_political, category_id)
        VALUES ($1, $2, $3, 'live', true, false, 'global')
      `, [d.id, d.slug, d.question]);

      await client.query(`
        INSERT INTO debate_sides (debate_id, side_key, label, post_id)
        VALUES ($1, 'a', $2, $3), ($1, 'b', $4, $5)
      `, [d.id, d.labelA, d.postA, d.labelB, d.postB]);

      // Add free votes
      await client.query(`INSERT INTO debate_free_votes (debate_id, side_key, votes) VALUES ($1, 'a', 84), ($1, 'b', 72)`, [d.id]);

      // Add opinions
      for (const op of d.opinions) {
        const opId = `op_${randomUUID().substring(0, 10)}`;
        await client.query(`
          INSERT INTO debate_opinions (id, debate_id, side_key, author_name, text, is_paid, amount_cents)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [opId, d.id, op.side, op.name, op.text, op.is_paid, op.cents]);
      }

      console.log(`  ✓ Spawned Standing Debate: "${d.question}"`);
    }

    await client.query('COMMIT');
    console.log('\n🎉 ALL REAL TOPIC WARS & DEBATES SEEDED SUCCESSFULLY WITH ACCESSIBLE COMMITMENTS!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error seeding wars:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(console.error);
