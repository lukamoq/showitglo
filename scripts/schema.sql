-- ==========================================================
-- SHOWITGLO — POSTGRESQL PRODUCTION DDL SCHEMA
-- Single source of truth. Applied by scripts/init-db.mjs.
--
-- RULES:
--   * Every statement must be idempotent (safe to run N times).
--   * CREATE TABLE IF NOT EXISTS for new tables.
--   * ALTER TABLE ... ADD COLUMN IF NOT EXISTS for new columns on
--     tables that may already exist in a deployed database.
--   * Constraints are DROPped then re-ADDed (DROP CONSTRAINT IF EXISTS
--     followed by ADD CONSTRAINT) so the pair stays idempotent.
-- ==========================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------
-- 1. USERS
--    Anonymous, server-issued identities. `email` is a synthetic
--    placeholder (anon_<uuid>@anon.showitglo.local) — no real email
--    is ever collected. It exists only to satisfy NOT NULL UNIQUE.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email               TEXT UNIQUE NOT NULL,
  email_verified_at   TIMESTAMPTZ,
  alias               TEXT,
  is_profile_public   BOOLEAN NOT NULL DEFAULT true,
  brand_verified_at   TIMESTAMPTZ,
  stripe_customer_id  TEXT,
  role                TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'limited', 'suspended')),
  notif_prefs         JSONB NOT NULL DEFAULT '{"inapp": true, "email": true, "push": true, "outbid_digest": true}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_stripe ON users(stripe_customer_id);

-- ----------------------------------------------------------
-- 2. CLOSED-LOOP WALLETS
--    balance_cents has a >= 0 floor ONLY. The former <= 50000 ceiling
--    was removed on purpose: a Stripe webhook credit must never fail
--    (we would lose money the customer already paid). The $500 cap is
--    enforced up-front at PaymentIntent creation instead.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallets (
  user_id               UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_cents         BIGINT NOT NULL DEFAULT 0,
  daily_cap_cents       BIGINT NOT NULL DEFAULT 5000,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen')),
  lifetime_topup_cents  BIGINT NOT NULL DEFAULT 0,
  lifetime_spend_cents  BIGINT NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrate away from the old combined CHECK (>= 0 AND <= 50000).
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_balance_cents_check;
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_balance_nonneg;
ALTER TABLE wallets ADD  CONSTRAINT wallets_balance_nonneg CHECK (balance_cents >= 0);

-- ----------------------------------------------------------
-- 3. APPEND-ONLY WALLET LEDGER
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES users(id),
  delta_cents         BIGINT NOT NULL,
  kind                TEXT NOT NULL CHECK (kind IN ('topup', 'spend', 'refund', 'dispute_reversal', 'adjustment')),
  ref_type            TEXT NOT NULL CHECK (ref_type IN ('payment', 'interaction', 'admin')),
  ref_id              TEXT,
  balance_after_cents BIGINT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user ON wallet_ledger(user_id, created_at DESC);
-- Supports the 24h daily-cap aggregate inside recordInteraction.
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_spend_window ON wallet_ledger(user_id, kind, created_at DESC);

-- ----------------------------------------------------------
-- 4. CATEGORIES / BOARDS
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  is_live             BOOLEAN NOT NULL DEFAULT true,
  half_life_hours     INT NOT NULL DEFAULT 168,
  increment_strategy  TEXT NOT NULL DEFAULT 'percent' CHECK (increment_strategy IN ('fixed', 'percent', 'expo')),
  increment_config    JSONB NOT NULL DEFAULT '{"pct": 0.10, "floor_cents": 50}',
  score_epoch         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  min_power_cents     BIGINT NOT NULL DEFAULT 1000
);

INSERT INTO categories (id, name, is_live, half_life_hours, increment_strategy, increment_config, score_epoch, min_power_cents)
VALUES ('global', 'Global Arena', true, 168, 'percent', '{"pct": 0.10, "floor_cents": 50}', NOW(), 1000)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------
-- 5. POSTS, OPINIONS & DEMANDS
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS posts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug                  TEXT UNIQUE NOT NULL,
  author_id             UUID NOT NULL REFERENCES users(id),
  category_id           TEXT NOT NULL REFERENCES categories(id),
  kind                  TEXT NOT NULL DEFAULT 'opinion' CHECK (kind IN ('opinion', 'image', 'ad', 'demand')),
  demand_target         TEXT,
  demand_target_user_id UUID REFERENCES users(id),
  counter_of            UUID REFERENCES posts(id),
  title                 TEXT NOT NULL,
  body                  TEXT,
  media_url             TEXT,
  is_ad                 BOOLEAN NOT NULL DEFAULT false,
  author_display        TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'live', 'rejected', 'removed_tos', 'removed_legal')),
  score_base            DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_raised_cents    BIGINT NOT NULL DEFAULT 0,
  backers_count         INT NOT NULL DEFAULT 0,
  like_units            BIGINT NOT NULL DEFAULT 0,
  streak_days           INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at            TIMESTAMPTZ,
  removed_reason        TEXT
);

-- Used by the code (external source attribution) but missing from the original DDL.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS source_url      TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS source_platform TEXT;

-- First Light: the free, time-ordered visibility window every new post gets.
-- NULL means "no window was ever granted" (seeded and pre-existing rows), which
-- reads the same as an expired one everywhere it is queried.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS first_light_until TIMESTAMPTZ;

-- The rail query: live posts whose window is still open, newest first.
CREATE INDEX IF NOT EXISTS idx_posts_first_light
  ON posts(first_light_until DESC)
  WHERE status = 'live' AND first_light_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_score ON posts(category_id, status, score_base DESC);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
CREATE INDEX IF NOT EXISTS idx_posts_counter ON posts(counter_of);
CREATE INDEX IF NOT EXISTS idx_posts_demand ON posts(demand_target);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
-- The hot path: global board ordering over live posts.
CREATE INDEX IF NOT EXISTS idx_posts_live_score ON posts(score_base DESC) WHERE status = 'live';

-- ----------------------------------------------------------
-- 6. OFFICIAL BRAND RESPONSES TO DEMANDS
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_responses (
  id                  TEXT PRIMARY KEY,
  post_id             UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_user_id      UUID NOT NULL REFERENCES users(id),
  author_display      TEXT NOT NULL,
  title               TEXT NOT NULL,
  body                TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_responses_post ON brand_responses(post_id, created_at DESC);

-- ----------------------------------------------------------
-- 7. THE GREAT DEBATES
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS debates (
  id                  TEXT PRIMARY KEY,
  slug                TEXT UNIQUE NOT NULL,
  question            TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('draft', 'live', 'archived')),
  curated             BOOLEAN NOT NULL DEFAULT true,
  is_political        BOOLEAN NOT NULL DEFAULT false,
  category_id         TEXT NOT NULL REFERENCES categories(id),
  sponsor_user_id     UUID REFERENCES users(id),
  sponsor_label       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS debate_sides (
  debate_id           TEXT NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  side_key            TEXT NOT NULL,
  label               TEXT NOT NULL,
  post_id             UUID NOT NULL REFERENCES posts(id),
  PRIMARY KEY (debate_id, side_key)
);

-- Free-form community opinions attached to a debate side.
CREATE TABLE IF NOT EXISTS debate_opinions (
  id                  TEXT PRIMARY KEY,
  debate_id           TEXT NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  side_key            TEXT NOT NULL,
  author_name         TEXT NOT NULL,
  text                TEXT NOT NULL,
  is_paid             BOOLEAN NOT NULL DEFAULT false,
  amount_cents        BIGINT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debate_opinions_side ON debate_opinions(debate_id, side_key, created_at DESC);

-- Free (non-paid) votes per debate side. Incremented atomically.
CREATE TABLE IF NOT EXISTS debate_free_votes (
  debate_id           TEXT NOT NULL,
  side_key            TEXT NOT NULL,
  votes               BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (debate_id, side_key)
);

-- ----------------------------------------------------------
-- 8. PAID INTERACTIONS (LIKES, BOOSTS, SUPERS, POWERS)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS interactions (
  id                  TEXT PRIMARY KEY,
  post_id             UUID NOT NULL REFERENCES posts(id),
  user_id             UUID NOT NULL REFERENCES users(id),
  category_id         TEXT NOT NULL REFERENCES categories(id),
  kind                TEXT NOT NULL CHECK (kind IN ('like', 'boost', 'super', 'power')),
  units               INT NOT NULL DEFAULT 1,
  amount_cents        BIGINT NOT NULL,
  stored_delta        DOUBLE PRECISION NOT NULL,
  visibility          TEXT NOT NULL DEFAULT 'alias' CHECK (visibility IN ('alias', 'anonymous')),
  quote_id            TEXT,
  target_rank         INT,
  achieved_rank       INT,
  payer_display       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Client-supplied idempotency key for at-most-once spend semantics.
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE INDEX IF NOT EXISTS idx_interactions_post ON interactions(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_user ON interactions(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_interactions_idem ON interactions(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ----------------------------------------------------------
-- 9. DISTINCT POST BACKERS (ROSTER VIEW)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_backers (
  post_id             UUID NOT NULL REFERENCES posts(id),
  user_id             UUID NOT NULL REFERENCES users(id),
  total_cents         BIGINT NOT NULL DEFAULT 0,
  visibility          TEXT NOT NULL DEFAULT 'alias' CHECK (visibility IN ('alias', 'anonymous')),
  user_display        TEXT,
  first_backed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_backers_total ON post_backers(post_id, total_cents DESC);
CREATE INDEX IF NOT EXISTS idx_post_backers_user ON post_backers(user_id);

-- ----------------------------------------------------------
-- 10. PAYMENTS (STRIPE TOP-UPS)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id                        TEXT PRIMARY KEY,
  user_id                   UUID NOT NULL REFERENCES users(id),
  stripe_payment_intent_id  TEXT UNIQUE NOT NULL,
  amount_cents              BIGINT NOT NULL,
  currency                  TEXT NOT NULL DEFAULT 'usd',
  status                    TEXT NOT NULL CHECK (status IN ('succeeded', 'failed', 'refunded', 'disputed')),
  failure_code              TEXT,
  card_fingerprint          TEXT,
  risk_score                INT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_stripe ON payments(stripe_payment_intent_id);

-- ----------------------------------------------------------
-- 10b. IN-FLIGHT WALLET TOP-UP INTENTS
--     A PaymentIntent that exists but has not settled yet is money the
--     customer can still complete. Without a record of it the wallet
--     ceiling is trivially bypassed: open ten $50 intents against a $480
--     balance, pay them all, and the wallet lands at $980 — the webhook
--     must never refuse a credit, so nothing downstream can stop it.
--     Rows are consumed by creditWalletFromPayment and swept after 24h.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallet_intents (
  payment_intent_id   TEXT PRIMARY KEY,
  user_id             UUID NOT NULL,
  amount_cents        BIGINT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_intents_user ON wallet_intents(user_id, created_at DESC);

-- ----------------------------------------------------------
-- 11. STRIPE WEBHOOK EVENT DEDUP
--     One row per delivered Stripe event id. Insert-on-conflict-nothing
--     is what makes webhook processing exactly-once.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS stripe_events (
  id                  TEXT PRIMARY KEY,
  type                TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_created ON stripe_events(created_at DESC);

-- ----------------------------------------------------------
-- 12. B2B INSIGHTS API KEYS
--     Tokens are NEVER stored. Only sha256(token) in key_hash.
--     key_token is kept nullable purely for backward compatibility
--     with databases created before this change; code ignores it.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id                  TEXT PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES users(id),
  key_prefix          TEXT NOT NULL,
  key_token           TEXT UNIQUE,
  key_hash            TEXT,
  tier                TEXT NOT NULL DEFAULT 'starter' CHECK (tier IN ('starter', 'growth', 'enterprise')),
  rate_limit_per_min  INT NOT NULL DEFAULT 60,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at        TIMESTAMPTZ
);

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_hash TEXT;
ALTER TABLE api_keys ALTER COLUMN key_token DROP NOT NULL;
-- A key must be killable. Set on explicit revocation and on GDPR erasure;
-- verifyApiKey refuses any key with this set.
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash) WHERE key_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

-- ----------------------------------------------------------
-- 13. RANK EVENTS (board movement history)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rank_events (
  id                    BIGSERIAL PRIMARY KEY,
  category_id           TEXT NOT NULL REFERENCES categories(id),
  post_id               UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  old_rank              INT,
  new_rank              INT,
  cause_interaction_id  TEXT,
  occurred_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rank_events_post_time ON rank_events(post_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_rank_events_cat_time ON rank_events(category_id, occurred_at DESC);

-- ----------------------------------------------------------
-- 14. NOTIFICATIONS
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id                  TEXT PRIMARY KEY,
  user_id             UUID NOT NULL,
  kind                TEXT NOT NULL,
  payload             JSONB NOT NULL DEFAULT '{}',
  channels            TEXT[] NOT NULL DEFAULT '{inapp}',
  read_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

-- ----------------------------------------------------------
-- 15. QUOTES (5-minute price locks for power boosts)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotes (
  quote_id                 TEXT PRIMARY KEY,
  post_id                  UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  category_id              TEXT NOT NULL,
  target_rank              INT,
  amount_cents             BIGINT NOT NULL,
  estimated_achieved_rank  INT,
  holder_score             DOUBLE PRECISION,
  my_current_score         DOUBLE PRECISION,
  needed_score_delta       DOUBLE PRECISION,
  expires_at               TIMESTAMPTZ NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotes_expires ON quotes(expires_at);

-- ----------------------------------------------------------
-- 16. REPORTS & MODERATION ACTIONS
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id                  TEXT PRIMARY KEY,
  post_id             UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reporter_id         UUID REFERENCES users(id),
  reason              TEXT NOT NULL CHECK (reason IN ('illegal', 'spam', 'harassment', 'ip', 'csam', 'other')),
  detail              TEXT,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);

-- The reason vocabulary grew with the public report form ('scam',
-- 'private_person'). The old values stay legal so existing rows survive the
-- re-ADD; the API accepts only the six the form offers.
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_reason_check;
ALTER TABLE reports ADD CONSTRAINT reports_reason_check
  CHECK (reason IN ('illegal', 'spam', 'harassment', 'scam', 'private_person', 'ip', 'csam', 'other'));

-- One report per (post, reporter). Auto-escalation counts DISTINCT reporters,
-- so without this a single session could manufacture the 3-reporter threshold
-- by pressing the button three times. Historic duplicates are collapsed to the
-- earliest row first, otherwise the index could not be created at all.
DELETE FROM reports r
 USING reports keep
 WHERE r.reporter_id IS NOT NULL
   AND keep.reporter_id = r.reporter_id
   AND keep.post_id = r.post_id
   AND (keep.created_at, keep.id) < (r.created_at, r.id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_one_per_reporter
  ON reports(post_id, reporter_id) WHERE reporter_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS moderation_actions (
  id                  TEXT PRIMARY KEY,
  actor_id            UUID REFERENCES users(id),
  post_id             UUID REFERENCES posts(id) ON DELETE CASCADE,
  target_user_id      UUID REFERENCES users(id),
  action              TEXT NOT NULL CHECK (action IN ('approve', 'reject', 'remove', 'restore', 'suspend', 'warn')),
  reason              TEXT NOT NULL,
  automated           BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_actions_time ON moderation_actions(created_at DESC);

-- ----------------------------------------------------------
-- 17. AUDIT LOGS (APPEND-ONLY)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id                  BIGSERIAL PRIMARY KEY,
  actor_id            UUID,
  actor_type          TEXT NOT NULL CHECK (actor_type IN ('user', 'admin', 'system', 'stripe')),
  action              TEXT NOT NULL,
  entity_type         TEXT,
  entity_id           TEXT,
  detail              JSONB NOT NULL DEFAULT '{}',
  ip_hash             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at DESC);

-- ----------------------------------------------------------
-- 18. BOARD DAILY SNAPSHOTS (TIME TRAVEL)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS board_snapshots (
  category_id         TEXT NOT NULL REFERENCES categories(id),
  snapshot_date       DATE NOT NULL,
  rankings            JSONB NOT NULL,
  PRIMARY KEY (category_id, snapshot_date)
);

-- ----------------------------------------------------------
-- 19. PRESENCE HEARTBEATS (cross-instance live visitor count)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS presence_heartbeats (
  session_key         TEXT PRIMARY KEY,
  last_seen           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presence_last_seen ON presence_heartbeats(last_seen);

-- ----------------------------------------------------------
-- 19b. VISITOR REGISTRY
--      presence_heartbeats is garbage-collected every ten minutes, so it
--      can only ever answer "who is here right now". This table is the
--      durable half of the same signal: one row per distinct presence key,
--      kept for as long as the board exists, so "how many people have been
--      here at all" is a real aggregate rather than a process-local counter.
--      The key is the same HMAC'd value presence uses — no additional
--      information about a visitor is stored here.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS visitors (
  visitor_key         TEXT PRIMARY KEY,
  first_seen          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visitors_last_seen ON visitors(last_seen);

-- ----------------------------------------------------------
-- 20. CROSS-INSTANCE RATE LIMIT COUNTERS
--     Fixed-window counters. window_start is floor(epoch / window) * window.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  bucket              TEXT NOT NULL,
  window_start        TIMESTAMPTZ NOT NULL,
  count               INT NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON rate_limit_counters(window_start);

-- ----------------------------------------------------------
-- 21. AUTH TOKENS (optional email link + magic-link wallet recovery)
--
--     The arena is anonymous-first: linking an email is OPTIONAL and is
--     used for exactly two things — recovering a wallet after the session
--     cookie is lost, and Stripe payment receipts.
--
--     Only sha256(token) is ever stored, so a database leak cannot be
--     replayed as a login. Tokens are single-use: `used_at` is set by the
--     same UPDATE that validates them, never by a later write.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash          TEXT PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose             TEXT NOT NULL CHECK (purpose IN ('link_email', 'recover')),
  email               TEXT,
  expires_at          TIMESTAMPTZ NOT NULL,
  used_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at);
