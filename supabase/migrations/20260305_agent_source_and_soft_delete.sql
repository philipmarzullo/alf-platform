-- Track whether agent was seeded by platform or created by tenant
ALTER TABLE tenant_agents
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'platform';

-- Soft-delete timestamp — tenant "deletes" but Alf retains
ALTER TABLE tenant_agents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Backfill: all existing agents are platform-seeded
UPDATE tenant_agents SET source = 'platform' WHERE source IS NULL OR source = '';
