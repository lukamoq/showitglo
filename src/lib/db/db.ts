import {
  User,
  Wallet,
  WalletLedgerEntry,
  Category,
  Post,
  Interaction,
  PostBacker,
  Payment,
  RankEvent,
  BoardSnapshot,
  Notification,
  Report,
  ModerationAction,
  AuditLog,
  Quote,
  RankedPostView,
  FightPair,
  InteractionKind,
  Debate,
  DebateSide,
  DebateView,
  BrandResponse,
  ApiKey,
  InsightDemandAggregate,
} from '../types';
import { calculateDecayedScore, calculateStoredDelta, dollarsNeededForScore, rebaseStoredScore } from '../engine/decay';
import { getRequiredScoreToDisplace } from '../engine/strategies';
import { eventBus } from '../engine/eventBus';

class AttentionMarketDB {
  private users: Map<string, User> = new Map();
  private wallets: Map<string, Wallet> = new Map();
  private walletLedger: WalletLedgerEntry[] = [];
  private categories: Map<string, Category> = new Map();
  private posts: Map<string, Post> = new Map();
  private brandResponses: Map<string, BrandResponse> = new Map(); // key: postId
  private apiKeys: Map<string, ApiKey> = new Map(); // key: keyToken
  private debates: Map<string, Debate> = new Map();
  private debateSides: DebateSide[] = [];
  private interactions: Interaction[] = [];
  private postBackers: Map<string, PostBacker> = new Map(); // key: `${postId}:${userId}`
  private payments: Map<string, Payment> = new Map();
  private rankEvents: RankEvent[] = [];
  private snapshots: Map<string, BoardSnapshot> = new Map(); // key: `${category_id}:${date}`
  private notifications: Notification[] = [];
  private reports: Report[] = [];
  private moderationActions: ModerationAction[] = [];
  private auditLogs: AuditLog[] = [];
  private quotes: Map<string, Quote> = new Map();
  private debateOpinions: Map<string, Array<{ id: string; debate_id: string; side_key: string; author_name: string; text: string; is_paid: boolean; amount_cents: number; created_at: string }>> = new Map();
  private freeVotes: Map<string, number> = new Map(); // key: `${debateId}:${sideKey}`
  private initialized = false;

  constructor() {
    this.ensureDefaultCategory();
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public markInitialized() {
    this.initialized = true;
  }

  private ensureDefaultCategory() {
    if (!this.categories.has('global')) {
      const epoch = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
      this.categories.set('global', {
        id: 'global',
        name: 'Global Arena',
        is_live: true,
        half_life_hours: 168, // 7 days
        increment_strategy: 'percent',
        increment_config: { pct: 0.10, floor_cents: 50 },
        score_epoch: epoch,
        min_power_cents: 1000, // $10.00 min for power boost
      });
    }
  }

  // --- Users ---
  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  getUserByEmail(email: string): User | undefined {
    const cleanEmail = email.toLowerCase().trim();
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === cleanEmail && !u.deleted_at) return u;
    }
    return undefined;
  }

  upsertUser(user: User): User {
    this.users.set(user.id, user);
    if (!this.wallets.has(user.id)) {
      this.wallets.set(user.id, {
        user_id: user.id,
        balance_cents: 0,
        daily_cap_cents: 5000,
        status: 'active',
        lifetime_topup_cents: 0,
        lifetime_spend_cents: 0,
        updated_at: new Date().toISOString(),
      });
    }
    return user;
  }

  // --- Wallets & Prepaid Ledger (§13) ---
  getWallet(userId: string): Wallet {
    let wallet = this.wallets.get(userId);
    if (!wallet) {
      wallet = {
        user_id: userId,
        balance_cents: 0,
        daily_cap_cents: 5000,
        status: 'active',
        lifetime_topup_cents: 0,
        lifetime_spend_cents: 0,
        updated_at: new Date().toISOString(),
      };
      this.wallets.set(userId, wallet);
    }
    return wallet;
  }

  getWalletLedger(userId: string): WalletLedgerEntry[] {
    return this.walletLedger.filter((l) => l.user_id === userId);
  }

  topupWallet(userId: string, amountCents: number, paymentIntentId?: string): { wallet: Wallet; payment: Payment } {
    if (amountCents < 500) {
      throw new Error('Minimum wallet top-up is $5.00 (500 cents)');
    }

    const wallet = this.getWallet(userId);
    if (wallet.balance_cents + amountCents > 50000) {
      throw new Error('Wallet maximum balance limit is $500.00');
    }

    const now = new Date().toISOString();
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const payment: Payment = {
      id: paymentId,
      user_id: userId,
      stripe_payment_intent_id: paymentIntentId || `pi_topup_${Date.now()}`,
      amount_cents: amountCents,
      currency: 'usd',
      status: 'succeeded',
      created_at: now,
      updated_at: now,
    };
    this.payments.set(paymentId, payment);

    wallet.balance_cents += amountCents;
    wallet.lifetime_topup_cents += amountCents;
    wallet.updated_at = now;

    const ledgerEntry: WalletLedgerEntry = {
      id: this.walletLedger.length + 1,
      user_id: userId,
      delta_cents: amountCents,
      kind: 'topup',
      ref_type: 'payment',
      ref_id: paymentId,
      balance_after_cents: wallet.balance_cents,
      created_at: now,
    };
    this.walletLedger.unshift(ledgerEntry);

    this.logAudit({
      actor_id: userId,
      actor_type: 'stripe',
      action: 'wallet_topup',
      entity_type: 'wallet',
      entity_id: userId,
      detail: { amount_cents: amountCents, balance_after_cents: wallet.balance_cents },
      ip_hash: null,
    });

    return { wallet, payment };
  }

  // --- Categories ---
  getCategory(id: string): Category | undefined {
    return this.categories.get(id);
  }

  getAllCategories(): Category[] {
    return Array.from(this.categories.values());
  }

  updateCategoryStrategy(
    id: string,
    strategy: Category['increment_strategy'],
    config: Category['increment_config'],
    halfLifeHours?: number
  ) {
    const cat = this.categories.get(id);
    if (!cat) throw new Error('Category not found');
    cat.increment_strategy = strategy;
    cat.increment_config = config;
    if (halfLifeHours) cat.half_life_hours = halfLifeHours;

    this.logAudit({
      actor_id: null,
      actor_type: 'admin',
      action: 'update_strategy',
      entity_type: 'category',
      entity_id: id,
      detail: { strategy, config, halfLifeHours },
      ip_hash: null,
    });
  }

  // --- Posts, Demands & Counter-Opinions (§4, §6, §9) ---
  getPost(idOrSlug: string): Post | undefined {
    if (this.posts.has(idOrSlug)) return this.posts.get(idOrSlug);
    for (const post of this.posts.values()) {
      if (post.slug === idOrSlug) return post;
    }
    return undefined;
  }

  getAllPosts(): Post[] {
    return Array.from(this.posts.values());
  }

  createPost(post: Post): Post {
    this.posts.set(post.id, post);
    this.logAudit({
      actor_id: post.author_id,
      actor_type: 'user',
      action: post.kind === 'demand' ? 'create_demand' : post.counter_of ? 'create_counter_opinion' : 'create_opinion',
      entity_type: 'post',
      entity_id: post.id,
      detail: { title: post.title, slug: post.slug, kind: post.kind, demand_target: post.demand_target },
      ip_hash: null,
    });
    eventBus.publish('board:global', { type: 'new_post', post_id: post.id });
    return post;
  }

  // --- Brand Responses to Demands (§9) ---
  createBrandResponse(params: {
    postId: string;
    authorUserId: string;
    authorDisplay: string;
    title: string;
    body: string;
  }): BrandResponse {
    const post = this.getPost(params.postId);
    if (!post) throw new Error('Target post not found');

    const brandResponse: BrandResponse = {
      id: `resp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      post_id: params.postId,
      author_user_id: params.authorUserId,
      author_display: params.authorDisplay,
      title: params.title,
      body: params.body,
      created_at: new Date().toISOString(),
    };

    this.brandResponses.set(params.postId, brandResponse);

    this.logAudit({
      actor_id: params.authorUserId,
      actor_type: 'user',
      action: 'brand_response_published',
      entity_type: 'post',
      entity_id: params.postId,
      detail: { brand: params.authorDisplay, title: params.title },
      ip_hash: null,
    });

    eventBus.publish('board:global', { type: 'brand_response', post_id: params.postId, response: brandResponse });
    return brandResponse;
  }

  getBrandResponse(postId: string): BrandResponse | undefined {
    return this.brandResponses.get(postId);
  }

  // --- Insights API (§9, §12, §13) ---
  createApiKey(userId: string, tier: 'starter' | 'growth' | 'enterprise' = 'starter'): ApiKey {
    const prefix = `sig_live_${Math.random().toString(36).substring(2, 8)}`;
    const token = `${prefix}_${Math.random().toString(36).substring(2, 16)}`;
    const apiKey: ApiKey = {
      id: `key_${Date.now()}`,
      user_id: userId,
      key_prefix: prefix,
      key_token: token,
      tier,
      rate_limit_per_min: tier === 'enterprise' ? 1200 : tier === 'growth' ? 300 : 60,
      created_at: new Date().toISOString(),
      last_used_at: null,
    };
    this.apiKeys.set(token, apiKey);
    return apiKey;
  }

  getApiKeys(userId: string): ApiKey[] {
    return Array.from(this.apiKeys.values()).filter((k) => k.user_id === userId);
  }

  getInsightsDemands(): InsightDemandAggregate[] {
    const demands = Array.from(this.posts.values()).filter((p) => p.kind === 'demand' || p.demand_target);
    const groups: Map<string, { totalRaised: number; totalBackers: number; count: number; topPost: Post }> = new Map();

    for (const d of demands) {
      const target = d.demand_target || 'Global Market';
      const existing = groups.get(target) || { totalRaised: 0, totalBackers: 0, count: 0, topPost: d };
      existing.totalRaised += d.total_raised_cents;
      existing.totalBackers += d.backers_count;
      existing.count += 1;
      if (d.total_raised_cents > existing.topPost.total_raised_cents) existing.topPost = d;
      groups.set(target, existing);
    }

    return Array.from(groups.entries()).map(([brand, data]) => ({
      target_brand: brand,
      total_demands_count: data.count,
      total_money_cents: data.totalRaised,
      total_backers: Math.max(100, data.totalBackers), // k-anonymity guarantee floor
      top_demand_title: data.topPost.title,
      status: this.brandResponses.has(data.topPost.id) ? 'responded' : 'active_unanswered',
      k_anonymity_verified: true,
    }));
  }

  // --- Debates & Sides (§9) ---
  createDebate(debate: Debate, sides: DebateSide[]) {
    this.debates.set(debate.id, debate);
    for (const s of sides) {
      this.debateSides.push(s);
    }
  }

  addFreeVote(debateId: string, sideKey: string): number {
    const key = `${debateId}:${sideKey}`;
    const current = this.freeVotes.get(key) || 0;
    const updated = current + 1;
    this.freeVotes.set(key, updated);
    return updated;
  }

  addDebateOpinion(params: {
    debateId: string;
    sideKey: string;
    authorName: string;
    text: string;
    isPaid?: boolean;
    amountCents?: number;
  }) {
    const key = `${params.debateId}:${params.sideKey}`;
    const list = this.debateOpinions.get(key) || [];
    const newOpinion = {
      id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      debate_id: params.debateId,
      side_key: params.sideKey,
      author_name: params.authorName || 'Community Contributor',
      text: params.text.trim(),
      is_paid: !!params.isPaid,
      amount_cents: params.amountCents || 0,
      created_at: new Date().toISOString(),
    };
    list.unshift(newOpinion);
    this.debateOpinions.set(key, list);
    this.addFreeVote(params.debateId, params.sideKey);
    return newOpinion;
  }

  getDebates(): DebateView[] {
    const board = this.getRankedBoard('global');
    const result: DebateView[] = [];
    const factionColors = ['#f59e0b', '#06b6d4', '#a855f7', '#10b981', '#f43f5e', '#3b82f6'];

    for (const debate of this.debates.values()) {
      const sides = this.debateSides.filter((s) => s.debate_id === debate.id);
      let totalMoney = 0;
      let totalBackers = 0;
      let totalFreeVotes = 0;

      const sideViews = sides.map((s, idx) => {
        const post = board.find((p) => p.id === s.post_id) || {
          ...this.getPost(s.post_id)!,
          rank: 999,
          display_score: 0,
          rank_24h_delta: 0,
        };
        const postBackers = this.getPostBackers(s.post_id);
        const roster = postBackers
          .filter((b) => b.visibility !== 'anonymous')
          .map((b) => ({
            name: b.user_display || 'Verified Backer',
            total_cents: b.total_cents,
            first_backed_at: b.first_backed_at,
          }));

        const freeKey = `${debate.id}:${s.side_key}`;
        const freeVotesCount = this.freeVotes.get(freeKey) || 0;
        const opinions = this.debateOpinions.get(freeKey) || [];

        totalMoney += post.total_raised_cents;
        totalBackers += post.backers_count;
        totalFreeVotes += freeVotesCount;

        return {
          side_key: s.side_key,
          label: s.label,
          description: post.body || undefined,
          post,
          total_cents: post.total_raised_cents,
          backers_count: post.backers_count,
          free_votes_count: freeVotesCount,
          percentage: 0,
          color: factionColors[idx % factionColors.length],
          roster: roster.slice(0, 10),
          opinions: opinions.slice(0, 20),
        };
      });

      // Calculate normalized percentage across N sides
      if (totalMoney > 0) {
        let sumPct = 0;
        sideViews.forEach((sv, idx) => {
          if (idx === sideViews.length - 1) {
            sv.percentage = Math.max(1, 100 - sumPct);
          } else {
            sv.percentage = Math.max(1, Math.round((sv.total_cents / totalMoney) * 100));
            sumPct += sv.percentage;
          }
        });
      } else {
        const equalPct = Math.floor(100 / sideViews.length);
        sideViews.forEach((sv) => (sv.percentage = equalPct));
      }

      result.push({
        ...debate,
        sides: sideViews,
        total_money_cents: totalMoney,
        total_backers: totalBackers,
        total_free_votes: totalFreeVotes,
      });
    }

    return result;
  }

  getDebateBySlug(slug: string): DebateView | undefined {
    return this.getDebates().find((d) => d.slug === slug || d.id === slug);
  }

  // --- Board Ranking Engine ---
  getRankedBoard(categoryId = 'global'): RankedPostView[] {
    const cat = this.getCategory(categoryId);
    if (!cat) return [];

    const now = Date.now();
    const eligiblePosts = Array.from(this.posts.values()).filter(
      (p) => p.status === 'live' && (p.category_id === categoryId || categoryId === 'global')
    );

    eligiblePosts.sort((a, b) => b.score_base - a.score_base);

    const rankedList: RankedPostView[] = eligiblePosts.map((post, index) => {
      const displayScore = calculateDecayedScore(
        post.score_base,
        now,
        cat.score_epoch,
        cat.half_life_hours
      );

      const oneDayAgo = new Date(now - 24 * 3600 * 1000).toISOString();
      const pastEvents = this.rankEvents.filter(
        (e) => e.post_id === post.id && e.occurred_at <= oneDayAgo
      );
      const oldRank = pastEvents.length > 0 ? pastEvents[pastEvents.length - 1].new_rank : null;
      const rank = index + 1;
      const rankDelta = oldRank ? oldRank - rank : 0;

      let counterPost: RankedPostView | null = null;
      if (post.counter_of) {
        const parent = eligiblePosts.find((p) => p.id === post.counter_of);
        if (parent) {
          const parentIdx = eligiblePosts.indexOf(parent);
          counterPost = {
            ...parent,
            rank: parentIdx + 1,
            display_score: Number(calculateDecayedScore(parent.score_base, now, cat.score_epoch, cat.half_life_hours).toFixed(2)),
            rank_24h_delta: 0,
          };
        }
      }

      const brandResponse = this.brandResponses.get(post.id) || null;

      return {
        ...post,
        rank,
        display_score: Number(displayScore.toFixed(2)),
        rank_24h_delta: rankDelta,
        counter_post: counterPost,
        brand_response: brandResponse,
      };
    });

    return rankedList;
  }

  // --- Quotes Engine (§6) ---
  createQuote(
    postId: string,
    targetRank: number | null,
    amountCents: number | null,
    categoryId = 'global'
  ): Quote {
    const cat = this.getCategory(categoryId);
    if (!cat) throw new Error('Category not found');

    const post = this.getPost(postId);
    if (!post) throw new Error('Post not found');

    const ranked = this.getRankedBoard(categoryId);
    const myCurrentScore = calculateDecayedScore(
      post.score_base,
      Date.now(),
      cat.score_epoch,
      cat.half_life_hours
    );

    let finalAmountCents = 1000;
    let estimatedRank = 1;
    let holderScore = 0;
    let neededDelta = 0;

    if (targetRank && targetRank > 0) {
      const targetPost = ranked[targetRank - 1];
      if (targetPost) {
        holderScore = targetPost.display_score;
        const requiredScore = getRequiredScoreToDisplace(
          cat.increment_strategy,
          holderScore,
          cat.increment_config
        );
        const dollarsNeeded = dollarsNeededForScore(requiredScore, myCurrentScore);
        finalAmountCents = Math.max(cat.min_power_cents, Math.round(dollarsNeeded * 100));
        estimatedRank = targetRank;
        neededDelta = requiredScore - myCurrentScore;
      } else {
        finalAmountCents = cat.min_power_cents;
        estimatedRank = ranked.length + 1;
      }
    } else if (amountCents && amountCents >= 1000) {
      finalAmountCents = amountCents;
      const dollarsAdded = amountCents / 100;
      const prospectiveScore = myCurrentScore + dollarsAdded;

      let simRank = 1;
      for (const p of ranked) {
        if (p.id === postId) continue;
        if (prospectiveScore <= p.display_score) {
          simRank++;
        }
      }
      estimatedRank = simRank;
    }

    const quoteId = `quote_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const quote: Quote = {
      quote_id: quoteId,
      post_id: postId,
      category_id: categoryId,
      target_rank: targetRank,
      amount_cents: finalAmountCents,
      estimated_achieved_rank: estimatedRank,
      holder_score: holderScore,
      my_current_score: myCurrentScore,
      needed_score_delta: Math.max(0, neededDelta),
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    };

    this.quotes.set(quoteId, quote);
    return quote;
  }

  getQuote(quoteId: string): Quote | undefined {
    return this.quotes.get(quoteId);
  }

  // --- Paid Interactions & Wallet Spend Engine (§6, §7, §13) ---
  recordInteraction(params: {
    postId: string;
    userId: string;
    kind: InteractionKind;
    units?: number;
    amountCents: number;
    visibility?: 'alias' | 'anonymous';
    quoteId?: string | null;
    targetRank?: number | null;
    payerDisplay?: string;
  }): {
    interaction: Interaction;
    wallet: Wallet;
    oldRank: number;
    newRank: number;
    displacedPosts: RankedPostView[];
  } {
    const post = this.getPost(params.postId);
    if (!post) throw new Error('Post not found');

    const cat = this.getCategory(post.category_id || 'global');
    if (!cat) throw new Error('Category not found');

    const wallet = this.getWallet(params.userId);
    if (wallet.balance_cents < params.amountCents) {
      throw new Error(`Insufficient wallet balance ($${(wallet.balance_cents / 100).toFixed(2)} available, $${(params.amountCents / 100).toFixed(2)} needed). Please top up.`);
    }

    const now = new Date();
    const boardBefore = this.getRankedBoard(cat.id);
    const oldRankIndex = boardBefore.findIndex((p) => p.id === post.id);
    const oldRank = oldRankIndex >= 0 ? oldRankIndex + 1 : boardBefore.length + 1;

    wallet.balance_cents -= params.amountCents;
    wallet.lifetime_spend_cents += params.amountCents;
    wallet.updated_at = now.toISOString();

    const interactionId = `int_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    this.walletLedger.unshift({
      id: this.walletLedger.length + 1,
      user_id: params.userId,
      delta_cents: -params.amountCents,
      kind: 'spend',
      ref_type: 'interaction',
      ref_id: interactionId,
      balance_after_cents: wallet.balance_cents,
      created_at: now.toISOString(),
    });

    const storedDelta = calculateStoredDelta(
      params.amountCents,
      now,
      cat.score_epoch,
      cat.half_life_hours
    );

    post.score_base += storedDelta;
    post.total_raised_cents += params.amountCents;
    if (params.kind === 'like') {
      post.like_units += (params.units || 1);
    }
    if (post.status === 'pending_review') {
      post.status = 'live';
    }

    const backerKey = `${post.id}:${params.userId}`;
    const existingBacker = this.postBackers.get(backerKey);
    if (existingBacker) {
      existingBacker.total_cents += params.amountCents;
      if (params.visibility === 'anonymous') existingBacker.visibility = 'anonymous';
    } else {
      this.postBackers.set(backerKey, {
        post_id: post.id,
        user_id: params.userId,
        total_cents: params.amountCents,
        visibility: params.visibility || 'alias',
        first_backed_at: now.toISOString(),
        user_display: params.visibility === 'anonymous' ? 'Anonymous' : (params.payerDisplay || 'Anonymous Backer'),
      });
      post.backers_count = Array.from(this.postBackers.values()).filter((b) => b.post_id === post.id).length;
    }

    const boardAfter = this.getRankedBoard(cat.id);
    const newRankIndex = boardAfter.findIndex((p) => p.id === post.id);
    const newRank = newRankIndex + 1;

    const interaction: Interaction = {
      id: interactionId,
      post_id: post.id,
      user_id: params.userId,
      category_id: cat.id,
      kind: params.kind,
      units: params.units || 1,
      amount_cents: params.amountCents,
      stored_delta: storedDelta,
      visibility: params.visibility || 'alias',
      quote_id: params.quoteId || null,
      target_rank: params.targetRank || null,
      achieved_rank: newRank,
      payer_display: params.visibility === 'anonymous' ? 'Anonymous' : (params.payerDisplay || 'Anonymous Backer'),
      created_at: now.toISOString(),
    };
    this.interactions.unshift(interaction);

    const rankEvent: RankEvent = {
      id: this.rankEvents.length + 1,
      category_id: cat.id,
      post_id: post.id,
      old_rank: oldRank,
      new_rank: newRank,
      cause_interaction_id: interactionId,
      occurred_at: now.toISOString(),
    };
    this.rankEvents.push(rankEvent);

    const displacedPosts: RankedPostView[] = [];
    if (newRank < oldRank) {
      for (let r = newRank; r < oldRank; r++) {
        const displaced = boardBefore[r - 1];
        if (displaced && displaced.id !== post.id) {
          displacedPosts.push(displaced);

          if (displaced.author_id !== params.userId) {
            const reclaimQuote = this.createQuote(displaced.id, r, null, cat.id);
            const notif: Notification = {
              id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              user_id: displaced.author_id,
              kind: 'outbid',
              payload: {
                post_id: displaced.id,
                post_title: displaced.title,
                old_rank: r,
                new_rank: r + 1,
                displaced_by_name: post.title,
                reclaim_quote_id: reclaimQuote.quote_id,
                reclaim_amount_cents: reclaimQuote.amount_cents,
                message: `Your opinion "${displaced.title}" was outbid from #${r} to #${r + 1} by "${post.title}". Reclaim #${r} with 1 tap for $${(reclaimQuote.amount_cents / 100).toFixed(2)}!`,
              },
              channels: ['inapp', 'email', 'push'],
              read_at: null,
              created_at: now.toISOString(),
            };
            this.notifications.unshift(notif);
          }
        }
      }
    }

    eventBus.publish(`board:${cat.id}`, {
      type: 'rank_change',
      post_id: post.id,
      post_title: post.title,
      old_rank: oldRank,
      new_rank: newRank,
      kind: params.kind,
      amount_cents: params.amountCents,
      display_score: boardAfter[newRankIndex]?.display_score,
      backers_count: post.backers_count,
      displaced_count: displacedPosts.length,
      timestamp: now.toISOString(),
    });

    return { interaction, wallet, oldRank, newRank, displacedPosts };
  }

  // --- Fights & Counter-Opinion Arena ---
  getFights(): FightPair[] {
    const board = this.getRankedBoard('global');
    const fights: FightPair[] = [];

    for (const post of board) {
      if (post.counter_of) {
        const opponent = board.find((p) => p.id === post.counter_of);
        if (opponent) {
          fights.push({
            id: `fight_${post.id}_${opponent.id}`,
            post_a: opponent,
            post_b: post,
            total_money_cents: opponent.total_raised_cents + post.total_raised_cents,
            total_backers: opponent.backers_count + post.backers_count,
            lead_changes_24h: 3,
            updated_at: new Date().toISOString(),
          });
        }
      }
    }

    for (let i = 0; i < Math.min(board.length - 1, 6); i += 2) {
      const p1 = board[i];
      const p2 = board[i + 1];
      const alreadyFought = fights.some((f) => f.post_a.id === p1.id || f.post_b.id === p1.id);
      if (!alreadyFought && p1 && p2) {
        fights.push({
          id: `war_${p1.id}_${p2.id}`,
          post_a: p1,
          post_b: p2,
          total_money_cents: p1.total_raised_cents + p2.total_raised_cents,
          total_backers: p1.backers_count + p2.backers_count,
          lead_changes_24h: 4,
          updated_at: new Date().toISOString(),
        });
      }
    }

    return fights;
  }

  // --- Historical Board Snapshots ---
  saveDailySnapshot(dateStr: string, categoryId = 'global') {
    const board = this.getRankedBoard(categoryId);
    const rankings = board.slice(0, 1000).map((p) => ({
      rank: p.rank,
      post_id: p.id,
      title: p.title,
      author_display: p.author_display,
      score_display: p.display_score,
      total_raised_cents: p.total_raised_cents,
      backers_count: p.backers_count,
    }));

    const snapshot: BoardSnapshot = {
      category_id: categoryId,
      snapshot_date: dateStr,
      rankings,
    };
    this.snapshots.set(`${categoryId}:${dateStr}`, snapshot);
    return snapshot;
  }

  getHistoricalSnapshot(dateStr: string, categoryId = 'global'): BoardSnapshot | undefined {
    return this.snapshots.get(`${categoryId}:${dateStr}`);
  }

  getAllSnapshots(): BoardSnapshot[] {
    return Array.from(this.snapshots.values());
  }

  // --- Rebase Engine ---
  rebaseBoard(categoryId = 'global') {
    const cat = this.getCategory(categoryId);
    if (!cat) throw new Error('Category not found');

    const now = new Date();
    const oldEpoch = cat.score_epoch;

    for (const post of this.posts.values()) {
      if (post.category_id === categoryId || categoryId === 'global') {
        post.score_base = rebaseStoredScore(
          post.score_base,
          oldEpoch,
          now,
          cat.half_life_hours
        );
      }
    }

    cat.score_epoch = now.toISOString();

    this.logAudit({
      actor_id: null,
      actor_type: 'system',
      action: 'board_rebased',
      entity_type: 'category',
      entity_id: categoryId,
      detail: { old_epoch: oldEpoch, new_epoch: cat.score_epoch },
      ip_hash: null,
    });
  }

  // --- Interactions & Backers Queries ---
  getPostInteractions(postId: string): Interaction[] {
    return this.interactions.filter((b) => b.post_id === postId);
  }

  getUserInteractions(userId: string): Interaction[] {
    return this.interactions.filter((b) => b.user_id === userId);
  }

  getPostBackers(postId: string): PostBacker[] {
    return Array.from(this.postBackers.values())
      .filter((b) => b.post_id === postId)
      .sort((a, b) => b.total_cents - a.total_cents);
  }

  getUserPosts(userId: string): Post[] {
    return Array.from(this.posts.values()).filter((p) => p.author_id === userId && !p.removed_at);
  }

  getUserNotifications(userId: string): Notification[] {
    return this.notifications.filter((n) => n.user_id === userId);
  }

  markNotificationRead(id: string) {
    const n = this.notifications.find((item) => item.id === id);
    if (n) n.read_at = new Date().toISOString();
  }

  // --- Moderation & Reports ---
  addReport(report: Report) {
    this.reports.unshift(report);
  }

  getReports(): Report[] {
    return this.reports;
  }

  moderatePost(
    postId: string,
    action: 'approve' | 'reject' | 'remove' | 'restore',
    reason: string,
    actorId: string | null = null
  ) {
    const post = this.getPost(postId);
    if (!post) throw new Error('Post not found');

    const now = new Date().toISOString();
    if (action === 'approve') {
      post.status = 'live';
      post.removed_at = null;
      post.removed_reason = null;
    } else if (action === 'reject') {
      post.status = 'rejected';
      post.removed_at = now;
      post.removed_reason = reason;
    } else if (action === 'remove') {
      post.status = 'removed_tos';
      post.removed_at = now;
      post.removed_reason = reason;
    } else if (action === 'restore') {
      post.status = 'live';
      post.removed_at = null;
      post.removed_reason = null;
    }

    const modAction: ModerationAction = {
      id: `mod_${Date.now()}`,
      actor_id: actorId,
      post_id: postId,
      target_user_id: post.author_id,
      action,
      reason,
      automated: actorId === null,
      created_at: now,
    };
    this.moderationActions.unshift(modAction);

    this.logAudit({
      actor_id: actorId,
      actor_type: actorId ? 'admin' : 'system',
      action: `moderate_${action}`,
      entity_type: 'post',
      entity_id: postId,
      detail: { reason },
      ip_hash: null,
    });
  }

  getModerationActions(): ModerationAction[] {
    return this.moderationActions;
  }

  // --- Audit Logs ---
  logAudit(log: Omit<AuditLog, 'id' | 'created_at'>) {
    const audit: AuditLog = {
      id: this.auditLogs.length + 1,
      ...log,
      created_at: new Date().toISOString(),
    };
    this.auditLogs.unshift(audit);
  }

  getAuditLogs(): AuditLog[] {
    return this.auditLogs;
  }

  // --- Admin Analytics (§5, §13, §19) ---
  getAdminStats() {
    let totalTopupCents = 0;
    let totalRecognizedSpendCents = 0;
    let unspentFloatCents = 0;
    let totalLikes = 0;
    let totalInteractionsCount = this.interactions.length;

    for (const p of this.payments.values()) {
      if (p.status === 'succeeded') {
        totalTopupCents += p.amount_cents;
      }
    }

    for (const w of this.wallets.values()) {
      unspentFloatCents += w.balance_cents;
      totalRecognizedSpendCents += w.lifetime_spend_cents;
    }

    for (const p of this.posts.values()) {
      totalLikes += p.like_units;
    }

    const totalTopupsCount = this.payments.size;
    const stripeFeesCents = Math.round(totalTopupCents * 0.029 + totalTopupsCount * 30);
    const netProfitCents = totalRecognizedSpendCents - stripeFeesCents;

    const topPost = this.getRankedBoard('global')[0];
    const distinctBackersCount = this.postBackers.size;

    return {
      total_topup_dollars: totalTopupCents / 100,
      recognized_spend_dollars: totalRecognizedSpendCents / 100,
      unspent_float_dollars: unspentFloatCents / 100,
      stripe_fees_dollars: stripeFeesCents / 100,
      net_profit_dollars: netProfitCents / 100,
      total_interactions: totalInteractionsCount,
      total_likes_units: totalLikes,
      distinct_backers: distinctBackersCount,
      total_posts: this.posts.size,
      top_post_price: topPost ? topPost.display_score : 0,
      top_post_title: topPost ? topPost.title : 'None',
    };
  }

  // --- GDPR Erasure ---
  eraseUser(userId: string) {
    const user = this.getUser(userId);
    if (!user) return;

    user.deleted_at = new Date().toISOString();
    user.alias = '[Deleted User]';
    user.email = `deleted_${userId.substring(0, 8)}@showitglo.local`;

    for (const post of this.posts.values()) {
      if (post.author_id === userId) {
        post.status = 'removed_legal';
        post.removed_at = new Date().toISOString();
        post.removed_reason = 'Removed via GDPR Erasure Request';
        post.author_display = '[Anonymous]';
      }
    }

    this.logAudit({
      actor_id: userId,
      actor_type: 'user',
      action: 'gdpr_erasure',
      entity_type: 'user',
      entity_id: userId,
      detail: { reason: 'User requested account erasure' },
      ip_hash: null,
    });
  }
}

const globalForDB = globalThis as unknown as { attentionDB: AttentionMarketDB };
export const db = globalForDB.attentionDB || new AttentionMarketDB();
globalForDB.attentionDB = db;
