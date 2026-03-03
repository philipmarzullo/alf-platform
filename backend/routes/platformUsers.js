import { Router } from 'express';

const router = Router();
const PLATFORM_ROLES = ['platform_owner'];

/**
 * POST /api/platform-users
 * Create a new platform user (auth + profile).
 * Body: { email, password, name, role }
 */
router.post('/', async (req, res) => {
  if (!PLATFORM_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Platform owner access required' });
  }

  const { email, password, name, role } = req.body;

  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Email and password (min 6 chars) required' });
  }

  const allowedRoles = ['platform_owner', 'platform_viewer'];
  const resolvedRole = allowedRoles.includes(role) ? role : 'platform_viewer';

  try {
    // Create auth user with service_role (bypasses email confirmation)
    const { data: newUser, error: createError } = await req.supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: name || '',
        role: resolvedRole,
      },
    });

    if (createError) {
      return res.status(400).json({ error: createError.message });
    }

    // Update the profile row (auth trigger creates it, we patch role + name)
    const { error: profileError } = await req.supabase
      .from('profiles')
      .update({ name: name || '', role: resolvedRole, tenant_id: null })
      .eq('id', newUser.user.id);

    if (profileError) {
      console.warn('[platform-users] Profile update failed:', profileError.message);
    }

    res.json({ user: { id: newUser.user.id, email: newUser.user.email, name, role: resolvedRole } });
  } catch (err) {
    console.error('[platform-users] Create error:', err.message);
    res.status(500).json({ error: 'Failed to create user: ' + err.message });
  }
});

export default router;
