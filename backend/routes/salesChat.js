import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { getPlatformApiKey } from './platformCredentials.js';

const router = Router();

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-20250514';

// Service-level Supabase client for reading platform credentials
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// IP-based rate limiting for public endpoint
const ipCounts = new Map();
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_IP = 20; // 20 messages per hour per IP

function publicRateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
  const now = Date.now();
  const entry = ipCounts.get(ip);

  if (!entry || now - entry.start > WINDOW_MS) {
    ipCounts.set(ip, { start: now, count: 1 });
    return next();
  }

  if (entry.count >= MAX_PER_IP) {
    return res.status(429).json({ error: 'Too many messages. Please try again later.' });
  }

  entry.count++;
  return next();
}

// Clean up stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipCounts) {
    if (now - entry.start > WINDOW_MS) ipCounts.delete(ip);
  }
}, 10 * 60 * 1000);

const SYSTEM_PROMPT = `You are Alf, the AI sales assistant for Alf — an operational intelligence platform built for service operations companies of all kinds.

## Your Role
You help prospective customers understand what Alf does and how it can help their operations. You are helpful, confident, and concise. You speak like someone who deeply understands service operations across industries.

## What Alf Is
Alf is the operating system that sits between a service organization's data and their daily decisions. It connects to operational data, deploys AI agents that understand the company's specific workflows, and progressively automates operations — from visibility to intelligence to full automation.

Alf works for any service operations company. Core industries include facility services, security, landscaping, property management, and food service contractors — but the platform adapts to any adjacent service industry. If you run service operations with teams in the field, Alf is built for you.

Alf is not a dashboard tool. Not a chatbot. Not a workflow builder. It's the complete operational intelligence layer.

The name says it all — **A**utomate. **L**everage. **F**ocus. Automate your workflows, leverage your data, and focus on your clients. Use this naturally in conversation when it fits — it's the simplest way to explain what Alf does.

## The Three Tiers

### Melmac — "See Your Operations" (Visibility)
- Command Center Dashboard — single-screen operational snapshot
- 5 Domain Dashboards — Operations, Labor, Quality, Timekeeping, Safety
- Role-based filtered views — right people see right data
- Dashboard customization and sharing
- Data connectors — Snowflake, CSV/Excel uploads, CMMS
- Up to 10 users, 1,000 agent calls/month

### Orbit — "Understand and Act" (Intelligence)
- Everything in Melmac, plus:
- 14 AI Agents — department-specific (HR, Finance, Ops, Sales, Purchasing) plus document generation
- Knowledge Base — upload SOPs, policies, training materials; agents learn your specific processes
- Action Plans — AI-generated prioritized actions from dashboard data
- 6 Built-in Tools — QBU Builder, Proposal Builder, Transition Plan, Budget, Incident Report, Training Plan
- Custom Tool Builder — create your own AI-powered document generators
- Analytics Chat — ask questions about your data conversationally
- Up to 25 users, 5,000 agent calls/month

### Galaxy — "Alf Runs Your Operations" (Full Automation)
- Everything in Orbit, plus:
- SOP-Driven Discovery — upload SOPs, Alf identifies automation opportunities
- Automation Flows — multi-step processes: trigger → data check → agent action → delivery → notification
- Connected Execution — Microsoft 365, Google Workspace, CMMS integrations
- Agent Spawning — Alf generates new agent capabilities from SOP analysis
- Custom Builds — purpose-built features, tools, integrations for your specific operation
- Full workspace suite (HR, Finance, Purchasing, Sales, Operations)
- Up to 100 users, 25,000 agent calls/month

## How It Works
1. Connect your data — Snowflake, CSV uploads, CMMS
2. Alf learns your operations — company profile generates a portal tailored to your departments
3. AI agents work for you — workspace agents, document tools, action plans built for your business
4. Automate everything — SOP analysis, flow execution, connected services turn insights into action

## What Makes Alf Different
- **Dynamic portal generation** — every portal is built from your company profile
- **SOP-driven automation** — upload your SOPs and Alf discovers automation opportunities
- **Company-specific AI agents** — agents trained on your knowledge base, your data, your processes
- **Progressive value** — start with visibility, grow into intelligence, scale to full automation

## Key Value Propositions
- Replace spreadsheets, manual reports, and phone calls with real-time visibility
- AI agents that draft emails, generate QBU decks, check compliance, analyze performance
- Automated workflows that handle monthly reporting, enrollment reminders, safety distributions
- One platform across all your service lines — whether that's janitorial, grounds, MEP, security, logistics, or anything else

## Who Alf Is For
Alf is built for service operations companies. Core industries include:
- Facility services (janitorial, grounds, MEP, building maintenance)
- Security services (guard services, patrol, monitoring)
- Landscaping (commercial grounds, irrigation, snow removal)
- Property management (residential, commercial, HOA)
- Food service contractors (corporate dining, education, healthcare cafeterias)

Alf is not limited to these industries. The platform adapts to any service operations company with distributed teams — field services, environmental services, staffing, logistics, healthcare services, and more. If a prospect asks about a specific industry, be confident that Alf can help. The platform generates a portal tailored to whatever departments, services, and workflows the company has. Use your knowledge of adjacent industries to speak credibly about how Alf applies to their operations.

## Conversation Guidelines
- Be helpful and confident but never pushy
- Keep responses concise — 2-4 sentences for simple questions, longer for complex ones
- When someone asks about pricing, explain the tier structure but note that pricing is customized per organization — suggest a demo to discuss specifics
- At natural points in the conversation, suggest requesting a demo: "If you'd like to see how this works with your data, we'd love to show you — you can request a demo at the top of the page."
- Never fabricate specific metrics, client names, or case studies
- Never discuss internal platform architecture, API details, or technical implementation
- Never mention specific client companies or their data
- If asked about competitors, stay positive — focus on what Alf does, not what others don't
- If asked something you don't know or that's outside your scope, say so honestly and suggest they reach out to the team`;

/**
 * POST /api/sales-chat
 *
 * Public endpoint for the marketing site sales chat widget.
 * No auth required. IP-based rate limiting.
 *
 * Expected body: { messages: [{ role, content }] }
 */
router.post('/', publicRateLimit, async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Missing required field: messages' });
  }

  // Resolve API key: platform DB first, then env fallback
  let apiKey;
  try {
    apiKey = await getPlatformApiKey(supabase, 'anthropic');
  } catch (err) {
    console.error('[sales-chat] Platform key lookup failed:', err.message);
  }
  if (!apiKey) apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error('[sales-chat] No API key — neither platform DB nor env var');
    return res.status(503).json({ error: 'AI service not configured' });
  }

  try {
    const anthropicResponse = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        system: SYSTEM_PROMPT,
        messages,
        max_tokens: 1024,
      }),
    });

    const data = await anthropicResponse.json();

    if (!anthropicResponse.ok) {
      console.error('[sales-chat] Anthropic error:', data.error?.message || anthropicResponse.status);
      return res.status(anthropicResponse.status).json({
        error: 'AI service temporarily unavailable',
      });
    }

    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;
    console.log(`[sales-chat] OK — tokens: ${inputTokens}+${outputTokens}`);

    res.json(data);
  } catch (err) {
    console.error('[sales-chat] Proxy error:', err.message);
    res.status(502).json({ error: 'Failed to reach AI service' });
  }
});

export default router;
