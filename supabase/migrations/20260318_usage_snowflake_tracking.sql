-- Track Snowflake query counts and estimated credits per agent call
ALTER TABLE alf_usage_logs
  ADD COLUMN IF NOT EXISTS snowflake_queries INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS snowflake_credits_est NUMERIC(10, 6) DEFAULT 0;
