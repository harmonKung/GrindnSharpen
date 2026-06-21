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


-- EXERCISE CATALOG

CREATE TABLE IF NOT EXISTS exercises (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(120) UNIQUE NOT NULL,
  slug              VARCHAR(140) UNIQUE NOT NULL,
  description       TEXT,
  primary_muscle    VARCHAR(50) NOT NULL,
  secondary_muscles TEXT[] DEFAULT '{}',
  equipment         TEXT[] DEFAULT '{}',
  movement_pattern  VARCHAR(50),
  difficulty        VARCHAR(20) NOT NULL DEFAULT 'beginner'
    CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  instructions      TEXT[] DEFAULT '{}',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exercises_primary_muscle ON exercises(primary_muscle);
CREATE INDEX IF NOT EXISTS idx_exercises_active ON exercises(is_active);


-- USER ROUTINES

CREATE TABLE IF NOT EXISTS routines (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                 VARCHAR(120) NOT NULL,
  goal                 VARCHAR(50) NOT NULL,
  experience_level     VARCHAR(20) NOT NULL
    CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')),
  days_per_week        SMALLINT NOT NULL CHECK (days_per_week BETWEEN 1 AND 7),
  session_duration_min SMALLINT NOT NULL CHECK (session_duration_min BETWEEN 20 AND 180),
  status               VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  generation_source    VARCHAR(20) NOT NULL DEFAULT 'rules'
    CHECK (generation_source IN ('rules', 'ai', 'manual')),
  generation_context   JSONB NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routines_user_id ON routines(user_id);
CREATE INDEX IF NOT EXISTS idx_routines_user_status ON routines(user_id, status);


-- ROUTINE DAYS

CREATE TABLE IF NOT EXISTS routine_days (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  routine_id  UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  day_number  SMALLINT NOT NULL CHECK (day_number BETWEEN 1 AND 7),
  name        VARCHAR(100) NOT NULL,
  focus       TEXT[] DEFAULT '{}',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (routine_id, day_number)
);

CREATE INDEX IF NOT EXISTS idx_routine_days_routine_id ON routine_days(routine_id);


-- EXERCISE PRESCRIPTIONS WITHIN A ROUTINE DAY

CREATE TABLE IF NOT EXISTS routine_exercises (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  routine_day_id   UUID NOT NULL REFERENCES routine_days(id) ON DELETE CASCADE,
  exercise_id      UUID NOT NULL REFERENCES exercises(id),
  exercise_order   SMALLINT NOT NULL CHECK (exercise_order > 0),
  sets             SMALLINT NOT NULL CHECK (sets BETWEEN 1 AND 20),
  rep_min          SMALLINT NOT NULL CHECK (rep_min > 0),
  rep_max          SMALLINT NOT NULL CHECK (rep_max >= rep_min),
  target_rir       SMALLINT CHECK (target_rir BETWEEN 0 AND 5),
  rest_seconds     SMALLINT NOT NULL DEFAULT 90 CHECK (rest_seconds BETWEEN 15 AND 600),
  tempo            VARCHAR(20),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (routine_day_id, exercise_order)
);

CREATE INDEX IF NOT EXISTS idx_routine_exercises_day_id ON routine_exercises(routine_day_id);
CREATE INDEX IF NOT EXISTS idx_routine_exercises_exercise_id ON routine_exercises(exercise_id);


-- AUTO-UPDATE updated_at trigger

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_exercises_updated_at ON exercises;
CREATE TRIGGER update_exercises_updated_at
  BEFORE UPDATE ON exercises
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_routines_updated_at ON routines;
CREATE TRIGGER update_routines_updated_at
  BEFORE UPDATE ON routines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_routine_days_updated_at ON routine_days;
CREATE TRIGGER update_routine_days_updated_at
  BEFORE UPDATE ON routine_days
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_routine_exercises_updated_at ON routine_exercises;
CREATE TRIGGER update_routine_exercises_updated_at
  BEFORE UPDATE ON routine_exercises
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
