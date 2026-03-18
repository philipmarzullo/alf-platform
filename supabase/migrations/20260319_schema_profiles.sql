-- Schema profiles: cached Snowflake schema introspection per tenant
-- Used by the analytics agent to know all views, columns, types, and sample values

CREATE TABLE IF NOT EXISTS tenant_schema_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES alf_tenants(id) ON DELETE CASCADE,
  profile_text text NOT NULL,
  profile_meta jsonb DEFAULT '{}',
  char_count int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id)
);

CREATE INDEX idx_schema_profiles_tenant ON tenant_schema_profiles(tenant_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_schema_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_schema_profiles_updated_at
  BEFORE UPDATE ON tenant_schema_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_schema_profiles_updated_at();

-- RLS: service_role full access (no user-facing access needed)
ALTER TABLE tenant_schema_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on tenant_schema_profiles"
  ON tenant_schema_profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);
