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

CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON user_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
