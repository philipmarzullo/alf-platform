/**
 * User Site Scoping — resolves which job IDs a user can see.
 *
 * Admin/super-admin → null (no filter, sees all sites)
 * Others → job_id[] from user_site_assignments
 * No assignments → null (fail-open: sees all until admin assigns sites)
 */

const ADMIN_ROLES = ['admin', 'super-admin', 'platform_owner'];

/**
 * @param {object} supabase - Supabase service client
 * @param {string} userId - User's profile ID
 * @param {string} tenantId - Tenant ID
 * @param {string} role - User's role
 * @returns {string[]|null} Array of job IDs, or null for "no filter"
 */
export async function getUserScopedJobIds(supabase, userId, tenantId, role) {
  // Admins see everything
  if (ADMIN_ROLES.includes(role)) return null;

  const { data, error } = await supabase
    .from('user_site_assignments')
    .select('job_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('[scopedJobs] Error fetching assignments:', error.message);
    return null; // fail-open on error
  }

  // No assignments = fail-open (user sees everything until admin assigns sites)
  if (!data || data.length === 0) return null;

  return data.map(r => r.job_id);
}

/**
 * Intersects user-scoped job IDs with any filter already applied.
 * Returns the more restrictive set, or null if no restriction.
 */
export function intersectJobIds(scopedIds, filterIds) {
  if (!scopedIds && !filterIds) return null;
  if (!scopedIds) return filterIds;
  if (!filterIds) return scopedIds;

  const scopedSet = new Set(scopedIds);
  return filterIds.filter(id => scopedSet.has(id));
}
