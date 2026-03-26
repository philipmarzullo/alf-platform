-- ============================================================================
-- Copy DIM_EMPLOYEE from Wavelytics → Alf-owned database
--
-- Source: AAEFS_WINTEAM.WAREHOUSE.DIM_EMPLOYEE  (Wavelytics, ~54 columns)
-- Target: ALF_AAEFS.WAREHOUSE.DIM_EMPLOYEE       (Alf-owned)
--
-- Run in Snowflake worksheet as ALF_SERVICE / ALF_SERVICE_ROLE.
-- One-time seed to prove employee data flows into Alf dashboards.
-- ============================================================================

USE ROLE ALF_SERVICE_ROLE;
USE WAREHOUSE COMPUTE_WH;

-- ── Step 0: Verify source columns (run this first, inspect output) ──────────

-- DESCRIBE TABLE AAEFS_WINTEAM.WAREHOUSE.DIM_EMPLOYEE;

-- ── Step 1: Create target table if it doesn't exist ─────────────────────────

CREATE TABLE IF NOT EXISTS ALF_AAEFS.WAREHOUSE.DIM_EMPLOYEE (
    Employee_Number         VARCHAR,
    First_Name              VARCHAR,
    Last_Name               VARCHAR,
    Employee_Type           VARCHAR,
    Hire_Date               VARCHAR,
    Primary_Job_Number      VARCHAR,
    Primary_Job_Name        VARCHAR,
    Employee_Status         VARCHAR,
    Employee_Title          VARCHAR,
    Department              VARCHAR,
    Pay_Rate                VARCHAR,
    Company_Name            VARCHAR,
    Supervisor_Name         VARCHAR,
    _loaded_at              TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- ── Step 2: Truncate and reload ─────────────────────────────────────────────

TRUNCATE TABLE ALF_AAEFS.WAREHOUSE.DIM_EMPLOYEE;

-- ── Step 3: Copy with column aliasing ───────────────────────────────────────
-- Confirmed columns marked (✓), guessed from WinTeam convention marked (?).
-- If a guessed column errors, run DESCRIBE TABLE above to find the real name.

INSERT INTO ALF_AAEFS.WAREHOUSE.DIM_EMPLOYEE (
    Employee_Number, First_Name, Last_Name, Employee_Type,
    Hire_Date, Primary_Job_Number, Primary_Job_Name,
    Employee_Status, Employee_Title, Department,
    Pay_Rate, Company_Name, Supervisor_Name,
    _loaded_at
)
SELECT
    EMPLOYEE_NUMBER,                            -- ✓ confirmed
    EMPLOYEE_FIRST_NAME,                        -- ✓ confirmed
    EMPLOYEE_LAST_NAME,                         -- ✓ confirmed
    EMPLOYEE_TYPE_LABEL,                        -- ✓ confirmed
    EMPLOYEE_HIRE_DATE,                         -- ✓ confirmed
    EMPLOYEE_PRIMARY_JOB_NUMBER,                -- ✓ confirmed
    EMPLOYEE_PRIMARY_JOB_NAME,                  -- ? convention
    EMPLOYEE_STATUS_LABEL,                      -- ? convention
    EMPLOYEE_TITLE_DESCRIPTION,                 -- ? convention
    EMPLOYEE_DEPARTMENT_DESCRIPTION,            -- ? convention
    EMPLOYEE_PAY_RATE,                          -- ? convention
    EMPLOYEE_COMPANY_NAME,                      -- ? convention
    EMPLOYEE_SUPERVISOR_NAME,                   -- ? convention
    CURRENT_TIMESTAMP()
FROM AAEFS_WINTEAM.WAREHOUSE.DIM_EMPLOYEE
WHERE TENANT_ID = 'WT_AAMAINTENANCE_1059_1';

-- ── Step 4: Verify ──────────────────────────────────────────────────────────

SELECT COUNT(*) AS row_count FROM ALF_AAEFS.WAREHOUSE.DIM_EMPLOYEE;

SELECT Employee_Number, First_Name, Last_Name, Employee_Type, Primary_Job_Number, Employee_Status
FROM ALF_AAEFS.WAREHOUSE.DIM_EMPLOYEE
LIMIT 10;
