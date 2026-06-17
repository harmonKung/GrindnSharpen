-- grindnsharpen Database Schema
-- Users & Profiles

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- USERS TABLE (authentication)

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login    TIMESTAMPTZ,
  is_active     BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);


-- USER PROFILES TABLE (fitness details)

CREATE TABLE IF NOT EXISTS user_profiles (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Basic info
  display_name        VARCHAR(100),
  avatar_url          TEXT,
  date_of_birth       DATE,
  gender              VARCHAR(20), -- male, female, non_binary, prefer_not_to_say

  -- Body stats
  body_weight_kg      DECIMAL(5,2),
  height_cm           DECIMAL(5,1),
  body_fat_pct        DECIMAL(4,1),

  -- Fitness profile
  experience_level    VARCHAR(20) NOT NULL DEFAULT 'beginner',
    -- beginner (0-1yr), intermediate (1-3yr), advanced (3+yr)

  primary_goal        VARCHAR(50) NOT NULL DEFAULT 'build_muscle',
    -- build_muscle, lose_fat, recomp, strength, endurance, general_fitness

  secondary_goal      VARCHAR(50),

  target_weight_kg    DECIMAL(5,2),
  target_body_fat_pct DECIMAL(4,1),

  -- Schedule preferences
  days_per_week       SMALLINT DEFAULT 4 CHECK (days_per_week BETWEEN 1 AND 7),
  session_duration_min SMALLINT DEFAULT 60 CHECK (session_duration_min BETWEEN 20 AND 180),
  preferred_days      TEXT[], -- ['monday','wednesday','friday','saturday']

  -- Equipment access
  equipment           TEXT[] DEFAULT '{}',
    -- gym_full, gym_basic, home_dumbbells, home_barbell, resistance_bands,
    -- pull_up_bar, cable_machine, smith_machine, bodyweight_only

  -- Target physique reference (optional)
  physique_archetype  VARCHAR(50),
    -- athletic, powerlifter, bodybuilder, lean_aesthetic, functional

  -- Injury / limitations notes
  limitations         TEXT,

  -- Onboarding state
  onboarding_complete BOOLEAN DEFAULT FALSE,
  onboarding_step     SMALLINT DEFAULT 0,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON user_profiles(user_id);


-- REFRESH TOKENS TABLE (JWT rotation)

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  revoked     BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);


-- AUTO-UPDATE updated_at trigger

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();