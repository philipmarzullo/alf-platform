-- Register 4 QBU dashboard domains for AAEFS tenant
-- and set A&A brand color to cyan (#00AEEF)

-- Get the max sort_order for existing domains
DO $$
DECLARE
  max_sort INT;
  tid UUID := '6acb59e5-05c9-4653-98ec-710906771dbb';
BEGIN
  SELECT COALESCE(MAX(sort_order), -1) INTO max_sort
  FROM tenant_dashboard_domains
  WHERE tenant_id = tid;

  INSERT INTO tenant_dashboard_domains (tenant_id, domain_key, name, description, icon, sort_order, is_active)
  VALUES
    (tid, 'action-items',       'Action Items',  'Checkpoint deficiency action items',       'alert-triangle',  max_sort + 1, true),
    (tid, 'inspections',        'Inspections',   'Inspection scores and deficiency tracking', 'clipboard-check', max_sort + 2, true),
    (tid, 'turnover',           'Turnover',      'Employee turnover rates and trends',        'trending-down',   max_sort + 3, true),
    (tid, 'work-tickets-qbu',   'Work Tickets',  'Completed and upcoming work tickets',      'ticket',          max_sort + 4, true)
  ON CONFLICT (tenant_id, domain_key) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        icon = EXCLUDED.icon,
        is_active = true;
END $$;

-- Set A&A brand primary color to cyan
UPDATE alf_tenants
SET brand_primary_color = '#00AEEF'
WHERE id = '6acb59e5-05c9-4653-98ec-710906771dbb';
