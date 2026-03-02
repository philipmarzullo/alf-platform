/**
 * Operational Context Query Generation
 *
 * Seeds tenant_operational_context_queries for tenants with sf_* data.
 * These replace the hardcoded getOperationalContext() queries in claude.js.
 */

/**
 * Seed default operational context queries that match the original
 * hardcoded sf_* table queries. Only creates rows — doesn't check
 * whether the tenant actually has data in these tables.
 */
export async function generateOperationalContextQueries(supabase, tenantId) {
  // Delete existing
  await supabase.from('tenant_operational_context_queries').delete().eq('tenant_id', tenantId);

  const queries = [
    {
      tenant_id: tenantId,
      query_key: 'jobs_summary',
      label: 'Jobs',
      source_table: 'sf_dim_job',
      select_columns: ['id', 'job_name', 'job_status', 'region', 'service_type', 'contract_value_monthly'],
      order_by: null,
      row_limit: 500,
      summary_type: 'template',
      summary_template: [
        '## Jobs ({{active_count}} active / {{total_count}} total)',
        'Monthly contract value: ${{total_contract_value}}',
        'Regions: {{regions}}',
        'Service types: {{service_types}}',
        '',
        'Active jobs:',
        '{{active_jobs_list}}',
      ].join('\n'),
      sort_order: 0,
    },
    {
      tenant_id: tenantId,
      query_key: 'employees_summary',
      label: 'Employees',
      source_table: 'sf_dim_employee',
      select_columns: ['id', 'employment_status', 'department', 'job_title', 'hourly_rate'],
      order_by: null,
      row_limit: 500,
      summary_type: 'template',
      summary_template: [
        '## Employees ({{active_count}} active / {{total_count}} total)',
        'Avg hourly rate: ${{avg_rate}}',
        'By department: {{by_dept}}',
      ].join('\n'),
      sort_order: 1,
    },
    {
      tenant_id: tenantId,
      query_key: 'labor_budget',
      label: 'Labor Budget vs Actual',
      source_table: 'sf_fact_labor_budget_actual',
      select_columns: ['date_key', 'budget_hours', 'actual_hours', 'budget_cost', 'actual_cost', 'overtime_hours', 'overtime_cost'],
      order_by: 'date_key desc',
      row_limit: 200,
      summary_type: 'template',
      summary_template: [
        '## Labor Budget vs Actual (last {{month_count}} months)',
        '{{monthly_breakdown}}',
      ].join('\n'),
      sort_order: 2,
    },
    {
      tenant_id: tenantId,
      query_key: 'timekeeping',
      label: 'Timekeeping Summary',
      source_table: 'sf_fact_timekeeping',
      select_columns: ['date_key', 'regular_hours', 'overtime_hours', 'double_time_hours', 'total_hours', 'pay_type'],
      order_by: 'date_key desc',
      row_limit: 500,
      summary_type: 'template',
      summary_template: [
        '## Timekeeping Summary ({{record_count}} recent records)',
        'Regular: {{regular_hours}} hrs | OT: {{overtime_hours}} hrs ({{ot_pct}}%) | DT: {{double_time_hours}} hrs',
        'Total: {{total_hours}} hours',
      ].join('\n'),
      sort_order: 3,
    },
    {
      tenant_id: tenantId,
      query_key: 'work_tickets',
      label: 'Work Tickets',
      source_table: 'sf_fact_work_tickets',
      select_columns: ['ticket_status', 'priority', 'quality_score', 'category'],
      order_by: null,
      row_limit: 500,
      summary_type: 'template',
      summary_template: [
        '## Work Tickets ({{total_count}} total)',
        'By status: {{by_status}}',
        'By priority: {{by_priority}}',
        'Top categories: {{top_categories}}',
        'Avg quality score: {{avg_score}}',
      ].join('\n'),
      sort_order: 4,
    },
    {
      tenant_id: tenantId,
      query_key: 'job_daily',
      label: 'Job Daily Performance',
      source_table: 'sf_fact_job_daily',
      select_columns: ['date_key', 'headcount', 'hours_worked', 'quality_score', 'safety_incidents', 'revenue', 'cost'],
      order_by: 'date_key desc',
      row_limit: 200,
      summary_type: 'template',
      summary_template: [
        '## Job Daily Performance (last {{month_count}} months)',
        '{{monthly_breakdown}}',
      ].join('\n'),
      sort_order: 5,
    },
  ];

  const { data, error } = await supabase
    .from('tenant_operational_context_queries')
    .insert(queries)
    .select();

  if (error) throw new Error(`Failed to create operational context queries: ${error.message}`);

  console.log(`[generateOperationalContext] Created ${data.length} op context queries for tenant ${tenantId}`);
  return { operationalContextQueries: data };
}
