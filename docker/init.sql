CREATE TABLE user_configurations (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_provider TEXT NOT NULL CHECK (ai_provider IN ('gemini', 'openai', 'grok')),
  encrypted_api_key TEXT NOT NULL,
  api_key_iv TEXT NOT NULL,
  languages TEXT[] NOT NULL DEFAULT '{}',
  nuvio_credentials TEXT NOT NULL,
  nuvio_credentials_iv TEXT NOT NULL,
  fine_tuning_params TEXT,
  country_filter TEXT[],
  genre_exclusions TEXT[],
  genre_preferences TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON user_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Track previously recommended titles to avoid repeats
CREATE TABLE recommendation_history (
  id SERIAL PRIMARY KEY,
  user_uuid UUID NOT NULL REFERENCES user_configurations(uuid) ON DELETE CASCADE,
  content_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content_type TEXT NOT NULL,
  recommended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  catalog_type TEXT NOT NULL,
  UNIQUE(user_uuid, content_id)
);

-- Track disliked/dismissed titles
CREATE TABLE dismissed_titles (
  id SERIAL PRIMARY KEY,
  user_uuid UUID NOT NULL REFERENCES user_configurations(uuid) ON DELETE CASCADE,
  content_id TEXT NOT NULL,
  title TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_uuid, content_id)
);

-- Generation logs for admin visibility
CREATE TABLE generation_logs (
  id SERIAL PRIMARY KEY,
  user_uuid UUID NOT NULL,
  catalog_type TEXT NOT NULL,
  content_type TEXT,
  items_generated INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rec_history_user ON recommendation_history(user_uuid);
CREATE INDEX idx_dismissed_user ON dismissed_titles(user_uuid);
CREATE INDEX idx_gen_logs_user ON generation_logs(user_uuid);
CREATE INDEX idx_gen_logs_created ON generation_logs(created_at DESC);
