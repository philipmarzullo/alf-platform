import { getFreshToken } from '../lib/supabase';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

/**
 * Resolve the tenant_id for API calls from the VITE_TENANT_ID env var.
 * Each tenant deploy has its own TENANT_ID set at build/deploy time.
 */
function getTenantId() {
  return import.meta.env.VITE_TENANT_ID || null;
}

/**
 * Chat with an agent (multi-turn) through the backend proxy.
 * The backend resolves the system prompt from the database
 * (tenant_agents for tenant calls, alf_agent_definitions for platform calls).
 *
 * @param {string} agentKey - Agent key (e.g., 'hr', 'alfPlatform')
 * @param {Array} messages - Conversation messages [{role, content}]
 * @param {object} [options] - Optional settings
 * @param {string} [options.pageContext] - Current page context to append to system prompt
 */
export async function chatWithAgent(agentKey, messages, options = {}) {
  const token = await getFreshToken();
  if (!token) return 'Session required for AI responses.';

  const tenantId = getTenantId();

  const body = {
    agent_key: agentKey,
    messages,
    tenant_id: tenantId,
  };
  if (options.pageContext) body.page_context = options.pageContext;

  const response = await fetch(`${BACKEND_URL}/api/claude`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `API error: ${response.status}`);
  }

  const result = await response.json();
  return result.content?.[0]?.text || 'No response generated.';
}
