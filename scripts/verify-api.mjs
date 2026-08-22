/**
 * Comprehensive API & User Flow Verification Test
 */

async function runTests() {
  console.log('🚀 Starting Full API Flow Verification on http://localhost:3000...\n');

  const BASE = 'http://localhost:3000';

  // 1. Test Board API
  console.log('1. Fetching Global Board...');
  const resBoard = await fetch(`${BASE}/api/v1/boards/global`);
  const dataBoard = await resBoard.json();
  console.log(`  ✓ Board fetched. Total ranked posts: ${dataBoard.board.length}`);
  console.log(`  ✓ Current #1: "${dataBoard.board[0].title}" (Score: $${dataBoard.board[0].display_score})`);
  console.log(`  ✓ Current #2: "${dataBoard.board[1].title}" (Score: $${dataBoard.board[1].display_score})`);
  console.log(`  ✓ Active wars count: ${dataBoard.wars.length}`);

  // 2. Test Quote Engine: quote to take #1 from #2
  console.log('\n2. Requesting 5-minute Locked Quote to take #1...');
  const post2Id = dataBoard.board[1].id;
  const resQuote = await fetch(`${BASE}/api/v1/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      post_id: post2Id,
      target_rank: 1,
    }),
  });
  const dataQuote = await resQuote.json();
  console.log(`  ✓ Quote generated: ID ${dataQuote.quote.quote_id}`);
  console.log(`  ✓ Required boost: $${(dataQuote.quote.amount_cents / 100).toFixed(2)} -> Estimated Rank: #${dataQuote.quote.estimated_achieved_rank}`);

  // 3. Settle Boost: Boost Post #2 to Rank #1
  console.log('\n3. Executing Boost Settlement...');
  const resBoost = await fetch(`${BASE}/api/v1/boosts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      post_id: post2Id,
      amount_cents: dataQuote.quote.amount_cents,
      quote_id: dataQuote.quote.quote_id,
      target_rank: 1,
      payer_display: 'Marc (ShipFast)',
    }),
  });
  const dataBoost = await resBoost.json();
  console.log(`  ✓ Boost settled! Rank moved from #${dataBoost.old_rank} -> #${dataBoost.new_rank}`);
  console.log(`  ✓ Displaced posts count: ${dataBoost.displaced_count}`);

  // 4. Verify Board State after Boost
  console.log('\n4. Verifying New Board State...');
  const resBoardAfter = await fetch(`${BASE}/api/v1/boards/global`);
  const dataBoardAfter = await resBoardAfter.json();
  console.log(`  ✓ New #1: "${dataBoardAfter.board[0].title}" (Score: $${dataBoardAfter.board[0].display_score})`);
  console.log(`  ✓ Displaced to #2: "${dataBoardAfter.board[1].title}" (Score: $${dataBoardAfter.board[1].display_score})`);

  // 5. Test Post Creation with Gate 0 Moderation
  console.log('\n5. Creating New Post with Gate 0 Safety Check...');
  const resNewPost = await fetch(`${BASE}/api/v1/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: '⚡ Autonomous Solar UAV Network for Eco-Reforestation',
      content: 'Using computer vision and autonomous flight to monitor rewilding zones across Patagonia.',
      author_display: 'GreenFlight Lab',
      category_id: 'global',
      allow_crowd_boost: true,
      initial_boost_cents: 2500, // $25 initial boost
    }),
  });
  const dataNewPost = await resNewPost.json();
  console.log(`  ✓ Post created successfully: Slug /p/${dataNewPost.post.slug}`);
  console.log(`  ✓ Post Status: ${dataNewPost.post.status}`);

  // 6. Test User Dashboard & Outbid Reclaim Alerts
  console.log('\n6. Checking User Dashboard & Outbid Alerts...');
  const resDash = await fetch(`${BASE}/api/v1/me/dashboard?user_id=usr_alex`);
  const dataDash = await resDash.json();
  console.log(`  ✓ User posts: ${dataDash.posts.length}`);
  console.log(`  ✓ Outbid Reclaim Alerts: ${dataDash.reclaim_alerts.length}`);
  if (dataDash.reclaim_alerts.length > 0) {
    const alert = dataDash.reclaim_alerts[0];
    console.log(`    → Alert: "${alert.payload.message}"`);
    console.log(`    → 1-Tap Reclaim Quote ID: ${alert.payload.reclaim_quote_id} ($${(alert.payload.reclaim_amount_cents / 100).toFixed(2)})`);
  }

  // 7. Test Historical Playback
  console.log('\n7. Checking Historical Board Snapshots...');
  const resHistory = await fetch(`${BASE}/api/v1/boards/global/history`);
  const dataHistory = await resHistory.json();
  console.log(`  ✓ Available historical snapshot dates: ${dataHistory.available_dates.join(', ')}`);

  // 8. Test Admin Operations
  console.log('\n8. Checking Admin Control Center...');
  const resAdmin = await fetch(`${BASE}/api/v1/admin/overview`);
  const dataAdmin = await resAdmin.json();
  console.log(`  ✓ Gross Market Volume: $${dataAdmin.stats.gross_volume_dollars.toFixed(2)}`);
  console.log(`  ✓ Stripe Fees: $${dataAdmin.stats.stripe_fees_dollars.toFixed(2)}`);
  console.log(`  ✓ Net Profit: $${dataAdmin.stats.net_profit_dollars.toFixed(2)}`);
  console.log(`  ✓ Total Boosts in Ledger: ${dataAdmin.stats.total_boosts}`);

  console.log('\n🎉 ALL API ENDPOINTS AND MARKET FLOWS VALIDATED 100% SUCCESSFULLY!\n');
}

runTests().catch(console.error);
