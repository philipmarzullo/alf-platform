/**
 * User Template Resolution — resolves a user's dashboard role template.
 *
 * Admin/super-admin → implicit financial tier, all domains
 * Others → profiles.dashboard_template_id → dashboard_role_templates row
 * Fallback → tenant's default template → operational-only fallback
 */

const ADMIN_ROLES = ['admin', 'super-admin', 'platform_owner'];

const ALL_DOMAINS = ['operations', 'labor', 'quality', 'timekeeping', 'safety'];

const IMPLICIT_ADMIN_TEMPLATE = {
  id: null,
  name: null,
  metric_tier: 'financial',
  allowed_domains: ALL_DOMAINS,
  default_hero_metrics: null,
};

const FALLBACK_TEMPLATE = {
  id: null,
  name: 'Default',
  metric_tier: 'operational',
  allowed_domains: ALL_DOMAINS,
  default_hero_metrics: ['open_tickets', 'completion_rate'],
};

/**
 * @param {object} supabase - Supabase service client
 * @param {string} userId - User's profile ID
 * @param {string} tenantId - Tenant ID
 * @param {string} role - User's role
 * @returns {{ id, name, metric_tier, allowed_domains, default_hero_metrics }}
 */
export async function getUserTemplate(supabase, userId, tenantId, role) {
  // Admins get implicit full access
  if (ADMIN_ROLES.includes(role)) return IMPLICIT_ADMIN_TEMPLATE;

  // Check profile for assigned template
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('dashboard_template_id')
    .eq('id', userId)
    .single();

  if (profileError) {
    console.error('[userTemplate] Profile lookup error:', profileError.message);
    return FALLBACK_TEMPLATE;
  }

  if (profile?.dashboard_template_id) {
    const { data: template, error: templateError } = await supabase
      .from('dashboard_role_templates')
      .select('id, name, metric_tier, allowed_domains, default_hero_metrics')
      .eq('id', profile.dashboard_template_id)
      .single();

    if (!templateError && template) return template;
  }

  // Fallback: tenant's default template
  const { data: defaultTemplate } = await supabase
    .from('dashboard_role_templates')
    .select('id, name, metric_tier, allowed_domains, default_hero_metrics')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .single();

  if (defaultTemplate) return defaultTemplate;

  return FALLBACK_TEMPLATE;
}
