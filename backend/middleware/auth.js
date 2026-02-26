import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Auth middleware — validates Supabase JWT from Authorization header,
 * fetches user profile with role and tenant_id.
 */
export default async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const token = header.slice(7);

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, role, tenant_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({ error: 'User profile not found' });
    }

    req.user = profile;
    req.tenantId = profile.tenant_id; // null for platform_admin
    req.supabase = supabase; // pass to route for usage logging
    next();
  } catch (err) {
    console.error('[auth] Error validating token:', err.message);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}
