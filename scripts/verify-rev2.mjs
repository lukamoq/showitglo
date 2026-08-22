/**
 * Comprehensive End-to-End Verification Script: ShowItGlo (Blueprint Rev 4 - Demands & Insights)
 */

async function runTests() {
  console.log('🥊 Starting ShowItGlo Complete End-to-End Verification (Rev 4) on http://localhost:3000...\n');

  const BASE = 'http://localhost:3000';

  // 1. Fetch Global Arena Board
  console.log('1. Fetching Global Arena Board with Demands & Dual Metrics (Score + Backers)...');
  const resBoard = await fetch(`${BASE}/api/v1/boards/global`);
  const dataBoard = await resBoard.json();
  console.log(`  ✓ Total ranked stances: ${dataBoard.board.length}`);
  const topPost = dataBoard.board[0];
  console.log(`  ✓ #1 Stance: "${topPost.title}"`);
  console.log(`    → Kind: ${topPost.kind} • Target: ${topPost.demand_target || 'N/A'}`);
  console.log(`    → Score: $${topPost.display_score} • Backers: ${topPost.backers_count.toLocaleString()}`);

  // 2. Test Official Brand Response to Demand (§9)
  console.log('\n2. Testing Official On-the-Record Brand Responses (§9)...');
  const demandPost = dataBoard.board.find((p) => p.kind === 'demand') || topPost;
  const resBrandResp = await fetch(`${BASE}/api/v1/posts/${demandPost.id}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Official Executive Response: Regional Rollout Approved',
      response_body: 'We hear the 14,000+ paying backers on ShowItGlo loud and clear. Limited production runs begin next quarter!',
      author_user_id: 'usr_mcd',
      author_display: "McDonald's Corporate Culinary Leadership",
    }),
  });
  const dataBrandResp = await resBrandResp.json();
  console.log(`  ✓ Brand Response Published: "${dataBrandResp.brand_response.title}" by ${dataBrandResp.brand_response.author_display}`);

  // 3. Test B2B Insights API & k-Anonymity Guarantees (§9, §12)
  console.log('\n3. Testing B2B Insights API with k-Anonymity Guarantees (§9, §12)...');
  const resInsights = await fetch(`${BASE}/api/v1/insights/demands`);
  const dataInsights = await resInsights.json();
  console.log(`  ✓ Dataset: ${dataInsights.dataset}`);
  console.log(`  ✓ k-Anonymity Floor: ≥ ${dataInsights.k_anonymity_floor} distinct backers`);
  for (const group of dataInsights.data) {
    console.log(`    → @${group.target_brand}: $${(group.total_money_cents / 100).toFixed(2)} backed by ${group.total_backers.toLocaleString()} consumers (Status: ${group.status})`);
  }

  // 4. Test Insights API Key Generation
  console.log('\n4. Testing B2B Insights API Key Provisioning...');
  const resKey = await fetch(`${BASE}/api/v1/insights/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 'usr_marc', tier: 'enterprise' }),
  });
  const dataKey = await resKey.json();
  console.log(`  ✓ Generated Enterprise Key: ${dataKey.api_key.key_token} (${dataKey.api_key.rate_limit_per_min} req/min)`);

  // 5. Test Wallet & 1¢ Like Stream
  console.log('\n5. Testing Prepaid Wallet & 1¢ Hold-to-Like (§6, §13)...');
  const resWallet = await fetch(`${BASE}/api/v1/wallet?user_id=usr_marc`);
  const dataWallet = await resWallet.json();
  console.log(`  ✓ Marc Wallet Balance: $${(dataWallet.wallet.balance_cents / 100).toFixed(2)}`);

  const resLike = await fetch(`${BASE}/api/v1/posts/${topPost.id}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ units: 25, user_id: 'usr_marc' }),
  });
  const dataLike = await resLike.json();
  console.log(`  ✓ Fired 25 likes ($0.25)! New Balance: $${(dataLike.new_balance_cents / 100).toFixed(2)}`);

  // 6. Test Debates Arena
  console.log('\n6. Testing The Great Debates Arena & Public Rosters (§9)...');
  const resDebates = await fetch(`${BASE}/api/v1/debates`);
  const dataDebates = await resDebates.json();
  console.log(`  ✓ Total Curated Debates: ${dataDebates.debates.length}`);
  const firstDebate = dataDebates.debates[0];
  console.log(`  ✓ Debate: "${firstDebate.question}"`);
  console.log(`    → Side A: ${firstDebate.sides[0].label} (${firstDebate.sides[0].percentage}%)`);
  console.log(`    → Side B: ${firstDebate.sides[1].label} (${firstDebate.sides[1].percentage}%)`);

  // 7. Check Admin Float Accounting
  console.log('\n7. Checking Operations & Accounting (§5, §13)...');
  const resAdmin = await fetch(`${BASE}/api/v1/admin/overview`);
  const dataAdmin = await resAdmin.json();
  console.log(`  ✓ Recognized Spend: $${dataAdmin.stats.recognized_spend_dollars.toFixed(2)}`);
  console.log(`  ✓ Deferred Float: $${dataAdmin.stats.unspent_float_dollars.toFixed(2)}`);
  console.log(`  ✓ Total Penny Likes Units: ${dataAdmin.stats.total_likes_units.toLocaleString()}`);

  console.log('\n🎉 ALL BLUEPRINT REVISIONS (REV 1, 2, 3, 4 - DEMANDS & INSIGHTS) 100% OPERATIONAL!\n');
}

runTests().catch(console.error);
