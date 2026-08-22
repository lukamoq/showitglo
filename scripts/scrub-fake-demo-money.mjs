#!/usr/bin/env node
/**
 * DELETES the seed-wars demo posts (ids 22222222-…) and every row that hangs
 * off them. Their backing was fabricated by the old seeder — no wallet ledger
 * ever stood behind it — and real customers must not compete with fake money.
 *
 * Safety rails:
 *  - refuses to delete ANY post that has ledger-backed interactions (real
 *    money) — those are listed and left untouched instead;
 *  - only touches ids matching the seeder's fixed 22222222-% prefix;
 *  - transactional, and verifies the money invariant (Σ ledger == Σ wallet
 *    balances) before committing;
 *  - refuses to run without --yes.
 *
 *   DATABASE_URL=<url> node scripts/scrub-fake-demo-money.mjs --yes
 */
import { Client } from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}
if (!process.argv.includes('--yes')) {
  console.error('Refusing to run without --yes (this deletes live rows).');
  process.exit(1);
}

const ssl = /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: true };
const client = new Client({ connectionString: url, ssl });

try {
  await client.connect();
  await client.query('BEGIN');

  const seeded = await client.query(`
    SELECT p.id, p.title,
           (SELECT COUNT(*) FROM interactions i
              JOIN wallet_ledger wl ON wl.ref_id = i.id AND wl.ref_type = 'interaction'
            WHERE i.post_id = p.id) AS real_backed
    FROM posts p
    WHERE p.id::text LIKE '22222222-%'`);

  const deletable = seeded.rows.filter((r) => Number(r.real_backed) === 0).map((r) => r.id);
  const protectedRows = seeded.rows.filter((r) => Number(r.real_backed) > 0);

  console.log(`seed posts found: ${seeded.rows.length}, deletable: ${deletable.length}`);
  for (const r of protectedRows) {
    console.log(`  PROTECTED (real money behind it, not touched): ${r.title.slice(0, 60)}`);
  }

  if (deletable.length === 0) {
    await client.query('ROLLBACK');
    console.log('Nothing to delete.');
    process.exit(0);
  }

  // Debates whose sides point at seed posts go too (CASCADE clears sides +
  // opinions); their free-vote counters have no FK and are cleared manually.
  const debates = await client.query(
    'SELECT DISTINCT debate_id FROM debate_sides WHERE post_id = ANY($1)',
    [deletable]
  );
  const debateIds = debates.rows.map((r) => r.debate_id);
  if (debateIds.length > 0) {
    await client.query('DELETE FROM debate_free_votes WHERE debate_id = ANY($1)', [debateIds]);
    await client.query('DELETE FROM debates WHERE id = ANY($1)', [debateIds]);
    console.log(`demo debates removed: ${debateIds.length}`);
  }

  await client.query('DELETE FROM quotes WHERE post_id = ANY($1)', [deletable]);
  await client.query('DELETE FROM reports WHERE post_id = ANY($1)', [deletable]);
  await client.query('DELETE FROM rank_events WHERE post_id = ANY($1)', [deletable]);
  const delInt = await client.query('DELETE FROM interactions WHERE post_id = ANY($1)', [deletable]);
  const delBack = await client.query('DELETE FROM post_backers WHERE post_id = ANY($1)', [deletable]);
  // brand_responses cascade with the post; counter_of self-references resolve
  // because every referencing row is inside the same DELETE.
  const delPosts = await client.query('DELETE FROM posts WHERE id = ANY($1)', [deletable]);

  // The seeder also invented USERS with direct-credited balances and no
  // ledger. Remove them wholesale — fixed 11111111-% ids AND placeholder
  // .local emails AND a balance the ledger cannot account for. A seed user
  // whose wallet DOES reconcile (someone really paid them?) is left alone.
  const fakeUsers = await client.query(`
    SELECT u.id, u.alias, w.balance_cents
    FROM users u JOIN wallets w ON w.user_id = u.id
    WHERE u.id::text LIKE '11111111-%'
      AND u.email LIKE '%.local'
      AND w.balance_cents != COALESCE((SELECT SUM(delta_cents) FROM wallet_ledger wl WHERE wl.user_id = u.id), 0)`);
  const fakeUserIds = fakeUsers.rows.map((r) => r.id);
  if (fakeUserIds.length > 0) {
    await client.query('DELETE FROM notifications WHERE user_id = ANY($1)', [fakeUserIds]);
    await client.query('DELETE FROM users WHERE id = ANY($1)', [fakeUserIds]); // wallets cascade
    for (const r of fakeUsers.rows) {
      console.log(`fake user removed: ${r.alias} (unledgered balance ${r.balance_cents}¢)`);
    }
  }

  const inv = await client.query(
    `SELECT (SELECT COALESCE(SUM(delta_cents), 0) FROM wallet_ledger) AS ledger,
            (SELECT COALESCE(SUM(balance_cents), 0) FROM wallets) AS balances`
  );
  const { ledger, balances } = inv.rows[0];
  console.log(`posts deleted: ${delPosts.rowCount} | fake interactions: ${delInt.rowCount} | fake backers: ${delBack.rowCount}`);
  console.log(`invariant: ledger=${ledger} balances=${balances}`);
  if (ledger !== balances) throw new Error('ledger invariant broken — rolling back');

  const kept = await client.query("SELECT title, total_raised_cents FROM posts WHERE status = 'live' ORDER BY created_at");
  console.log('remaining live posts:');
  for (const r of kept.rows) console.log(`  KEPT: ${r.title.slice(0, 60)} ($${(r.total_raised_cents / 100).toFixed(2)})`);

  await client.query('COMMIT');
  console.log('✅ committed — demo posts removed, real posts untouched.');
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('rolled back:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
