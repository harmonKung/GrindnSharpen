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


-- WORKOUT SESSIONS

CREATE TABLE IF NOT EXISTS workout_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  routine_id      UUID REFERENCES routines(id) ON DELETE SET NULL,
  routine_day_id  UUID REFERENCES routine_days(id) ON DELETE SET NULL,
  name            VARCHAR(120) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_id ON workout_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_status ON workout_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_routine_id ON workout_sessions(routine_id);


-- EXERCISES PERFORMED IN A WORKOUT

CREATE TABLE IF NOT EXISTS workout_session_exercises (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workout_session_id    UUID NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id           UUID NOT NULL REFERENCES exercises(id),
  routine_exercise_id   UUID REFERENCES routine_exercises(id) ON DELETE SET NULL,
  exercise_order        SMALLINT NOT NULL CHECK (exercise_order > 0),
  prescribed_sets       SMALLINT CHECK (prescribed_sets BETWEEN 1 AND 20),
  prescribed_rep_min    SMALLINT CHECK (prescribed_rep_min > 0),
  prescribed_rep_max    SMALLINT CHECK (
    prescribed_rep_max IS NULL OR prescribed_rep_max >= prescribed_rep_min
  ),
  target_rir            SMALLINT CHECK (target_rir BETWEEN 0 AND 5),
  rest_seconds          SMALLINT CHECK (rest_seconds BETWEEN 15 AND 600),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workout_session_id, exercise_order)
);

CREATE INDEX IF NOT EXISTS idx_session_exercises_session_id
  ON workout_session_exercises(workout_session_id);
CREATE INDEX IF NOT EXISTS idx_session_exercises_exercise_id
  ON workout_session_exercises(exercise_id);


-- INDIVIDUAL LOGGED SETS

CREATE TABLE IF NOT EXISTS logged_sets (
  id                           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workout_session_exercise_id  UUID NOT NULL
    REFERENCES workout_session_exercises(id) ON DELETE CASCADE,
  set_number                   SMALLINT NOT NULL CHECK (set_number > 0),
  set_type                     VARCHAR(20) NOT NULL DEFAULT 'working'
    CHECK (set_type IN ('warmup', 'working', 'drop', 'failure')),
  weight_kg                    DECIMAL(7,2) CHECK (weight_kg >= 0),
  reps                         SMALLINT NOT NULL CHECK (reps BETWEEN 0 AND 1000),
  rir                          SMALLINT CHECK (rir BETWEEN 0 AND 10),
  rpe                          DECIMAL(3,1) CHECK (rpe BETWEEN 1 AND 10),
  is_completed                 BOOLEAN NOT NULL DEFAULT TRUE,
  completed_at                 TIMESTAMPTZ DEFAULT NOW(),
  notes                        TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workout_session_exercise_id, set_type, set_number)
);

CREATE INDEX IF NOT EXISTS idx_logged_sets_session_exercise_id
  ON logged_sets(workout_session_exercise_id);
CREATE INDEX IF NOT EXISTS idx_logged_sets_completed_at ON logged_sets(completed_at);


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

DROP TRIGGER IF EXISTS update_workout_sessions_updated_at ON workout_sessions;
CREATE TRIGGER update_workout_sessions_updated_at
  BEFORE UPDATE ON workout_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workout_session_exercises_updated_at ON workout_session_exercises;
CREATE TRIGGER update_workout_session_exercises_updated_at
  BEFORE UPDATE ON workout_session_exercises
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_logged_sets_updated_at ON logged_sets;
CREATE TRIGGER update_logged_sets_updated_at
  BEFORE UPDATE ON logged_sets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
