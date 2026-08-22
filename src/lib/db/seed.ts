import { db } from './db';
import { User, Post, Debate, DebateSide } from '../types';
import { calculateStoredDelta } from '../engine/decay';

export function seedDatabase() {
  if (db.isInitialized()) return;

  const now = Date.now();
  const globalCat = db.getCategory('global');
  if (!globalCat) return;

  // 1. Seed Users
  const users: User[] = [
    {
      id: 'usr_marc',
      email: 'marc@shipfast.demo',
      email_verified_at: new Date(now - 30 * 86400000).toISOString(),
      alias: 'Marc (ShipFast)',
      is_profile_public: true,
      brand_verified_at: null,
      stripe_customer_id: 'cus_marc_001',
      role: 'user',
      status: 'active',
      notif_prefs: { inapp: true, email: true, push: true, outbid_digest: true },
      created_at: new Date(now - 30 * 86400000).toISOString(),
      deleted_at: null,
    },
    {
      id: 'usr_alex',
      email: 'alex@romantic.demo',
      email_verified_at: new Date(now - 25 * 86400000).toISOString(),
      alias: 'Alex Vance',
      is_profile_public: true,
      brand_verified_at: null,
      stripe_customer_id: 'cus_alex_002',
      role: 'user',
      status: 'active',
      notif_prefs: { inapp: true, email: true, push: true, outbid_digest: false },
      created_at: new Date(now - 25 * 86400000).toISOString(),
      deleted_at: null,
    },
    {
      id: 'usr_elena',
      email: 'elena@openweights.org',
      email_verified_at: new Date(now - 20 * 86400000).toISOString(),
      alias: 'Dr. Elena Rostova',
      is_profile_public: true,
      brand_verified_at: null,
      stripe_customer_id: 'cus_elena_003',
      role: 'user',
      status: 'active',
      notif_prefs: { inapp: true, email: true, push: true, outbid_digest: true },
      created_at: new Date(now - 20 * 86400000).toISOString(),
      deleted_at: null,
    },
    {
      id: 'usr_kicks',
      email: 'drops@cyberkicks.demo',
      email_verified_at: new Date(now - 15 * 86400000).toISOString(),
      alias: 'CyberKicks Labs',
      is_profile_public: true,
      brand_verified_at: new Date(now - 10 * 86400000).toISOString(),
      stripe_customer_id: 'cus_kicks_004',
      role: 'user',
      status: 'active',
      notif_prefs: { inapp: true, email: true, push: true, outbid_digest: true },
      created_at: new Date(now - 15 * 86400000).toISOString(),
      deleted_at: null,
    },
    {
      id: 'usr_mcd',
      email: 'verified@mcdonalds.demo',
      email_verified_at: new Date(now - 12 * 86400000).toISOString(),
      alias: "McDonald's Verified",
      is_profile_public: true,
      brand_verified_at: new Date(now - 12 * 86400000).toISOString(),
      stripe_customer_id: 'cus_mcd_005',
      role: 'user',
      status: 'active',
      notif_prefs: { inapp: true, email: true, push: true, outbid_digest: true },
      created_at: new Date(now - 12 * 86400000).toISOString(),
      deleted_at: null,
    },
    {
      id: 'usr_admin',
      email: 'admin@showitglo.com',
      email_verified_at: new Date(now - 40 * 86400000).toISOString(),
      alias: 'ShowItGlo Operations',
      is_profile_public: true,
      brand_verified_at: null,
      stripe_customer_id: 'cus_admin_006',
      role: 'admin',
      status: 'active',
      notif_prefs: { inapp: true, email: true, push: true, outbid_digest: true },
      created_at: new Date(now - 40 * 86400000).toISOString(),
      deleted_at: null,
    },
  ];

  for (const u of users) {
    db.upsertUser(u);
    const topupAmount = u.id === 'usr_marc' ? 1000 : u.id === 'usr_alex' ? 1500 : 500;
    db.topupWallet(u.id, topupAmount, `pi_seed_${u.id}`);
  }

  // 2. Seed Posts, Demands & Counter-Opinions with Accessible Micro-Numbers
  const rawPosts = [
    {
      id: 'post_mcd_demand',
      slug: 'mcdonalds-bring-back-szechuan-sauce',
      author_id: 'usr_alex',
      category_id: 'global',
      kind: 'demand' as const,
      demand_target: "McDonald's",
      title: "🍔 McDonald's: Bring back the Szechuan dipping sauce permanently!",
      body: 'Dozens of fans have backed this demand with real conviction. The market has spoken — make Szechuan sauce a permanent menu fixture across all stores.',
      counter_of: null,
      author_display: 'Alex Vance',
      status: 'live' as const,
      total_raised_cents: 1940,
      backers_count: 72,
      like_units: 160,
      streak_days: 6,
      created_at: new Date(now - 6 * 86400000).toISOString(),
      target_dollars_now: 19.40,
    },
    {
      id: 'post_messi',
      slug: 'messi-is-the-undisputed-goat-of-football',
      author_id: 'usr_alex',
      category_id: 'global',
      kind: 'opinion' as const,
      demand_target: null,
      title: '🐐 Lionel Messi is the undisputed GOAT of football history',
      body: '8 Ballon d’Or trophies, World Cup glory in Qatar, unmatched playmaking vision, and pure artistic mastery on the pitch. No debate remains.',
      counter_of: null,
      author_display: 'Alex Vance',
      status: 'live' as const,
      total_raised_cents: 1680,
      backers_count: 58,
      like_units: 140,
      streak_days: 5,
      created_at: new Date(now - 5 * 86400000).toISOString(),
      target_dollars_now: 16.80,
    },
    {
      id: 'post_ronaldo',
      slug: 'ronaldo-5-ucls-clutch-gene-proves-goat',
      author_id: 'usr_marc',
      category_id: 'global',
      kind: 'opinion' as const,
      demand_target: null,
      title: '⚽ Cristiano Ronaldo’s 5 UCLs and clutch gene make him the true GOAT',
      body: 'Highest official goalscorer in history (900+ goals), proved dominance in Premier League, La Liga, and Serie A. The ultimate machine of willpower.',
      counter_of: 'post_messi',
      author_display: 'Marc (ShipFast)',
      status: 'live' as const,
      total_raised_cents: 1490,
      backers_count: 49,
      like_units: 120,
      streak_days: 1,
      created_at: new Date(now - 4 * 86400000).toISOString(),
      target_dollars_now: 14.90,
    },
    {
      id: 'post_tesla_demand',
      slug: 'tesla-physical-buttons-climate-control',
      author_id: 'usr_elena',
      category_id: 'global',
      kind: 'demand' as const,
      demand_target: 'Tesla',
      source_url: 'https://x.com/elonmusk/status/1820000000000000000',
      source_platform: 'x',
      title: '🚗 Tesla: Add physical tactile buttons for wipers and climate control',
      body: 'Fumbling through 3 sub-menus while driving 70mph in torrential rain is a safety hazard. Give drivers dedicated tactile knobs.',
      counter_of: null,
      author_display: 'Dr. Elena Rostova',
      status: 'live' as const,
      total_raised_cents: 1230,
      backers_count: 41,
      like_units: 95,
      streak_days: 2,
      created_at: new Date(now - 3 * 86400000).toISOString(),
      target_dollars_now: 12.30,
    },
    {
      id: 'post_shipfast',
      slug: 'shipfast-bootstrapped-indie-hacker',
      author_id: 'usr_marc',
      category_id: 'global',
      kind: 'opinion' as const,
      demand_target: null,
      title: '🚀 Bootstrapped Micro-SaaS built in 48h beats VC-backed startups every time',
      body: 'Zero dilution, total freedom, customer profitability from Day 1. VC capital creates bloated teams and vanity metrics.',
      counter_of: null,
      author_display: 'Marc (ShipFast)',
      status: 'live' as const,
      total_raised_cents: 980,
      backers_count: 32,
      like_units: 80,
      streak_days: 0,
      created_at: new Date(now - 3 * 86400000).toISOString(),
      target_dollars_now: 9.80,
    },
    {
      id: 'post_vc_ai',
      slug: 'vc-capital-essential-for-frontier-ai',
      author_id: 'usr_elena',
      category_id: 'global',
      kind: 'opinion' as const,
      demand_target: null,
      title: '🤖 Without VC compute capital, you cannot train frontier AI models',
      body: 'Bootstrapping is cute for CRUD wrappers, but cluster infrastructure for 100B+ parameter models requires hundreds of millions of dollars.',
      counter_of: 'post_shipfast',
      author_display: 'Dr. Elena Rostova',
      status: 'live' as const,
      total_raised_cents: 850,
      backers_count: 28,
      like_units: 70,
      streak_days: 0,
      created_at: new Date(now - 2 * 86400000).toISOString(),
      target_dollars_now: 8.50,
    },
    {
      id: 'post_claude',
      slug: 'claude-opus-5-sonnet-5-best-coding-llm',
      author_id: 'usr_marc',
      category_id: 'global',
      kind: 'opinion' as const,
      demand_target: null,
      title: '🤖 Anthropic Claude Opus 5 & Sonnet 5 are the undisputed Coding & Agentic Kings',
      body: 'Adaptive thinking architecture, 1M token context window, 128k output tokens, and unmatched autonomous codebase refactoring with zero hallucinated fluff.',
      counter_of: null,
      author_display: 'Marc (ShipFast)',
      status: 'live' as const,
      total_raised_cents: 2450,
      backers_count: 86,
      like_units: 240,
      streak_days: 7,
      created_at: new Date(now - 7 * 86400000).toISOString(),
      target_dollars_now: 24.50,
    },
    {
      id: 'post_chatgpt',
      slug: 'chatgpt-gpt-5-6-sol-o3-pro-frontier-reasoning',
      author_id: 'usr_elena',
      category_id: 'global',
      kind: 'opinion' as const,
      demand_target: null,
      title: '⚡ OpenAI GPT-5.6 Sol & o3-pro are the pioneer reasoning & ecosystem Kings',
      body: 'GPT-5.6 Sol frontier professional coding, o3/o3-pro deep chain-of-thought STEM logic, and GPT-Realtime voice intelligence across the world’s largest AI developer ecosystem.',
      counter_of: 'post_claude',
      author_display: 'Dr. Elena Rostova',
      status: 'live' as const,
      total_raised_cents: 2180,
      backers_count: 74,
      like_units: 190,
      streak_days: 3,
      created_at: new Date(now - 6 * 86400000).toISOString(),
      target_dollars_now: 21.80,
    },
    {
      id: 'post_gemini',
      slug: 'google-gemini-3-7-flash-3-5-pro-multimodal-king',
      author_id: 'usr_alex',
      category_id: 'global',
      kind: 'opinion' as const,
      demand_target: null,
      title: '🔮 Google Gemini 3.7 Flash & 3.5 Pro are the true Kings with multimodal context & search grounding',
      body: 'Multi-million token context window, sub-second Flash token throughput, native multimodal streaming, and live Google Search grounding without stale knowledge cutoffs.',
      counter_of: 'post_claude',
      author_display: 'Alex Vance',
      status: 'live' as const,
      total_raised_cents: 1820,
      backers_count: 62,
      like_units: 150,
      streak_days: 2,
      created_at: new Date(now - 5 * 86400000).toISOString(),
      target_dollars_now: 18.20,
    },
    {
      id: 'post_grok',
      slug: 'xai-grok-4-6-colossus-uncensored-truth',
      author_id: 'usr_vitalik',
      category_id: 'global',
      kind: 'opinion' as const,
      demand_target: null,
      title: '🚀 xAI Grok 4.6 (Colossus Cluster) is the raw compute & real-time truth King',
      body: 'Trained on the 100k+ GPU Colossus cluster with real-time X social pulse monitoring, long-running agent workflows, and unfiltered truth answering without moralizing guardrails.',
      counter_of: 'post_claude',
      author_display: 'Vitalik Fan',
      status: 'live' as const,
      total_raised_cents: 1560,
      backers_count: 51,
      like_units: 130,
      streak_days: 1,
      created_at: new Date(now - 4 * 86400000).toISOString(),
      target_dollars_now: 15.60,
    },
  ];

  for (const p of rawPosts) {
    const t0 = new Date(globalCat.score_epoch).getTime();
    const halfLifeMs = globalCat.half_life_hours * 3600 * 1000;
    const factor = Math.pow(2, (now - t0) / halfLifeMs);
    const scoreBase = (p.target_dollars_now * 100) * factor;

    const post: Post = {
      id: p.id,
      slug: p.slug,
      author_id: p.author_id,
      category_id: p.category_id,
      kind: p.kind,
      demand_target: p.demand_target,
      title: p.title,
      body: p.body,
      is_ad: false,
      counter_of: p.counter_of,
      author_display: p.author_display,
      status: p.status,
      score_base: scoreBase,
      total_raised_cents: p.total_raised_cents,
      backers_count: p.backers_count,
      like_units: p.like_units,
      streak_days: p.streak_days,
      created_at: p.created_at,
    };

    db.createPost(post);

    const backerNames = ['Vitalik F.', 'Sarah M.', 'Guillermo R.', 'Dan A.', 'Linus T.', 'Crowd Patriot', 'Anon Whale'];
    for (let i = 0; i < Math.min(p.backers_count, 5); i++) {
      const backerUser = users[i % users.length];
      db.recordInteraction({
        postId: post.id,
        userId: backerUser.id,
        kind: i === 0 ? 'super' : 'boost',
        units: i === 0 ? 100 : 10,
        amountCents: i === 0 ? 100 : 10,
        payerDisplay: backerNames[i % backerNames.length],
      });
    }
  }

  // 3. Official Brand Response on McDonald's Demand (§9)
  db.createBrandResponse({
    postId: 'post_mcd_demand',
    authorUserId: 'usr_mcd',
    authorDisplay: "McDonald's Corporate Culinary Team",
    title: 'Official Response: Limited Regional Batch Testing Approved!',
    body: 'We have seen the $5,120+ backed by 14,800 loyal fans here on ShowItGlo. In response to this clear consumer mandate, we are launching an exclusive Szechuan Sauce limited batch across 250 flagship metropolitan restaurants starting October 2026.',
  });

  // 4. Seed Debates & Multi-Faction Wars (§9)
  const debatesData = [
    {
      debate: {
        id: 'deb_llm_war',
        slug: 'claude-vs-chatgpt-vs-gemini-vs-grok',
        question: '👑 The Ultimate LLM War: Who is the undisputed King — Claude Opus 5, GPT-5.6 Sol, Gemini 3.7 Flash, or Grok 4.6?',
        status: 'live' as const,
        curated: true,
        is_political: false,
        category_id: 'global',
        sponsor_user_id: 'usr_marc',
        sponsor_label: 'Featured 4-Way Multi-Faction War',
        created_at: new Date(now - 12 * 86400000).toISOString(),
      },
      sides: [
        { debate_id: 'deb_llm_war', side_key: 'claude', label: 'Claude (Opus 5 & Adaptive Thinking)', post_id: 'post_claude' },
        { debate_id: 'deb_llm_war', side_key: 'chatgpt', label: 'ChatGPT (GPT-5.6 Sol & o3-pro)', post_id: 'post_chatgpt' },
        { debate_id: 'deb_llm_war', side_key: 'gemini', label: 'Gemini (3.7 Flash & 2M Context)', post_id: 'post_gemini' },
        { debate_id: 'deb_llm_war', side_key: 'grok', label: 'Grok (4.6 Colossus & Real-time X)', post_id: 'post_grok' },
      ],
    },
    {
      debate: {
        id: 'deb_football',
        slug: 'messi-vs-ronaldo',
        question: 'Who is the undisputed GOAT of modern football?',
        status: 'live' as const,
        curated: true,
        is_political: false,
        category_id: 'global',
        sponsor_user_id: 'usr_kicks',
        sponsor_label: 'Presented by CyberKicks Labs',
        created_at: new Date(now - 10 * 86400000).toISOString(),
      },
      sides: [
        { debate_id: 'deb_football', side_key: 'messi', label: 'Team Messi (Playmaking & World Cup)', post_id: 'post_messi' },
        { debate_id: 'deb_football', side_key: 'ronaldo', label: 'Team Ronaldo (5 UCLs & 900+ Goals)', post_id: 'post_ronaldo' },
      ],
    },
    {
      debate: {
        id: 'deb_startups',
        slug: 'bootstrapped-vs-vc',
        question: 'Bootstrapping vs VC Capital: How should founders build in 2026?',
        status: 'live' as const,
        curated: true,
        is_political: false,
        category_id: 'global',
        sponsor_user_id: null,
        sponsor_label: null,
        created_at: new Date(now - 8 * 86400000).toISOString(),
      },
      sides: [
        { debate_id: 'deb_startups', side_key: 'bootstrap', label: 'Team Bootstrapped Freedom', post_id: 'post_shipfast' },
        { debate_id: 'deb_startups', side_key: 'vc', label: 'Team VC Frontier Scale', post_id: 'post_vc_ai' },
      ],
    },
  ];

  for (const item of debatesData) {
    db.createDebate(item.debate, item.sides);
  }

  // Seed initial community opinions for the 4-way LLM War with researched architectures
  db.addDebateOpinion({
    debateId: 'deb_llm_war',
    sideKey: 'claude',
    authorName: 'Alex (Principal Eng)',
    text: 'Claude Opus 5 with adaptive thinking and 1M token context refactors complex microservice repositories without breaking type invariants.',
    isPaid: true,
    amountCents: 100,
  });

  db.addDebateOpinion({
    debateId: 'deb_llm_war',
    sideKey: 'chatgpt',
    authorName: 'Sarah (AI Researcher)',
    text: 'GPT-5.6 Sol combined with o3-pro chain-of-thought solves competitive mathematical Olympiad benchmarks that break other models.',
    isPaid: false,
    amountCents: 0,
  });

  db.addDebateOpinion({
    debateId: 'deb_llm_war',
    sideKey: 'gemini',
    authorName: 'David K.',
    text: 'Gemini 3.7 Flash executes complex multi-step tool calls at sub-second latency with real-time Google Search grounding.',
    isPaid: false,
    amountCents: 0,
  });

  db.addDebateOpinion({
    debateId: 'deb_llm_war',
    sideKey: 'grok',
    authorName: 'CryptoWhale',
    text: 'Grok 4.6 on the Colossus 100k GPU cluster analyzes live global sentiment on X seconds after events occur with zero moralizing filters.',
    isPaid: true,
    amountCents: 50,
  });

  // 5. Seed API Key for Insights (§9, §12)
  db.createApiKey('usr_marc', 'growth');

  // 6. Historical snapshots
  for (let d = 5; d >= 1; d--) {
    const dateObj = new Date(now - d * 86400000);
    const dateStr = dateObj.toISOString().split('T')[0];
    db.saveDailySnapshot(dateStr, 'global');
  }

  db.markInitialized();
}

seedDatabase();
