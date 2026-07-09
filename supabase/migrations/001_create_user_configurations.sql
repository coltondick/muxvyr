-- User configurations table
-- Uses gen_random_uuid() which is built into PostgreSQL 13+ (no extension needed)
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

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on row changes
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON user_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Enable Row Level Security
ALTER TABLE user_configurations ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything (used by Worker)
CREATE POLICY "service_role_all" ON user_configurations
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Policy: Anon/authenticated users cannot access directly
-- (All access goes through the Worker using service role key)
CREATE POLICY "deny_public" ON user_configurations
  FOR ALL
  TO anon, authenticated
  USING (false);
