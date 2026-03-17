-- Add snowflake_direct flag to alf_tenants
-- When true, agents get a querySnowflake tool for direct Wavelytics view access
ALTER TABLE alf_tenants ADD COLUMN IF NOT EXISTS snowflake_direct boolean DEFAULT false;

-- Enable for AAEFS
UPDATE alf_tenants SET snowflake_direct = true
WHERE id = '6acb59e5-05c9-4653-98ec-710906771dbb';
