export type UserRole = 'user' | 'moderator' | 'admin';
export type UserStatus = 'active' | 'limited' | 'suspended';

export interface User {
  id: string;
  email: string;
  email_verified_at: string | null;
  alias: string | null;
  is_profile_public: boolean;
  brand_verified_at?: string | null; // Verified advertiser / brand combatant
  stripe_customer_id: string | null;
  role: UserRole;
  status: UserStatus;
  notif_prefs: {
    inapp: boolean;
    email: boolean;
    push: boolean;
    outbid_digest: boolean;
  };
  created_at: string;
  deleted_at: string | null;
}

export interface Wallet {
  user_id: string;
  balance_cents: number;
  daily_cap_cents: number;
  status: 'active' | 'frozen';
  lifetime_topup_cents: number;
  lifetime_spend_cents: number;
  updated_at: string;
}

export interface WalletLedgerEntry {
  id: number;
  user_id: string;
  delta_cents: number; // + topup, - spend/refund
  kind: 'topup' | 'spend' | 'refund' | 'dispute_reversal' | 'adjustment';
  ref_type: 'payment' | 'interaction' | 'admin';
  ref_id?: string | null;
  balance_after_cents: number;
  created_at: string;
}

export type IncrementStrategyType = 'fixed' | 'percent' | 'expo';

export interface Category {
  id: string;
  name: string;
  is_live: boolean;
  half_life_hours: number;
  increment_strategy: IncrementStrategyType;
  increment_config: {
    fixed_inc_cents?: number;
    pct?: number;
    floor_cents?: number;
    mult?: number;
  };
  score_epoch: string; // T0
  min_power_cents: number;
}

export type PostKind = 'opinion' | 'image' | 'ad' | 'demand';
export type PostStatus = 'pending_review' | 'live' | 'rejected' | 'removed_tos' | 'removed_legal';

export interface BrandResponse {
  id: string;
  post_id: string; // The demand being addressed
  author_user_id: string;
  author_display: string;
  title: string;
  body: string;
  created_at: string;
}

export interface Post {
  id: string;
  slug: string;
  author_id: string;
  category_id: string;
  kind: PostKind;
  title: string; // The statement / opinion / demand
  body: string | null;
  media_url?: string | null;
  is_ad: boolean;
  demand_target?: string | null; // e.g. "McDonald's", "Tesla", "Nintendo"
  demand_target_user_id?: string | null; // Linked verified brand
  counter_of?: string | null; // UUID of parent post being rebutted
  source_url?: string | null; // Linked external post (X, YouTube, Reddit, News URL)
  source_platform?: string | null; // e.g. 'x', 'youtube', 'reddit', 'article', 'other'
  author_display: string;
  status: PostStatus;
  score_base: number; // Invariant basis score
  total_raised_cents: number;
  backers_count: number; // Distinct funders count
  like_units: number; // Total $0.01 likes
  streak_days: number;
  created_at: string;
  removed_at?: string | null;
  removed_reason?: string | null;
}

export type InteractionKind = 'like' | 'boost' | 'super' | 'power';

export interface Interaction {
  id: string;
  post_id: string;
  user_id: string;
  category_id: string;
  kind: InteractionKind;
  units: number;
  amount_cents: number;
  stored_delta: number;
  visibility?: 'alias' | 'anonymous';
  quote_id?: string | null;
  target_rank?: number | null;
  achieved_rank?: number | null;
  payer_display?: string;
  created_at: string;
}

export interface PostBacker {
  post_id: string;
  user_id: string;
  total_cents: number;
  visibility?: 'alias' | 'anonymous';
  first_backed_at: string;
  user_display?: string;
}

export interface Payment {
  id: string;
  user_id: string;
  stripe_payment_intent_id: string;
  amount_cents: number;
  currency: string;
  status: 'succeeded' | 'failed' | 'refunded' | 'disputed';
  failure_code?: string | null;
  card_fingerprint?: string | null;
  risk_score?: number | null;
  created_at: string;
  updated_at: string;
}

export interface RankEvent {
  id: number;
  category_id: string;
  post_id: string;
  old_rank: number | null;
  new_rank: number | null;
  cause_interaction_id?: string | null;
  occurred_at: string;
}

export interface BoardSnapshot {
  category_id: string;
  snapshot_date: string; // YYYY-MM-DD
  rankings: Array<{
    rank: number;
    post_id: string;
    title: string;
    author_display: string;
    score_display: number;
    total_raised_cents: number;
    backers_count: number;
  }>;
}

export interface Notification {
  id: string;
  user_id: string;
  kind: 'outbid' | 'milestone' | 'receipt' | 'fight' | 'moderation' | 'system';
  payload: {
    post_id?: string;
    post_title?: string;
    old_rank?: number;
    new_rank?: number;
    displaced_by_name?: string;
    reclaim_quote_id?: string;
    reclaim_amount_cents?: number;
    amount_cents?: number;
    message: string;
  };
  channels: ('inapp' | 'email' | 'push')[];
  read_at: string | null;
  created_at: string;
}

export interface Report {
  id: string;
  post_id: string;
  reporter_id: string | null;
  /**
   * The public form offers the first six. `ip` and `csam` are legacy values
   * kept so rows filed before the form existed still parse.
   */
  reason: 'illegal' | 'harassment' | 'spam' | 'scam' | 'private_person' | 'other' | 'ip' | 'csam';
  detail: string | null;
  status: 'open' | 'reviewing' | 'actioned' | 'dismissed';
  created_at: string;
}

export interface ModerationAction {
  id: string;
  actor_id: string | null;
  post_id: string | null;
  target_user_id: string | null;
  action: 'approve' | 'reject' | 'remove' | 'restore' | 'suspend' | 'warn';
  reason: string;
  automated: boolean;
  created_at: string;
}

export interface AuditLog {
  id: number;
  actor_id: string | null;
  actor_type: 'user' | 'admin' | 'system' | 'stripe';
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  detail: Record<string, any>;
  ip_hash: string | null;
  created_at: string;
}

export interface Quote {
  quote_id: string;
  post_id: string;
  category_id: string;
  target_rank: number | null;
  amount_cents: number;
  estimated_achieved_rank: number;
  holder_score: number;
  my_current_score: number;
  needed_score_delta: number;
  expires_at: string;
  created_at: string;
}

export interface RankedPostView extends Post {
  rank: number;
  display_score: number;
  rank_24h_delta: number;
  counter_post?: RankedPostView | null;
  brand_response?: BrandResponse | null;
  is_war_active?: boolean;
}

export interface FightPair {
  id: string;
  post_a: RankedPostView;
  post_b: RankedPostView;
  total_money_cents: number;
  total_backers: number;
  lead_changes_24h: number;
  updated_at: string;
}

export interface Debate {
  id: string;
  slug: string;
  question: string;
  status: 'draft' | 'live' | 'archived';
  curated: boolean;
  is_political: boolean;
  category_id: string;
  sponsor_user_id?: string | null;
  sponsor_label?: string | null;
  created_at: string;
}

export interface DebateSide {
  debate_id: string;
  side_key: string;
  label: string;
  post_id: string;
}

export interface DebateView extends Debate {
  sides: Array<{
    side_key: string;
    label: string;
    description?: string;
    post: RankedPostView;
    total_cents: number;
    backers_count: number;
    free_votes_count: number;
    percentage: number;
    color?: string;
    roster: Array<{ name: string; total_cents: number; first_backed_at: string; opinion?: string }>;
    opinions: Array<{ id: string; author_name: string; text: string; is_paid: boolean; amount_cents: number; created_at: string }>;
  }>;
  total_money_cents: number;
  total_backers: number;
  total_free_votes: number;
}

export interface ApiKey {
  id: string;
  user_id: string;
  key_prefix: string;
  key_token: string;
  tier: 'starter' | 'growth' | 'enterprise';
  rate_limit_per_min: number;
  created_at: string;
  last_used_at?: string | null;
}

export interface InsightDemandAggregate {
  target_brand: string;
  total_demands_count: number;
  total_money_cents: number;
  total_backers: number;
  top_demand_title: string;
  status: 'active_unanswered' | 'responded';
  k_anonymity_verified: boolean;
}
