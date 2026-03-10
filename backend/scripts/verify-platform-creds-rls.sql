-- =============================================================================
-- RLS Verification for alf_platform_credentials
-- Run in Supabase SQL Editor to verify tenant roles cannot read platform creds.
-- =============================================================================

-- 1. Check RLS is enabled
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE tablename = 'alf_platform_credentials';

-- 2. List all policies on the table
SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual::text AS using_clause,
  with_check::text AS with_check_clause
FROM pg_policies
WHERE tablename = 'alf_platform_credentials';

-- 3. Verify service_role bypass (backend uses service_role key)
-- service_role bypasses RLS by default in Supabase — this is correct.
-- The backend never exposes this table to tenant API calls.

-- 4. If RLS is NOT enabled or no policies exist, run this to lock it down:
--
-- ALTER TABLE alf_platform_credentials ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE alf_platform_credentials FORCE ROW LEVEL SECURITY;
--
-- -- Only service_role (backend) can access — no anon, no authenticated users
-- CREATE POLICY "Service role only"
--   ON alf_platform_credentials
--   FOR ALL
--   USING (false)
--   WITH CHECK (false);
--
-- The USING(false) policy blocks all access via anon/authenticated roles.
-- service_role bypasses RLS entirely, so the backend still works.
-- This means even platform_owner users cannot read this table directly
-- via Supabase client — they must go through the backend API which
-- uses the service_role key.
