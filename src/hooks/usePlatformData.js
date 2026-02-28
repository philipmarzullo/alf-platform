import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Central data hook shared by Dashboard + Tenants pages.
 *
 * Fetches tenants, profiles, sites, usage logs, credentials, docs, custom tools
 * in one Promise.all. Computes per-tenant health score and attention items.
 *
 * Health score (0-100):
 *   API Key configured:    30 pts
 *   Users created:         25 pts
 *   Recent activity (14d): 25 pts
 *   Brand configured:      10 pts
 *   Knowledge docs:        10 pts
 *
 * >= 80 = healthy (green)
 * >= 50 = warning (amber)
 * <  50 = critical (red)
 */

export default function usePlatformData() {
  const [tenants, setTenants] = useState([]);
  const [usageLogs, setUsageLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    // Core queries (always succeed)
    const [tenantsRes, profilesRes, sitesRes, logsRes] = await Promise.all([
      supabase.from('alf_tenants').select('*').order('created_at', { ascending: true }),
      supabase.from('profiles').select('tenant_id'),
      supabase.from('tenant_sites').select('tenant_id'),
      supabase
        .from('alf_usage_logs')
        .select('tenant_id, tokens_input, tokens_output, created_at')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(5000),
    ]);

    if (tenantsRes.error) {
      setError(tenantsRes.error.message);
      setLoading(false);
      return;
    }

    // Optional queries — RLS may block, so wrap in try-catch
    let credentialsByTenant = {};
    let docsByTenant = {};
    let toolsByTenant = {};

    try {
      const { data } = await supabase.from('tenant_api_credentials').select('tenant_id');
      (data || []).forEach((r) => {
        credentialsByTenant[r.tenant_id] = true;
      });
    } catch { /* RLS blocked — degrade gracefully */ }

    try {
      const { data } = await supabase.from('tenant_documents').select('tenant_id');
      (data || []).forEach((r) => {
        docsByTenant[r.tenant_id] = (docsByTenant[r.tenant_id] || 0) + 1;
      });
    } catch { /* RLS blocked */ }

    try {
      const { data } = await supabase.from('tenant_custom_tools').select('tenant_id');
      (data || []).forEach((r) => {
        toolsByTenant[r.tenant_id] = (toolsByTenant[r.tenant_id] || 0) + 1;
      });
    } catch { /* RLS blocked */ }

    // Aggregate counts
    const userCounts = {};
    const siteCounts = {};
    const usageCounts = {};
    const tokenCounts = {};
    const lastActivity = {};

    (profilesRes.data || []).forEach((p) => {
      if (p.tenant_id) userCounts[p.tenant_id] = (userCounts[p.tenant_id] || 0) + 1;
    });
    (sitesRes.data || []).forEach((s) => {
      if (s.tenant_id) siteCounts[s.tenant_id] = (siteCounts[s.tenant_id] || 0) + 1;
    });
    (logsRes.data || []).forEach((u) => {
      if (!u.tenant_id) return;
      usageCounts[u.tenant_id] = (usageCounts[u.tenant_id] || 0) + 1;
      tokenCounts[u.tenant_id] = (tokenCounts[u.tenant_id] || 0) + (u.tokens_input || 0) + (u.tokens_output || 0);
      if (!lastActivity[u.tenant_id] || u.created_at > lastActivity[u.tenant_id]) {
        lastActivity[u.tenant_id] = u.created_at;
      }
    });

    const fourteenDaysAgo = Date.now() - 14 * 86400000;
    const sevenDaysAgo = Date.now() - 7 * 86400000;

    const enriched = (tenantsRes.data || []).map((t) => {
      const users = userCounts[t.id] || 0;
      const sites = siteCounts[t.id] || 0;
      const calls30d = usageCounts[t.id] || 0;
      const tokens30d = tokenCounts[t.id] || 0;
      const lastActive = lastActivity[t.id] || null;
      const hasApiKey = !!credentialsByTenant[t.id];
      const hasBrand = !!(t.brand_display_name || t.brand_logo_url);
      const docCount = docsByTenant[t.id] || 0;

      // Health score
      let score = 0;
      const factors = {};

      // API Key (30 pts)
      factors.apiKey = hasApiKey;
      if (hasApiKey) score += 30;

      // Users (25 pts)
      factors.users = users > 0;
      if (users > 0) score += 25;

      // Activity (25 pts)
      const recentlyActive = lastActive && new Date(lastActive).getTime() > fourteenDaysAgo;
      factors.activity = !!recentlyActive;
      if (recentlyActive) score += 25;

      // Brand (10 pts)
      factors.brand = hasBrand;
      if (hasBrand) score += 10;

      // Knowledge (10 pts)
      factors.knowledge = docCount > 0;
      if (docCount > 0) score += 10;

      return {
        ...t,
        modules: t.modules || t.enabled_modules || [],
        user_count: users,
        site_count: sites,
        usage_30d: calls30d,
        tokens_30d: tokens30d,
        last_active: lastActive,
        health_score: score,
        health_factors: factors,
      };
    });

    setTenants(enriched);
    setUsageLogs(logsRes.data || []);
    setLoading(false);
  }

  // Derived: aggregate totals
  const totals = useMemo(() => {
    const totalUsers = tenants.reduce((sum, t) => sum + t.user_count, 0);
    const totalUsage = tenants.reduce((sum, t) => sum + t.usage_30d, 0);
    const totalTokens = tenants.reduce((sum, t) => sum + t.tokens_30d, 0);
    return { totalUsers, totalUsage, totalTokens };
  }, [tenants]);

  // Derived: daily chart data
  const chartData = useMemo(() => {
    const dayMap = {};
    usageLogs.forEach((log) => {
      const day = log.created_at.slice(0, 10);
      if (!dayMap[day]) dayMap[day] = { day, calls: 0 };
      dayMap[day].calls += 1;
    });
    return Object.values(dayMap).sort((a, b) => a.day.localeCompare(b.day));
  }, [usageLogs]);

  // Derived: daily sparkline (just the call counts as an array)
  const sparklineData = useMemo(() => chartData.map((d) => d.calls), [chartData]);

  // Derived: tier distribution
  const tierCounts = useMemo(() => {
    const counts = { melmac: 0, orbit: 0, galaxy: 0 };
    tenants.forEach((t) => {
      const plan = t.plan || 'melmac';
      if (plan in counts) counts[plan] += 1;
      else counts.melmac += 1;
    });
    return counts;
  }, [tenants]);

  // Derived: attention items
  const attentionItems = useMemo(() => {
    const items = [];
    const fourteenDaysAgo = Date.now() - 14 * 86400000;
    const sevenDaysAgo = Date.now() - 7 * 86400000;

    tenants.forEach((t) => {
      if (!t.health_factors.apiKey) {
        items.push({ tenant: t, type: 'no_api_key', severity: 'amber', message: `${t.company_name} has no API key configured` });
      }
      if (t.last_active && new Date(t.last_active).getTime() < fourteenDaysAgo) {
        items.push({ tenant: t, type: 'inactive', severity: 'amber', message: `${t.company_name} inactive for 14+ days` });
      } else if (!t.last_active && t.status === 'active') {
        items.push({ tenant: t, type: 'inactive', severity: 'amber', message: `${t.company_name} has no recorded activity` });
      }
      if (t.status === 'setup' && new Date(t.created_at).getTime() < sevenDaysAgo) {
        items.push({ tenant: t, type: 'stalled_setup', severity: 'red', message: `${t.company_name} in setup for 7+ days` });
      }
      if (t.health_score < 50) {
        items.push({ tenant: t, type: 'critical_health', severity: 'red', message: `${t.company_name} health score is ${t.health_score}/100` });
      }
    });

    // Deduplicate per tenant — keep highest severity
    const byTenant = {};
    items.forEach((item) => {
      const existing = byTenant[item.tenant.id];
      if (!existing || (item.severity === 'red' && existing.severity !== 'red')) {
        byTenant[item.tenant.id] = item;
      }
    });

    return items;
  }, [tenants]);

  return {
    tenants,
    usageLogs,
    loading,
    error,
    totals,
    chartData,
    sparklineData,
    tierCounts,
    attentionItems,
    reload: loadData,
  };
}
