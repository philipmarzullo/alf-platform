-- ============================================================================
-- Copy DIM_JOB from Wavelytics → Alf-owned database
--
-- Source: AAEFS_WINTEAM.WAREHOUSE.DIM_JOB  (Wavelytics, 103 columns)
-- Target: ALF_AAEFS.WAREHOUSE.DIM_JOB      (Alf-owned, ingestion schema)
--
-- Run in Snowflake worksheet as ALF_SERVICE / ALF_SERVICE_ROLE.
-- One-time seed to prove data flows into Alf dashboards.
-- ============================================================================

USE ROLE ALF_SERVICE_ROLE;
USE WAREHOUSE COMPUTE_WH;

-- ── Step 0: Verify source columns (run this first, inspect output) ──────────

-- DESCRIBE TABLE AAEFS_WINTEAM.WAREHOUSE.DIM_JOB;

-- ── Step 1: Create target table if it doesn't exist ─────────────────────────

CREATE TABLE IF NOT EXISTS ALF_AAEFS.WAREHOUSE.DIM_JOB (
    Job_Number          VARCHAR,
    Job_Name            VARCHAR,
    Job_Type            VARCHAR,
    Job_Status          VARCHAR,
    Date_To_Start       VARCHAR,
    Review_Date         VARCHAR,
    Date_Discontinued   VARCHAR,
    Service_Expiration_Date VARCHAR,
    Discontinued_Reason VARCHAR,
    Parent_Job_Number   VARCHAR,
    Parent_Job_Name     VARCHAR,
    Company_Name        VARCHAR,
    Customer_Number     VARCHAR,
    Customer_Name       VARCHAR,
    Location            VARCHAR,
    Supervisor_Description VARCHAR,
    Supervisor_Employee_Number VARCHAR,
    Supervisor_Name     VARCHAR,
    Address_1           VARCHAR,
    Address_2           VARCHAR,
    City                VARCHAR,
    State               VARCHAR,
    Zip                 VARCHAR,
    Tier_1              VARCHAR,
    Tier_2              VARCHAR,
    Tier_3              VARCHAR,
    Tier_4              VARCHAR,
    Tier_5              VARCHAR,
    Tier_6              VARCHAR,
    Tier_7              VARCHAR,
    Tier_8              VARCHAR,
    Tier_9              VARCHAR,
    Tier_10             VARCHAR,
    Tier_11             VARCHAR,
    Tier_12             VARCHAR,
    _loaded_at          TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- ── Step 2: Truncate and reload ─────────────────────────────────────────────

TRUNCATE TABLE ALF_AAEFS.WAREHOUSE.DIM_JOB;

-- ── Step 3: Copy with column aliasing ───────────────────────────────────────
-- Wavelytics column names → Alf ingestion column names.
-- Confirmed columns marked (✓), guessed from WinTeam convention marked (?).
-- If a guessed column errors, run DESCRIBE TABLE above to find the real name.

INSERT INTO ALF_AAEFS.WAREHOUSE.DIM_JOB (
    Job_Number, Job_Name, Job_Type, Job_Status,
    Date_To_Start, Review_Date, Date_Discontinued, Service_Expiration_Date,
    Discontinued_Reason, Parent_Job_Number, Parent_Job_Name,
    Company_Name, Customer_Number, Customer_Name,
    Location, Supervisor_Description, Supervisor_Employee_Number, Supervisor_Name,
    Address_1, Address_2, City, State, Zip,
    Tier_1, Tier_2, Tier_3, Tier_4, Tier_5, Tier_6,
    Tier_7, Tier_8, Tier_9, Tier_10, Tier_11, Tier_12,
    _loaded_at
)
SELECT
    JOB_NUMBER,                                 -- ✓ confirmed
    JOB_NAME,                                   -- ✓ confirmed
    JOB_TYPE_LABEL,                             -- ? convention
    IS_JOB_ACTIVE_FLAG,                         -- ✓ confirmed (1/0 flag)
    JOB_DATE_TO_START,                          -- ? convention
    JOB_REVIEW_DATE,                            -- ? convention
    JOB_DATE_DISCONTINUED,                      -- ? convention
    JOB_SERVICE_EXPIRATION_DATE,                -- ? convention
    JOB_DISCONTINUED_REASON,                    -- ? convention
    JOB_PARENT_JOB_NUMBER,                      -- ? convention
    JOB_PARENT_JOB_NAME,                        -- ? convention
    JOB_COMPANY_NAME,                           -- ✓ confirmed
    JOB_CUSTOMER_NUMBER,                        -- ? convention
    JOB_CUSTOMER_NAME,                          -- ? convention
    JOB_LOCATION_LABEL,                         -- ✓ confirmed
    JOB_SUPERVISOR_DESCRIPTION,                 -- ✓ confirmed
    JOB_SUPERVISOR_ID,                          -- ✓ confirmed
    JOB_SUPERVISOR_NAME,                        -- ? convention
    JOB_ADDRESS_LINE_1,                         -- ✓ confirmed
    JOB_ADDRESS_LINE_2,                         -- ? convention (LINE_1 confirmed)
    JOB_CITY,                                   -- ✓ confirmed
    JOB_STATE_CODE,                             -- ✓ confirmed (note: _CODE suffix)
    JOB_ZIP_CODE,                               -- ? convention
    JOB_TIER_01_CURRENT_VALUE_LABEL,            -- ✓ confirmed
    JOB_TIER_02_CURRENT_VALUE_LABEL,            -- ✓ confirmed
    JOB_TIER_03_CURRENT_VALUE_LABEL,            -- ✓ confirmed (Manager)
    JOB_TIER_04_CURRENT_VALUE_LABEL,            -- ✓ confirmed
    JOB_TIER_05_CURRENT_VALUE_LABEL,            -- ✓ confirmed
    JOB_TIER_06_CURRENT_VALUE_LABEL,            -- ✓ confirmed
    JOB_TIER_07_CURRENT_VALUE_LABEL,            -- ? convention (01-06, 08 confirmed)
    JOB_TIER_08_CURRENT_VALUE_LABEL,            -- ✓ confirmed (VP)
    JOB_TIER_09_CURRENT_VALUE_LABEL,            -- ? convention
    JOB_TIER_10_CURRENT_VALUE_LABEL,            -- ? convention
    JOB_TIER_11_CURRENT_VALUE_LABEL,            -- ? convention
    JOB_TIER_12_CURRENT_VALUE_LABEL,            -- ? convention
    CURRENT_TIMESTAMP()
FROM AAEFS_WINTEAM.WAREHOUSE.DIM_JOB
WHERE TENANT_ID = 'WT_AAMAINTENANCE_1059_1';

-- ── Step 4: Verify ──────────────────────────────────────────────────────────

SELECT COUNT(*) AS row_count FROM ALF_AAEFS.WAREHOUSE.DIM_JOB;

SELECT Job_Number, Job_Name, Company_Name, Job_Status, Tier_8 AS VP, Tier_3 AS Manager
FROM ALF_AAEFS.WAREHOUSE.DIM_JOB
LIMIT 10;
