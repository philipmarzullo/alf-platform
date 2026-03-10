-- =============================================================================
-- Snowflake Service User Setup for Alf Platform
-- Account: ALF_PRODUCTION (IK29268), Org: YLNLSSY
--
-- Run as ACCOUNTADMIN in the Snowflake web console.
-- After running, store the username/password in alf_platform_credentials
-- via the Platform Credentials API.
-- =============================================================================

USE ROLE ACCOUNTADMIN;

-- ─── 1. Create the service role ─────────────────────────────────────────────

CREATE ROLE IF NOT EXISTS ALF_SERVICE_ROLE
  COMMENT = 'Read-only role for Alf Platform sync connector';

-- ─── 2. Create the service user ─────────────────────────────────────────────
-- IMPORTANT: Replace <STRONG_PASSWORD_HERE> with a generated password.
-- Recommendation: 32+ chars, mixed case, numbers, symbols.
-- Example generator: openssl rand -base64 32

CREATE USER IF NOT EXISTS ALF_SERVICE
  PASSWORD = '<STRONG_PASSWORD_HERE>'
  DEFAULT_ROLE = ALF_SERVICE_ROLE
  DEFAULT_WAREHOUSE = COMPUTE_WH
  MUST_CHANGE_PASSWORD = FALSE
  COMMENT = 'Alf Platform automated sync service account';

GRANT ROLE ALF_SERVICE_ROLE TO USER ALF_SERVICE;

-- ─── 3. Grant warehouse usage ───────────────────────────────────────────────

GRANT USAGE ON WAREHOUSE COMPUTE_WH TO ROLE ALF_SERVICE_ROLE;

-- ─── 4. Grant read-only access to tenant databases ─────────────────────────
-- Repeat this block for each tenant database (ALF_AAEFS, ALF_TENANT2, etc.)
-- The Wavelytics data share creates these databases.

-- A&A Elevated Facility Solutions
GRANT USAGE ON DATABASE ALF_AAEFS TO ROLE ALF_SERVICE_ROLE;
GRANT USAGE ON ALL SCHEMAS IN DATABASE ALF_AAEFS TO ROLE ALF_SERVICE_ROLE;
GRANT SELECT ON ALL TABLES IN DATABASE ALF_AAEFS TO ROLE ALF_SERVICE_ROLE;
GRANT SELECT ON FUTURE TABLES IN DATABASE ALF_AAEFS TO ROLE ALF_SERVICE_ROLE;

-- ─── Template for additional tenants ────────────────────────────────────────
-- Copy and uncomment for each new tenant:
--
-- GRANT USAGE ON DATABASE ALF_<SLUG> TO ROLE ALF_SERVICE_ROLE;
-- GRANT USAGE ON ALL SCHEMAS IN DATABASE ALF_<SLUG> TO ROLE ALF_SERVICE_ROLE;
-- GRANT SELECT ON ALL TABLES IN DATABASE ALF_<SLUG> TO ROLE ALF_SERVICE_ROLE;
-- GRANT SELECT ON FUTURE TABLES IN DATABASE ALF_<SLUG> TO ROLE ALF_SERVICE_ROLE;

-- ─── 5. Network policy — whitelist Render outbound IPs ──────────────────────
-- Render's outbound IPs change per region. Look up current IPs at:
--   https://docs.render.com/outbound-ips
--
-- As of March 2026, Render Oregon (us-west) outbound IPs are listed there.
-- Replace the placeholder IPs below with the actual values.

-- CREATE NETWORK POLICY IF NOT EXISTS ALF_RENDER_ONLY
--   ALLOWED_IP_LIST = (
--     '<RENDER_IP_1>',
--     '<RENDER_IP_2>',
--     '<RENDER_IP_3>'
--   )
--   BLOCKED_IP_LIST = ()
--   COMMENT = 'Restrict Snowflake access to Alf backend on Render';
--
-- -- Apply to service user only (not account-wide, so you keep console access)
-- ALTER USER ALF_SERVICE SET NETWORK_POLICY = ALF_RENDER_ONLY;

-- ─── 6. Verify setup ───────────────────────────────────────────────────────

SHOW GRANTS TO ROLE ALF_SERVICE_ROLE;
SHOW GRANTS TO USER ALF_SERVICE;

-- =============================================================================
-- After running this script:
--
-- 1. Test login:
--    snowsql -a IK29268 -u ALF_SERVICE -d ALF_AAEFS -w COMPUTE_WH
--
-- 2. Store credentials via Alf Platform Credentials API:
--    POST /api/platform-credentials
--    {
--      "service_type": "snowflake",
--      "key": "{\"account\":\"IK29268\",\"username\":\"ALF_SERVICE\",\"password\":\"<the_password>\",\"warehouse\":\"COMPUTE_WH\",\"role\":\"ALF_SERVICE_ROLE\"}",
--      "label": "Alf Snowflake Service Account"
--    }
--
-- 3. Test from Alf:
--    POST /api/sync/{tenantId}/test-connection
--    { "connector_type": "snowflake" }
-- =============================================================================
