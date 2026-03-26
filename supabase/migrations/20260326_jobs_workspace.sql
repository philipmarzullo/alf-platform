-- Add "Job Directory" workspace for A&A so it appears in the sidebar.
-- Uses department_key='jobs' which maps to /portal/jobs in the tenant portal.

INSERT INTO tenant_workspaces (tenant_id, department_key, name, icon, description, color, sort_order, is_active)
SELECT
  t.id,
  'jobs',
  'Job Directory',
  'Briefcase',
  'WinTeam job master data — all active and inactive jobs',
  '#4B5563',
  (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tenant_workspaces WHERE tenant_id = t.id),
  true
FROM alf_tenants t
WHERE t.slug = 'aaefs'
ON CONFLICT DO NOTHING;
