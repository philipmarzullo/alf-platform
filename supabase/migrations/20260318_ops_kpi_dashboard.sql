-- Add Ops KPI dashboard domain for AAEFS
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
    (tid, 'ops-kpi-qms', 'QMS Ops KPI', 'Quality management scoring — VP and Manager summary', 'bar-chart-3', max_sort + 1, true)
  ON CONFLICT (tenant_id, domain_key) DO NOTHING;
END $$;
