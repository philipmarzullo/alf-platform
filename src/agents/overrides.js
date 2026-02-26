/**
 * Agent config override layer.
 * Stores per-agent overrides in localStorage; merges on top of source defaults.
 * Only overridden fields are stored — missing fields fall back to source.
 */

const OVERRIDE_PREFIX = 'aa_agent_override_';

// --- Storage ---

export function getOverride(agentKey) {
  try {
    const raw = localStorage.getItem(OVERRIDE_PREFIX + agentKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveOverride(agentKey, overrideData) {
  localStorage.setItem(OVERRIDE_PREFIX + agentKey, JSON.stringify(overrideData));
}

export function clearOverride(agentKey) {
  localStorage.removeItem(OVERRIDE_PREFIX + agentKey);
}

export function hasOverride(agentKey) {
  return localStorage.getItem(OVERRIDE_PREFIX + agentKey) !== null;
}

// --- Merge ---

export function mergeOverride(sourceConfig, agentKey) {
  const override = getOverride(agentKey);
  if (!override) return sourceConfig;

  const merged = { ...sourceConfig };

  // Scalar fields
  if (override.name !== undefined) merged.name = override.name;
  if (override.status !== undefined) merged.status = override.status;
  if (override.model !== undefined) merged.model = override.model;
  if (override.maxTokens !== undefined) merged.maxTokens = override.maxTokens;
  if (override.systemPrompt !== undefined) merged.systemPrompt = override.systemPrompt;

  // Action-level overrides (only promptTemplate text for simple templates)
  if (override.actions && sourceConfig.actions) {
    merged.actions = { ...sourceConfig.actions };
    for (const [actionKey, actionOverride] of Object.entries(override.actions)) {
      if (merged.actions[actionKey] && actionOverride.promptTemplateText !== undefined) {
        const templateText = actionOverride.promptTemplateText;
        merged.actions = { ...merged.actions };
        merged.actions[actionKey] = {
          ...merged.actions[actionKey],
          promptTemplate: buildTemplateFunction(templateText),
        };
      }
    }
  }

  return merged;
}

// --- Template Analysis ---

/**
 * Classify a promptTemplate function:
 * - "passthrough": (data) => data.question  — just returns a field
 * - "simple": template literal with ${data.xxx} interpolations
 * - "complex": contains loops, .map(), conditionals, multi-statement body
 */
export function classifyTemplate(fn) {
  if (typeof fn !== 'function') return { type: 'unknown', text: '' };

  const src = fn.toString();

  // Passthrough: returns data.something directly
  if (/^\(?data\)?\s*=>\s*data\.\w+$/.test(src.trim())) {
    return { type: 'passthrough', text: src };
  }

  // Complex: multi-statement (has {, ;, .map, .filter, .forEach, if/else, const/let/var)
  const body = src.replace(/^\(?data\)?\s*=>\s*/, '');
  if (
    body.startsWith('{') ||
    /\.(map|filter|forEach|reduce|join)\s*\(/.test(body) ||
    /\b(if|else|const|let|var|for|while|switch|return)\b/.test(body)
  ) {
    return { type: 'complex', text: src };
  }

  // Simple: template literal — extract the text
  return { type: 'simple', text: extractTemplateText(fn) };
}

/**
 * Extract the template string from a simple arrow function.
 * Calls the function with a Proxy that records ${data.xxx} accesses
 * and returns the interpolated string with placeholders preserved.
 */
export function extractTemplateText(fn) {
  try {
    // Replace data.xxx references with literal ${data.xxx} markers
    const src = fn.toString();
    // Match the template literal body
    const match = src.match(/=>\s*`([\s\S]*)`\s*$/);
    if (match) {
      return match[1];
    }
    // Fallback: call with a proxy
    const handler = {
      get(_, prop) {
        return '${data.' + prop + '}';
      },
    };
    const proxy = new Proxy({}, handler);
    return fn(proxy);
  } catch {
    return fn.toString();
  }
}

/**
 * Reconstruct a template function from edited template text.
 * The text should contain ${data.xxx} placeholders.
 */
export function buildTemplateFunction(templateText) {
  // eslint-disable-next-line no-new-func
  return new Function('data', 'return `' + templateText + '`;');
}
