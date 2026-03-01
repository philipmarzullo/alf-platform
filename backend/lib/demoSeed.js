/**
 * Demo Seed Orchestrator
 *
 * seedDemoTenants(supabase) — main entry point
 * seedOperationalData(supabase, tenantId, tenantDef) — exported for reset reuse
 * seedKnowledgeDocs(supabase, tenantId, knowledgeDocs) — exported for reset reuse
 */

import { DEMO_TENANTS, DEMO_PASSWORD } from '../data/demoTenants.js';
import { getTierDefaults } from '../data/tierRegistry.js';
import { generateFullPortal } from './generateAll.js';
import {
  generateDateDimension,
  generateJobs,
  generateEmployees,
  generateWorkTickets,
  generateLaborBudget,
  generateTimekeeping,
  generateJobDaily,
} from './demoDataGenerators.js';

const BATCH_SIZE = 500;

// ── Batch insert helper ──────────────────────────────────────────────

async function batchInsert(supabase, table, rows) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(batch);
    if (error) throw new Error(`[batchInsert] ${table} batch ${i}: ${error.message}`);
    inserted += batch.length;
  }
  return inserted;
}

async function batchUpsert(supabase, table, rows, onConflict) {
  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) throw new Error(`[batchUpsert] ${table} batch ${i}: ${error.message}`);
    upserted += batch.length;
  }
  return upserted;
}

// ── Main entry point ─────────────────────────────────────────────────

export async function seedDemoTenants(supabase) {
  const credentials = [];

  // 1. Seed date dimension (shared across all tenants)
  console.log('[demo-seed] Seeding date dimension 2025–2026...');
  const dateRows = generateDateDimension(2025, 2026);
  await batchUpsert(supabase, 'sf_dim_date', dateRows, 'date_key');
  console.log(`[demo-seed] Date dimension: ${dateRows.length} rows upserted`);

  // 2. Process each tenant
  for (const tenantDef of DEMO_TENANTS) {
    console.log(`\n[demo-seed] ══════════════════════════════════════`);
    console.log(`[demo-seed] Processing: ${tenantDef.company_name} (${tenantDef.plan})`);
    console.log(`[demo-seed] ══════════════════════════════════════`);

    // 2a. Upsert tenant
    const tenantId = await upsertTenant(supabase, tenantDef);
    console.log(`[demo-seed] Tenant ID: ${tenantId}`);

    // 2b. Upsert company profile
    await upsertCompanyProfile(supabase, tenantId, tenantDef);
    console.log(`[demo-seed] Company profile upserted`);

    // 2c. Generate full portal (workspaces, agents, tools, dashboard domains)
    try {
      const result = await generateFullPortal(supabase, tenantId);
      console.log(`[demo-seed] Portal generated: ${result.workspaces.length} workspaces, ${result.agents.length} agents, ${result.tools.length} tools, ${result.domains.length} domains`);
    } catch (err) {
      console.warn(`[demo-seed] Portal generation warning: ${err.message}`);
    }

    // 2d. Create auth users + profiles
    for (const userDef of tenantDef.users) {
      await ensureUser(supabase, tenantId, userDef);
    }
    console.log(`[demo-seed] ${tenantDef.users.length} users ensured`);

    // 2e. Seed operational data
    await seedOperationalData(supabase, tenantId, tenantDef);

    // 2f. Seed knowledge docs
    if (tenantDef.knowledgeDocs.length > 0) {
      await seedKnowledgeDocs(supabase, tenantId, tenantDef.knowledgeDocs);
    }

    // Collect credentials
    for (const u of tenantDef.users) {
      credentials.push({
        tenant: tenantDef.company_name,
        plan: tenantDef.plan,
        email: u.email,
        password: DEMO_PASSWORD,
        role: u.role,
      });
    }
  }

  return credentials;
}

// ── Tenant upsert ────────────────────────────────────────────────────

async function upsertTenant(supabase, tenantDef) {
  const defaults = getTierDefaults(tenantDef.plan);

  const tenantRow = {
    company_name: tenantDef.company_name,
    slug: tenantDef.slug,
    plan: tenantDef.plan,
    status: 'active',
    is_active: true,
    enabled_modules: defaults.modules,
    module_config: defaults.moduleConfig,
    max_users: defaults.maxUsers,
    max_agent_calls_per_month: defaults.maxAgentCalls,
    brand_primary_color: tenantDef.brand_primary_color,
    brand_sidebar_bg: tenantDef.brand_sidebar_bg,
    brand_display_name: tenantDef.brand_display_name,
  };

  // Try to find existing tenant by slug
  const { data: existing } = await supabase
    .from('alf_tenants')
    .select('id')
    .eq('slug', tenantDef.slug)
    .maybeSingle();

  if (existing) {
    // Update existing
    const { error } = await supabase
      .from('alf_tenants')
      .update(tenantRow)
      .eq('id', existing.id);
    if (error) throw new Error(`[upsertTenant] update failed: ${error.message}`);
    return existing.id;
  }

  // Insert new
  const { data, error } = await supabase
    .from('alf_tenants')
    .insert(tenantRow)
    .select('id')
    .single();
  if (error) throw new Error(`[upsertTenant] insert failed: ${error.message}`);
  return data.id;
}

// ── Company profile upsert ───────────────────────────────────────────

async function upsertCompanyProfile(supabase, tenantId, tenantDef) {
  const profile = { ...tenantDef.companyProfile, tenant_id: tenantId };

  const { data: existing } = await supabase
    .from('tenant_company_profiles')
    .select('id')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('tenant_company_profiles')
      .update(profile)
      .eq('tenant_id', tenantId);
    if (error) throw new Error(`[upsertCompanyProfile] update failed: ${error.message}`);
  } else {
    const { error } = await supabase
      .from('tenant_company_profiles')
      .insert(profile);
    if (error) throw new Error(`[upsertCompanyProfile] insert failed: ${error.message}`);
  }
}

// ── User creation ────────────────────────────────────────────────────

async function ensureUser(supabase, tenantId, userDef) {
  // Check if auth user already exists by email
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existing = existingUsers?.users?.find(u => u.email === userDef.email);

  let userId;

  if (existing) {
    userId = existing.id;
    // Update password in case it changed
    await supabase.auth.admin.updateUserById(userId, {
      password: DEMO_PASSWORD,
    });
  } else {
    // Create new auth user
    const { data, error } = await supabase.auth.admin.createUser({
      email: userDef.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (error) throw new Error(`[ensureUser] createUser ${userDef.email}: ${error.message}`);
    userId = data.user.id;
  }

  // Upsert profile
  const profileRow = {
    id: userId,
    name: userDef.name,
    email: userDef.email,
    role: userDef.role,
    tenant_id: tenantId,
    active: true,
    modules: userDef.modules,
  };

  const { error: profileErr } = await supabase
    .from('profiles')
    .upsert(profileRow, { onConflict: 'id' });
  if (profileErr) throw new Error(`[ensureUser] profile upsert ${userDef.email}: ${profileErr.message}`);
}

// ── Operational data seed (exported for reset) ───────────────────────

export async function seedOperationalData(supabase, tenantId, tenantDef) {
  console.log(`[demo-seed] Seeding operational data for ${tenantDef.company_name}...`);

  // Delete existing sf_* data for this tenant (facts first → dims)
  const factTables = ['sf_fact_timekeeping', 'sf_fact_job_daily', 'sf_fact_work_tickets', 'sf_fact_labor_budget_actual'];
  const dimTables = ['sf_dim_employee', 'sf_dim_job'];

  for (const table of [...factTables, ...dimTables]) {
    const { error } = await supabase.from(table).delete().eq('tenant_id', tenantId);
    if (error) console.warn(`[demo-seed] Delete ${table}: ${error.message}`);
  }
  console.log(`[demo-seed]   Cleared existing sf_* data`);

  // Generate and insert jobs
  const jobRows = generateJobs(tenantId, tenantDef.sites, tenantDef.company_name);
  await batchInsert(supabase, 'sf_dim_job', jobRows);
  console.log(`[demo-seed]   Jobs: ${jobRows.length} inserted`);

  // Build jobMap: job_name → id (need actual IDs from DB)
  const { data: jobs } = await supabase
    .from('sf_dim_job')
    .select('id, job_name')
    .eq('tenant_id', tenantId);
  const jobMap = {};
  for (const j of jobs) jobMap[j.job_name] = j.id;

  // Generate and insert employees
  const { employees, empJobMap: empJobMapByNumber } = generateEmployees(
    tenantId, jobMap, tenantDef.employeesPerSite,
  );
  await batchInsert(supabase, 'sf_dim_employee', employees);
  console.log(`[demo-seed]   Employees: ${employees.length} inserted`);

  // Build empMap: employee_number → id (need actual IDs for timekeeping FK)
  const { data: emps } = await supabase
    .from('sf_dim_employee')
    .select('id, employee_number')
    .eq('tenant_id', tenantId);
  const empIdMap = {};
  for (const e of emps) empIdMap[e.employee_number] = e.id;

  // Build empJobMap with actual UUIDs for timekeeping
  const empJobMapUUIDs = {};
  for (const [empNum, jobId] of Object.entries(empJobMapByNumber)) {
    const empUuid = empIdMap[empNum];
    if (empUuid) empJobMapUUIDs[empUuid] = jobId;
  }

  // Generate and insert work tickets
  const tickets = generateWorkTickets(tenantId, jobMap, tenantDef.totalTickets);
  await batchInsert(supabase, 'sf_fact_work_tickets', tickets);
  console.log(`[demo-seed]   Work tickets: ${tickets.length} inserted`);

  // Generate and insert labor budget
  const laborRows = generateLaborBudget(tenantId, jobMap);
  await batchInsert(supabase, 'sf_fact_labor_budget_actual', laborRows);
  console.log(`[demo-seed]   Labor budget: ${laborRows.length} inserted`);

  // Generate and insert timekeeping (with UUID employee_id)
  const timekeepingRows = generateTimekeeping(tenantId, empJobMapUUIDs, tenantDef.totalTimekeeping);
  await batchInsert(supabase, 'sf_fact_timekeeping', timekeepingRows);
  console.log(`[demo-seed]   Timekeeping: ${timekeepingRows.length} inserted`);

  // Generate and insert job daily
  const dailyRows = generateJobDaily(tenantId, jobMap);
  await batchInsert(supabase, 'sf_fact_job_daily', dailyRows);
  console.log(`[demo-seed]   Job daily: ${dailyRows.length} inserted`);

  console.log(`[demo-seed] Operational data complete for ${tenantDef.company_name}`);
}

// ── Knowledge docs seed (exported for reset) ─────────────────────────

export async function seedKnowledgeDocs(supabase, tenantId, knowledgeDocs) {
  if (!knowledgeDocs || knowledgeDocs.length === 0) return;

  console.log(`[demo-seed] Seeding ${knowledgeDocs.length} knowledge docs...`);

  // Delete existing demo docs for this tenant
  const { error: delErr } = await supabase
    .from('tenant_documents')
    .delete()
    .eq('tenant_id', tenantId);
  if (delErr) console.warn(`[demo-seed] Delete docs: ${delErr.message}`);

  // Insert fresh docs (storage_path is globally unique, so scope by tenantId)
  const docRows = knowledgeDocs.map(doc => ({
    tenant_id: tenantId,
    file_name: doc.file_name,
    file_type: 'application/pdf',
    file_size: doc.extracted_text.length,
    title: doc.file_name.replace('.pdf', ''),
    doc_type: doc.doc_type,
    department: doc.department,
    status: doc.status,
    extracted_text: doc.extracted_text,
    char_count: doc.extracted_text.length,
    page_count: Math.ceil(doc.extracted_text.length / 3000),
    storage_path: `demo/${tenantId}/${doc.file_name}`,
  }));

  const { error } = await supabase.from('tenant_documents').insert(docRows);
  if (error) throw new Error(`[seedKnowledgeDocs] insert failed: ${error.message}`);

  console.log(`[demo-seed] Knowledge docs: ${docRows.length} inserted`);
}
