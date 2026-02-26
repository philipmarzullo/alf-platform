import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

if (!url || !key) {
  console.warn('[supabase] Missing env vars — VITE_SUPABASE_URL:', !!url, 'VITE_SUPABASE_ANON_KEY:', !!key);
}

export const supabase = url && key ? createClient(url, key) : null;

/**
 * Get a fresh access token, refreshing the session if needed.
 * Returns null if no session exists.
 */
export async function getFreshToken() {
  if (!supabase) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    // Check if token expires within the next 30 seconds
    const expiresAt = session.expires_at; // unix seconds
    if (expiresAt && expiresAt - Math.floor(Date.now() / 1000) < 30) {
      const { data: { session: refreshed } } = await supabase.auth.refreshSession();
      return refreshed?.access_token || null;
    }

    return session.access_token;
  } catch {
    return null;
  }
}
