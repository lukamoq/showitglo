-- ==========================================================
-- SHOWITGLO (ATTENTIONMARKET) — POSTGRESQL PRODUCTION DDL SCHEMA
-- Specification: Blueprint Rev 4 (August 2026)
-- ==========================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS
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

-- 2. CLOSED-LOOP WALLETS
CREATE TABLE IF NOT EXISTS wallets (
  user_id               UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_cents         BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0 AND balance_cents <= 50000), -- max $500.00
  daily_cap_cents       BIGINT NOT NULL DEFAULT 5000,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen')),
  lifetime_topup_cents  BIGINT NOT NULL DEFAULT 0,
  lifetime_spend_cents  BIGINT NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. APPEND-ONLY WALLET LEDGER
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

-- 4. CATEGORIES / BOARDS
CREATE TABLE IF NOT EXISTS categories (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  is_live             BOOLEAN NOT NULL DEFAULT true,
  half_life_hours     INT NOT NULL DEFAULT 168, -- 7 days
  increment_strategy  TEXT NOT NULL DEFAULT 'percent' CHECK (increment_strategy IN ('fixed', 'percent', 'expo')),
  increment_config    JSONB NOT NULL DEFAULT '{"pct": 0.10, "floor_cents": 50}',
  score_epoch         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  min_power_cents     BIGINT NOT NULL DEFAULT 1000
);

-- 5. POSTS, OPINIONS & DEMANDS
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

CREATE INDEX IF NOT EXISTS idx_posts_score ON posts(category_id, status, score_base DESC);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
CREATE INDEX IF NOT EXISTS idx_posts_counter ON posts(counter_of);
CREATE INDEX IF NOT EXISTS idx_posts_demand ON posts(demand_target);

-- 6. OFFICIAL BRAND RESPONSES TO DEMANDS
CREATE TABLE IF NOT EXISTS brand_responses (
  id                  TEXT PRIMARY KEY,
  post_id             UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_user_id      UUID NOT NULL REFERENCES users(id),
  author_display      TEXT NOT NULL,
  title               TEXT NOT NULL,
  body                TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_responses_post ON brand_responses(post_id);

-- 7. THE GREAT DEBATES
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

-- 8. PAID INTERACTIONS (LIKES, BOOSTS, SUPERS, POWERS)
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

CREATE INDEX IF NOT EXISTS idx_interactions_post ON interactions(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_user ON interactions(user_id, created_at DESC);

-- 9. DISTINCT POST BACKERS (ROSTER VIEW)
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

-- 10. PAYMENTS (STRIPE TOP-UPS)
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

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe ON payments(stripe_payment_intent_id);

-- 11. B2B INSIGHTS API KEYS
CREATE TABLE IF NOT EXISTS api_keys (
  id                  TEXT PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES users(id),
  key_prefix          TEXT NOT NULL,
  key_token           TEXT UNIQUE NOT NULL,
  tier                TEXT NOT NULL DEFAULT 'starter' CHECK (tier IN ('starter', 'growth', 'enterprise')),
  rate_limit_per_min  INT NOT NULL DEFAULT 60,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_token ON api_keys(key_token);

-- 12. AUDIT LOGS (APPEND-ONLY)
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

-- 13. BOARD DAILY SNAPSHOTS (TIME TRAVEL)
CREATE TABLE IF NOT EXISTS board_snapshots (
  category_id         TEXT NOT NULL REFERENCES categories(id),
  snapshot_date       DATE NOT NULL,
  rankings            JSONB NOT NULL,
  PRIMARY KEY (category_id, snapshot_date)
);
