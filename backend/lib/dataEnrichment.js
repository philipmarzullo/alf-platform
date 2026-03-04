/**
 * Data enrichment for workflow orchestration runtime.
 *
 * Looks up sf_* synced tables based on input_data fields and returns
 * enriched context for agent prompts at each stage.
 */

/**
 * Enrich workflow input data from synced WinTeam tables.
 *
 * @param {object} supabase - Service-role Supabase client
 * @param {string} tenantId
 * @param {object} inputData - Raw input from form submission or previous stage
 * @returns {object} { enriched: {}, context: string }
 */
export async function enrichInputData(supabase, tenantId, inputData) {
  if (!inputData || typeof inputData !== 'object') {
    return { enriched: {}, context: '' };
  }

  const enriched = {};
  const contextParts = [];

  // Employee lookup
  if (inputData.employee_id || inputData.employee_name || inputData.employee_number) {
    const emp = await lookupEmployee(supabase, tenantId, inputData);
    if (emp) {
      enriched.employee = emp;
      contextParts.push(formatEmployeeContext(emp));
    }
  }

  // Job site lookup
  if (inputData.job_id || inputData.job_name) {
    const job = await lookupJob(supabase, tenantId, inputData);
    if (job) {
      enriched.job = job;
      contextParts.push(formatJobContext(job));
    }
  }

  // If we have an employee with a job_id but no explicit job lookup, fetch it
  if (!enriched.job && enriched.employee?.job_id) {
    const { data: job } = await supabase
      .from('sf_dim_job')
      .select('*')
      .eq('id', enriched.employee.job_id)
      .maybeSingle();
    if (job) {
      enriched.job = job;
      contextParts.push(formatJobContext(job));
    }
  }

  // Timekeeping data (if employee resolved)
  if (enriched.employee) {
    const timekeeping = await lookupRecentTimekeeping(supabase, tenantId, enriched.employee.id);
    if (timekeeping?.length) {
      enriched.timekeeping = timekeeping;
      contextParts.push(formatTimekeepingContext(timekeeping));
    }
  }

  // Work tickets (if job resolved)
  if (enriched.job) {
    const tickets = await lookupOpenWorkTickets(supabase, tenantId, enriched.job.id);
    if (tickets?.length) {
      enriched.work_tickets = tickets;
      contextParts.push(formatWorkTicketsContext(tickets));
    }
  }

  // Labor budget (if job resolved)
  if (enriched.job) {
    const budget = await lookupRecentBudget(supabase, tenantId, enriched.job.id);
    if (budget?.length) {
      enriched.labor_budget = budget;
      contextParts.push(formatBudgetContext(budget));
    }
  }

  // Supervisor lookup (for routing, not just context)
  if (enriched.job?.supervisor) {
    const { data: supervisor } = await supabase
      .from('profiles')
      .select('id, name, email, role')
      .eq('tenant_id', tenantId)
      .ilike('name', `%${enriched.job.supervisor}%`)
      .maybeSingle();
    if (supervisor) {
      enriched.supervisor = supervisor;
    }
  }

  return {
    enriched,
    context: contextParts.length
      ? `\n\n=== ENRICHED DATA (from connected systems) ===\n${contextParts.join('\n\n')}`
      : '',
  };
}

// --- Lookup functions ---

async function lookupEmployee(supabase, tenantId, inputData) {
  let query = supabase
    .from('sf_dim_employee')
    .select('*')
    .eq('tenant_id', tenantId);

  if (inputData.employee_id) {
    query = query.eq('id', inputData.employee_id);
  } else if (inputData.employee_number) {
    query = query.eq('employee_number', inputData.employee_number);
  } else if (inputData.employee_name) {
    // Fuzzy match on name parts
    const name = inputData.employee_name.trim();
    const parts = name.split(/\s+/);
    if (parts.length >= 2) {
      query = query.ilike('first_name', `%${parts[0]}%`).ilike('last_name', `%${parts[parts.length - 1]}%`);
    } else {
      query = query.or(`first_name.ilike.%${name}%,last_name.ilike.%${name}%`);
    }
  }

  const { data } = await query.maybeSingle();
  return data;
}

async function lookupJob(supabase, tenantId, inputData) {
  let query = supabase
    .from('sf_dim_job')
    .select('*')
    .eq('tenant_id', tenantId);

  if (inputData.job_id) {
    query = query.eq('id', inputData.job_id);
  } else if (inputData.job_name) {
    query = query.ilike('job_name', `%${inputData.job_name}%`);
  }

  const { data } = await query.maybeSingle();
  return data;
}

async function lookupRecentTimekeeping(supabase, tenantId, employeeId) {
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const { data } = await supabase
    .from('sf_fact_timekeeping')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('employee_id', employeeId)
    .gte('date_key', twoWeeksAgo.toISOString().slice(0, 10))
    .order('date_key', { ascending: false })
    .limit(20);

  return data;
}

async function lookupOpenWorkTickets(supabase, tenantId, jobId) {
  const { data } = await supabase
    .from('sf_fact_work_tickets')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('job_id', jobId)
    .in('status', ['open', 'in_progress'])
    .order('date_key', { ascending: false })
    .limit(10);

  return data;
}

async function lookupRecentBudget(supabase, tenantId, jobId) {
  const { data } = await supabase
    .from('sf_fact_labor_budget_actual')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('job_id', jobId)
    .order('period_start', { ascending: false })
    .limit(3);

  return data;
}

// --- Formatting functions ---

function formatEmployeeContext(emp) {
  const parts = [
    `Employee: ${emp.first_name} ${emp.last_name}`,
    `  Employee #: ${emp.employee_number}`,
    `  Role: ${emp.role || 'N/A'}`,
    `  Hire Date: ${emp.hire_date || 'N/A'}`,
    `  Hourly Rate: ${emp.hourly_rate ? `$${emp.hourly_rate}` : 'N/A'}`,
  ];
  return parts.join('\n');
}

function formatJobContext(job) {
  const parts = [
    `Job Site: ${job.job_name}`,
    `  Location: ${job.location || 'N/A'}`,
    `  Supervisor: ${job.supervisor || 'N/A'}`,
    `  Company: ${job.company || 'N/A'}`,
    `  Tier: ${job.tier || 'N/A'}`,
    `  Sq Footage: ${job.sq_footage ? job.sq_footage.toLocaleString() : 'N/A'}`,
  ];
  return parts.join('\n');
}

function formatTimekeepingContext(records) {
  const totalRegular = records.reduce((s, r) => s + (r.regular_hours || 0), 0);
  const totalOT = records.reduce((s, r) => s + (r.ot_hours || 0), 0);
  const days = records.length;
  return `Recent Timekeeping (last ${days} records):\n  Regular Hours: ${totalRegular.toFixed(1)}\n  Overtime Hours: ${totalOT.toFixed(1)}`;
}

function formatWorkTicketsContext(tickets) {
  const summary = tickets.map(t =>
    `  - [${t.status}] ${t.category}: ${t.priority} priority`
  ).join('\n');
  return `Open Work Tickets (${tickets.length}):\n${summary}`;
}

function formatBudgetContext(records) {
  const summary = records.map(r => {
    const variance = ((r.actual_dollars || 0) - (r.budget_dollars || 0));
    const pct = r.budget_dollars ? ((variance / r.budget_dollars) * 100).toFixed(1) : 'N/A';
    return `  ${r.period_start} → ${r.period_end}: Budget $${(r.budget_dollars || 0).toLocaleString()} | Actual $${(r.actual_dollars || 0).toLocaleString()} | Variance ${pct}%`;
  }).join('\n');
  return `Labor Budget vs Actual (recent periods):\n${summary}`;
}
