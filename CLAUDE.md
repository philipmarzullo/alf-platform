# Alf Platform — Claude Code Context

> This is the platform admin repo. It manages tenants, agent definitions, API credentials, and platform configuration. Tenants never see this — it's Philip's control panel.

## What Is This Repo?

Alf is the SaaS platform that powers tenant portals. This repo is the platform admin interface + backend API.

**Key principle:** This repo is 100% platform. Alf Orange accents, near-black sidebar, AlfMark SVG logo. No tenant-specific branding.

## Architecture

| Component | Where |
|-----------|-------|
| **This repo** | Platform admin UI + backend API |
| **alf-tenant-portal repo** | Tenant UI (separate repo, per-tenant deploys) |
| **Supabase** | Shared database — both repos connect to same instance |

## Tech Stack

- **Frontend:** React 19 + Vite + Tailwind CSS v4
- **Backend:** Express (in `backend/` directory)
- **Database & Auth:** Supabase (PostgreSQL + Auth + RLS)

## Branding (v2)

| Element | Value |
|---------|-------|
| Alf Orange | `alf-orange` (#C84B0A) — primary brand, buttons, accents |
| Near Black | `alf-dark` (#1C1C1C) — sidebar bg, auth page bg |
| Warm White | `alf-warm-white` (#F5F0EB) — light backgrounds |
| Slate | `alf-slate` (#6B6B6B) — secondary text |
| Bone | `alf-bone` (#E0D8D2) — borders, dividers |
| Logo | `<AlfMark>` SVG component (`src/components/shared/AlfMark.jsx`) |
| Wordmark | "alf" in Georgia serif, negative tracking |
| Tagline | "Operations Intelligence" — Helvetica Neue, light 300, +4 tracking |
| Active indicator | `bg-alf-orange` |

All colors defined as Tailwind @theme tokens in `src/index.css`.
Semantic amber (`bg-amber-500`) retained only in HealthDot and AttentionBanner for warning states.

## File Ownership

- `src/pages/platform/` — Dashboard, Tenants, TenantDetail, NewTenant, Usage, Config, Agents, Templates, Brand
- `src/pages/auth/` — Alf-branded login, forgot password, reset password
- `src/components/layout/` — Sidebar (alf-dark bg, alf-orange accents), TopBar (platform breadcrumbs)
- `src/contexts/` — Auth and User contexts (with isPlatformOwner)
- `src/agents/` — Agent configs and registry (for the Agents admin page)
- `backend/` — Express API (Claude proxy, credential management)

## Platform Tables (Supabase)

- `alf_tenants` — tenant organizations
- `alf_platform_config` — global config key-value pairs
- `alf_agent_definitions` — agent configs seeded from source
- `alf_usage_logs` — agent call tracking
- `tenant_api_credentials` — encrypted per-tenant API keys

## Env Vars

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Backend (in `backend/.env`):
```
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
ANTHROPIC_API_KEY=...
CREDENTIAL_ENCRYPTION_KEY=...
FRONTEND_URL=https://alfpro.ai
```

## Working Style

- Plan before building
- Always verify builds before pushing
- Commit messages: concise, explain "why" not "what"
- This is Philip's admin tool — no tenant users will ever see this

## Snowflake Data Freshness Policy

All Snowflake-backed data must follow one of two patterns:

1. **Live query via connector pool** (preferred for all new code). See
   `backend/lib/snowflakeDashboards.js` for the pattern: lazy per-tenant
   connector, 30-min TTL, direct `queryView()` calls. No `sf_*` mirror
   needed. Gated by the `snowflake_direct` tenant flag.

2. **Enrichment script + dedup guard** (for data that needs to be written
   back to Supabase for joins/filtering, e.g. `wc_claims`). See
   `backend/scripts/validate-wc-claims-work-status.mjs`. New scripts must:
   - Accept a `{ tenantId, maxAgeMinutes }` options argument
   - Export the main function so API routes can call it in-process
   - Be wired into `backend/scripts/nightly-snowflake-refresh.mjs`

The `sf_*` mirror tables are **legacy**. New features should not read from
them directly. When touching an existing `sf_*`-backed dashboard, consider
migrating it to pattern 1.

Every user-facing component that displays Snowflake-derived data must
include a "last checked" timestamp (visible in-place, on hover, or in a
status banner).

**Nightly safety net:** `scripts/nightly-snowflake-refresh.mjs` runs via
Render cron at 08:00 UTC. It iterates every active tenant with a snowflake
`sync_configs` row and runs (1) the sync pipeline, (2) wc_claims enrichment,
(3) wc_claims work-status validation. Per-tenant failures log but don't
stop the run. New Snowflake-backed enrichment scripts must be added to the
nightly runner.

**Page-load auto-refresh:** Page-mount effects in the tenant portal call
`/validate-work-status` or `/run-if-stale` with a `maxAgeMinutes` dedup
hint so concurrent users share a single refresh. The dedup window is 5 min
for wc_claims validation and 60 min for the sync pipeline; tune via the
`SYNC_RUN_IF_STALE_MINUTES` env var.
