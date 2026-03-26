-- Tenant ingestion configs — drives the generic CSV → Snowflake MERGE pipeline.
-- Each row maps a CSV filename pattern to a Snowflake target table with column mapping.

CREATE TABLE IF NOT EXISTS tenant_ingestion_configs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid REFERENCES alf_tenants(id),
    config_key text NOT NULL,
    csv_filename_pattern text NOT NULL,
    snowflake_database text DEFAULT 'ALF_AAEFS',
    snowflake_schema text DEFAULT 'WAREHOUSE',
    snowflake_table text NOT NULL,
    primary_key_column text NOT NULL,
    column_mapping jsonb NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(tenant_id, config_key)
);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_ingestion_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ingestion_configs_updated_at
    BEFORE UPDATE ON tenant_ingestion_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_ingestion_configs_updated_at();

-- RLS: service-role only (backend manages this table)
ALTER TABLE tenant_ingestion_configs ENABLE ROW LEVEL SECURITY;
