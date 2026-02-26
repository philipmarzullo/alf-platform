# Alf Platform — Claude Code Context

> This is the platform admin repo. It manages tenants, agent definitions, API credentials, and platform configuration. Tenants never see this — it's Philip's control panel.

## What Is This Repo?

Alf is the SaaS platform that powers tenant portals. This repo is the platform admin interface + backend API.

**Key principle:** This repo is 100% platform. Amber accents, warm dark sidebar, Alf logo. No tenant-specific branding.

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

## Branding

| Element | Value |
|---------|-------|
| Primary color | `amber-*` (Tailwind amber palette) |
| Sidebar bg | `dark-nav-warm` (#231A12) |
| Logo | `/alf-logo.jpg` |
| Active indicator | `bg-amber-500` |
| Auth page subtitle | "Melmac Mission Control" |

## File Ownership

- `src/pages/platform/` — Dashboard, Tenants, TenantDetail, NewTenant, Usage, Config, Agents, Templates, Brand
- `src/pages/auth/` — Alf-branded login, forgot password, reset password
- `src/components/layout/` — Sidebar (warm bg, amber), TopBar (platform breadcrumbs)
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
