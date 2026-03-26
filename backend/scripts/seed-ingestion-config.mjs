#!/usr/bin/env node

/**
 * Seed script: Insert the A&A DIM_JOB ingestion config into tenant_ingestion_configs.
 *
 * Usage:
 *   cd backend && node scripts/seed-ingestion-config.mjs
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in .env
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function main() {
  // 1. Find A&A tenant
  const { data: tenant, error: tenantErr } = await supabase
    .from('alf_tenants')
    .select('id, company_name, slug')
    .eq('slug', 'aaefs')
    .single();

  if (tenantErr || !tenant) {
    console.error('Could not find tenant with slug "aaefs":', tenantErr?.message);
    process.exit(1);
  }

  console.log(`Found tenant: ${tenant.company_name} (${tenant.id})`);

  // 2. Upsert DIM_JOB ingestion config
  const config = {
    tenant_id: tenant.id,
    config_key: 'dim_job',
    csv_filename_pattern: 'Job Master',
    snowflake_database: 'ALF_AAEFS',
    snowflake_schema: 'WAREHOUSE',
    snowflake_table: 'DIM_JOB',
    primary_key_column: 'Job_Number',
    column_mapping: {
      "Job_Number": "Job_Number",
      "Job_Name": "Job_Name",
      "Job_Type": "Job_Type",
      "Job_Status": "Job_Status",
      "Date_To_Start": "Date_To_Start",
      "Review_Date": "Review_Date",
      "Date_Discontinued": "Date_Discontinued",
      "Service_Expiration_Date": "Service_Expiration_Date",
      "Discontinued_Reason": "Discontinued_Reason",
      "Parent_Job_Number": "Parent_Job_Number",
      "Parent_Job_Name": "Parent_Job_Name",
      "Company_Name": "Company_Name",
      "Customer_Number": "Customer_Number",
      "Customer_Name": "Customer_Name",
      "Location": "Location",
      "Supervisor_Description": "Supervisor_Description",
      "Supervisor_Employee_Number": "Supervisor_Employee_Number",
      "Supervisor_Name": "Supervisor_Name",
      "Address_1": "Address_1",
      "Address_2": "Address_2",
      "City": "City",
      "State": "State",
      "Zip": "Zip",
      "Tier 1": "Tier_1",
      "Tier 2": "Tier_2",
      "Tier 3": "Tier_3",
      "Tier 4": "Tier_4",
      "Tier 5": "Tier_5",
      "Tier 6": "Tier_6",
      "Tier 7": "Tier_7",
      "Tier 8": "Tier_8",
      "Tier 9": "Tier_9",
      "Tier 10": "Tier_10",
      "Tier 11": "Tier_11",
      "Tier 12": "Tier_12",
    },
    is_active: true,
  };

  const { data, error } = await supabase
    .from('tenant_ingestion_configs')
    .upsert(config, { onConflict: 'tenant_id,config_key' })
    .select('id, config_key, snowflake_table')
    .single();

  if (error) {
    console.error('Failed to upsert ingestion config:', error.message);
    process.exit(1);
  }

  console.log(`Ingestion config upserted: ${data.config_key} → ${data.snowflake_table} (${data.id})`);
  console.log('\nDone. The DIM_JOB pipeline is now configured for A&A.');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
