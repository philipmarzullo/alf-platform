# Alf Platform — Dynamic Tenant Architecture

> **Addendum to ALF-IDENTITY.md v2.1**
> **Version:** 1.0 — February 28, 2026
> **Purpose:** Defines how Alf learns about each tenant and dynamically generates their entire portal — workspaces, agents, tools, dashboards, and action plan categories. This replaces the hardcoded five-workspace, fourteen-agent, fixed-tool architecture.

---

## The Problem

Alf's current architecture assumes every tenant is a facility services company with five departments (HR, Finance, Purchasing, Sales, Operations), fourteen fixed agents, six fixed tools, and five fixed dashboard domains. This breaks the moment a non-identical company onboards:

- A logistics company sees "Janitorial" and "Grounds" in the Proposal Builder
- A property management company sees workspaces for departments they don't have
- Every tenant sees A&A's differentiators hardcoded in tool forms
- Dashboard domains don't map to every company's operational structure

This contradicts Alf's identity as an agent spawner. If Alf generates intelligence unique to each tenant, it must also generate the **structure** unique to each tenant.

---

## The Principle

**Alf knows nothing about any company at deployment.** When a new tenant is created, they start with a blank portal and one capability: Alf's onboarding intelligence. From a structured discovery process, Alf learns about the company and generates their entire operational environment.

No hardcoded workspaces. No hardcoded agents. No hardcoded tool forms. No hardcoded dashboard domains. Everything is generated from the company profile.

---

## Onboarding Flow

### Step 1: Company Discovery

When a new tenant is created in the Alf platform, the super-admin (or the Alf platform owner on their behalf) enters an onboarding experience. This can be:

**Option A — Guided Interview (Agent-Driven)**
An onboarding agent asks structured questions conversationally:
- "What does your company do?" → Industry, primary services, customer types
- "How is your company structured?" → Departments, reporting lines, key roles
- "What locations do you operate?" → Sites, regions, geographic footprint
- "What makes you different from competitors?" → Differentiators, certifications, ownership model
- "What systems do you currently use?" → ERP, CMMS, email, payroll, accounting
- "What documents define how you operate?" → Prompts for SOP uploads

The agent extracts structured data from the conversation and generates a draft company profile.

**Option B — Document-First**
The tenant uploads company materials — capability statements, about-us pages, previous proposals, org charts, service catalogs. Alf's analysis pipeline extracts the company profile from the documents.

**Option C — Manual Entry**
A structured form with sections for company info, departments, services, differentiators, technology stack. The platform owner fills this in during tenant setup.

**Option D — Hybrid (Recommended)**
The platform owner fills in the basics during tenant creation (industry, tier, core departments). The tenant super-admin completes the profile through the guided interview or manual entry. Documents are uploaded to enrich the profile over time.

### Step 2: Profile Generation & Confirmation

From the discovery inputs, Alf generates a structured **Company Profile**:

```
tenant_company_profiles
  - tenant_id (unique)
  - industry (text — "Facility Services", "Logistics", "Property Management", etc.)
  - sub_vertical (text — "Custodial", "Integrated FM", "Last-Mile Delivery", etc.)
  - company_description (text — 2-3 sentence elevator pitch)
  - founded_year (integer)
  - employee_count (text)
  - headquarters (text)
  - ownership_model (text — "ESOP", "Private", "Public", "Family-Owned")
  - geographic_coverage (JSONB array)
  - certifications (JSONB array of strings)
  - departments (JSONB array of objects — this drives workspace generation)
    [
      {
        "key": "operations",
        "name": "Operations",
        "description": "Day-to-day service delivery, work orders, inspections",
        "icon": "clipboard-list",
        "dashboard_domains": ["operations", "quality"],
        "agent_context": "Operations management for custodial and maintenance services"
      },
      {
        "key": "hr",
        "name": "Human Resources",
        "description": "Workforce management, benefits, compliance, training",
        "icon": "users",
        "dashboard_domains": ["labor", "timekeeping"],
        "agent_context": "HR management for unionized facility services workforce"
      }
      // ... as many as the company has
    ]
  - service_catalog (JSONB array of objects — drives Proposal Builder)
    [
      {
        "category": "Janitorial",
        "services": ["Day Porter", "Nightly Cleaning", "Deep Clean", "Event Support"]
      },
      {
        "category": "Grounds",
        "services": ["Landscaping", "Snow & Ice Removal", "Athletic Fields"]
      }
    ]
  - differentiators (JSONB array of objects — drives Proposal Builder)
    [
      {
        "key": "esop",
        "label": "Employee-Owned (ESOP)",
        "description": "Employee ownership aligns workforce incentives with client success"
      },
      {
        "key": "retention",
        "label": "96% Client Retention",
        "description": "Long-term partnerships built on consistent performance"
      }
    ]
  - key_clients (JSONB array of strings)
  - union_partnerships (JSONB array, nullable)
  - technology_platforms (JSONB array of objects)
  - training_programs (JSONB array of strings)
  - key_leadership (JSONB array of objects — name, title)
  - profile_status ("draft" | "confirmed" | "enriched")
  - created_at
  - updated_at
```

The tenant super-admin reviews and confirms the profile. This is the "yes, this is who we are" moment. Once confirmed, Alf generates the portal.

### Step 3: Portal Generation

From the confirmed company profile, Alf generates:

**Workspaces** — One per department in the `departments` array. Each workspace gets:
- A sidebar entry with the department name and icon
- An agent configured with the department's context and the company's knowledge base
- A set of agent actions relevant to that department type
- A link to the dashboard domain(s) that map to it

```
tenant_workspaces
  - id
  - tenant_id
  - department_key (from profile)
  - name ("Operations", "Human Resources", "Fleet", "Dispatch")
  - icon (lucide icon name)
  - description
  - agent_key (generated — "ops", "hr", "fleet", "dispatch")
  - dashboard_domains (JSONB array — which dashboard domain(s) this workspace maps to)
  - sort_order
  - is_active (boolean)
  - created_at
```

**Agents** — One per workspace, plus cross-functional agents:
- Each workspace agent gets a system prompt generated from the department context + company profile
- Cross-functional agents: Admin (general support), Analytics (data Q&A)
- Tool agents: generated based on what tools are relevant (see below)

```
tenant_agents
  - id
  - tenant_id
  - agent_key (unique per tenant)
  - name ("Operations Agent", "HR Agent", "Fleet Agent")
  - workspace_id (FK to tenant_workspaces, nullable for cross-functional)
  - system_prompt (generated from company profile + department context)
  - model (default from platform config)
  - is_active
  - created_at
```

**Tools** — Generated based on company profile relevance:
- Every company gets: Proposal Builder (with their service catalog and differentiators)
- If they have operations/quality departments: QBU/Quarterly Review Builder
- If they have safety data: Incident Report tool
- If they have training programs: Training Plan tool
- Additional tools can be added via Tool Builder or custom builds

Tool forms are generated from the company profile — the Proposal Builder's checkboxes come from `service_catalog`, the differentiators come from `differentiators`, the team members come from `key_leadership`.

```
tenant_tools
  - id
  - tenant_id
  - tool_key ("proposal_builder", "qbu_builder", "incident_report")
  - name
  - description
  - form_schema (JSONB — defines the form fields, populated from company profile)
  - agent_key (which agent handles generation)
  - is_active
  - created_at
```

**Dashboard Domains** — Generated from the union of all `dashboard_domains` across the company's departments. A facility services company might get: Operations, Labor, Quality, Timekeeping, Safety. A logistics company might get: Fleet, Routes, Warehouse, Compliance.

```
tenant_dashboard_domains
  - id
  - tenant_id
  - domain_key ("operations", "labor", "quality", "fleet", "routes")
  - name
  - description
  - kpi_definitions (JSONB — what metrics this domain tracks)
  - sort_order
  - is_active
  - created_at
```

### Step 4: Operational Knowledge Upload (Critical)

**This step is as important as the company profile.** The profile tells Alf what the company *is*. SOPs and operational documents tell Alf how the company *works*. Without both, Alf can generate a portal structure but can't deliver real intelligence or automation.

**What gets uploaded:**
- **SOPs and procedures** — The step-by-step processes that define daily operations. How shifts are handed off. How inspections are conducted. How incidents are reported. How equipment is maintained. These are the raw material for automation discovery.
- **Training manuals** — How employees are taught to do their jobs. Reveals the expected standard of work and compliance requirements.
- **Policy documents** — HR policies, safety protocols, union agreements, vendor contracts. Define the rules agents must respect.
- **Org charts and role descriptions** — Who does what, who reports to whom. Shapes how agents assign ownership and route recommendations.
- **Previous deliverables** — Past proposals, QBUs, reports, presentations. Teach agents the company's voice, format preferences, and what "good" looks like.
- **Compliance requirements** — OSHA, industry-specific regulations, client-mandated standards. Become guardrails for agent outputs.

**How uploads are processed:**

1. **Categorization** — Each document is tagged to a department (mapped to `tenant_workspaces`). An SOP about restroom cleaning goes to Operations. A benefits enrollment procedure goes to HR. Documents can span multiple departments.

2. **Extraction** — Alf extracts the full text and structures it for injection into agent context. This is the knowledge injection pipeline that already exists.

3. **Analysis (Galaxy tier)** — For Galaxy tenants, every SOP goes through the automation analysis pipeline:
   - Identify manual processes that follow repeatable patterns
   - Flag decision points that could be rules-based
   - Map communication workflows (who emails whom, when, about what)
   - Identify data dependencies (what information is needed, where it lives)
   - Score each process for automation potential
   - Generate department-level automation roadmaps
   - Propose complete automation flows for the highest-potential processes

4. **Agent enrichment** — Extracted content is injected into the relevant workspace agent's context at call time. The Operations Agent at Company A now knows Company A's specific inspection process. The HR Agent knows their specific enrollment workflow. This is what makes agents useful — not generic AI, but AI that knows *this* company's way of doing things.

5. **Tool enrichment** — Previous proposals teach the Proposal Builder the company's voice. Previous QBUs teach the QBU Builder their format and content preferences. The more documents uploaded, the better the tools perform.

**The onboarding prompt:**

During onboarding, Alf should actively prompt for document uploads — not as an optional step but as a required one for full platform value:

- "Upload your SOPs to unlock intelligent agent responses for each department"
- "Upload previous proposals to teach the Proposal Builder your company's voice"
- "Upload safety protocols to enable compliance-aware agent outputs"
- For Galaxy tier: "Upload your operational procedures — Alf will analyze them and propose automations"

**Ongoing enrichment:**

Document uploads aren't a one-time onboarding task. The Knowledge Base grows over time:
- New SOPs are uploaded as processes change
- Updated policies replace old versions
- Additional deliverables (new QBUs, new proposals) continuously improve tool quality
- Galaxy tenants get new automation proposals every time a significant SOP is uploaded

**The relationship between SOPs and automation:**

This is the critical connection. SOPs are the bridge between Level 2 (Intelligence) and Level 3 (Automation):

| Without SOPs | With SOPs |
|---|---|
| Agents give generic responses | Agents give company-specific responses |
| Proposal Builder uses template language | Proposal Builder uses the company's voice |
| Action Plans are generic recommendations | Action Plans reference specific procedures |
| No automation candidates identified | Alf proposes flows based on actual processes |
| Agents can't answer "how do we handle X?" | Agents know exactly how this company handles X |

**A tenant that doesn't upload documents gets a portal. A tenant that uploads their full operational library gets an operational intelligence partner.**

### Step 5: Data Connection

The tenant connects their data sources (Snowflake, file upload, CMMS, etc.). Dashboard domains light up with real data. Agents can now reference actual operational metrics in their responses.

**The relationship between data and documents:**

Data (from Snowflake/ERP) provides the **quantitative** layer — metrics, KPIs, trends, counts. Documents (SOPs, policies) provide the **qualitative** layer — context, procedures, standards, voice. Alf's intelligence comes from combining both:

- The dashboard shows work tickets increased 18% → that's data
- The Operations Agent explains it's driven by HVAC complaints in Building C and recommends a PM audit based on the company's preventive maintenance SOP → that's data + documents
- An automation flow triggers when tickets exceed a threshold, generates an analysis, and emails the site manager with recommended actions from the SOP → that's data + documents + automation

All three layers — data, documents, and automation — build on each other. The onboarding flow should make this clear to the tenant so they invest in uploading their operational knowledge, not just connecting their data.

---

## How This Changes the Current Architecture

### What Gets Replaced

| Current (Hardcoded) | New (Dynamic) |
|---|---|
| 5 fixed workspace entries in sidebar code | `tenant_workspaces` table drives sidebar |
| 14 fixed agent definitions in `alf_agents` | `tenant_agents` table, spawned from profile |
| Fixed agent_key → department mapping in knowledge injection | `tenant_agents.workspace_id` → `tenant_workspaces.department_key` |
| Hardcoded Proposal Builder form (Janitorial checkboxes, A&A differentiators) | `tenant_tools.form_schema` populated from company profile |
| 5 fixed dashboard domains (Operations, Labor, Quality, Timekeeping, Safety) | `tenant_dashboard_domains` generated from profile |
| Fixed action plan categories | Categories derived from `tenant_workspaces` |
| Hardcoded tool list in sidebar | `tenant_tools` table drives tool sidebar entries |
| Fixed module_config keys (hr, finance, purchasing, sales, ops) | Dynamic module keys from `tenant_workspaces.department_key` |

### What Stays the Same

- Alf platform architecture (tenant management, agent management, usage tracking)
- RBAC system (roles, metric tiers, site scoping) — just applied to dynamic workspaces instead of fixed ones
- Knowledge injection pipeline — still scoped by department, but departments are dynamic
- SOP analysis pipeline — same analysis, but spawns skills into dynamic agents
- Automation flows — same engine, triggers dynamic workspace agents
- Dashboard widget system — same customization, applied to dynamic domains
- Credential management and encryption
- Claim governance rules

### What Gets Added

- Company Profile system (table, onboarding flow, admin UI)
- Portal generation engine (profile → workspaces, agents, tools, dashboards)
- Onboarding agent (conversational company discovery)
- Template library (industry-specific starter profiles for common verticals)
- Dynamic sidebar rendering (reads from tenant_workspaces and tenant_tools instead of hardcoded arrays)

---

## Industry Templates

To accelerate onboarding, Alf maintains a library of industry starter templates. When the platform owner selects an industry during tenant creation, the template pre-populates the company profile with common departments, service categories, differentiators, dashboard domains, and tool recommendations for that industry.

The tenant then customizes from the template — adding, removing, or renaming departments and services to match their actual operation.

### Example Templates

**Facility Services (Integrated)**
- Departments: Operations, HR, Finance, Sales, Safety, Grounds
- Service catalog: Janitorial (6 types), Grounds (4 types), MEP (3 types)
- Differentiators: Ownership model, retention rate, safety record, technology platform, union expertise
- Dashboard domains: Operations, Labor, Quality, Timekeeping, Safety
- Tools: Proposal Builder, QBU Builder, Transition Plan, Budget, Incident Report, Training Plan

**Facility Services (Custodial Only)**
- Departments: Operations, HR, Finance, Sales
- Service catalog: Janitorial (6 types)
- Differentiators: similar to integrated but without grounds/MEP
- Dashboard domains: Operations, Labor, Quality, Timekeeping, Safety
- Tools: Proposal Builder, QBU Builder, Incident Report, Training Plan

**Property Management**
- Departments: Operations, Leasing, Finance, Maintenance, Tenant Relations
- Service catalog: Property types, management services, maintenance tiers
- Dashboard domains: Occupancy, Maintenance, Revenue, Compliance
- Tools: Proposal Builder, Tenant Report Builder, Budget Builder

**Logistics / Distribution**
- Departments: Fleet, Dispatch, Warehouse, HR, Finance, Safety
- Service catalog: Delivery types, route categories, warehouse services
- Dashboard domains: Fleet, Routes, Warehouse, Compliance, Safety
- Tools: Proposal Builder, Route Report Builder, Incident Report

**Commercial Cleaning**
- Departments: Operations, Sales, HR, Finance
- Service catalog: Cleaning service types
- Dashboard domains: Operations, Labor, Quality, Safety
- Tools: Proposal Builder, QBU Builder, Training Plan

Templates are stored as JSON in a `industry_templates` table and can be managed by the platform owner.

---

## Migration Plan for Existing Tenants

Existing tenants (A&A, Meridian, Summit, Greenfield) need to be migrated from the hardcoded structure to the dynamic one:

1. **Generate company profiles** for each existing tenant based on their current configuration
2. **Create tenant_workspaces records** matching their current sidebar entries
3. **Create tenant_agents records** from their current agent assignments
4. **Create tenant_tools records** with form_schemas derived from the current hardcoded forms
5. **Create tenant_dashboard_domains** matching their current dashboard setup
6. **Update the frontend** to read from the new tables instead of hardcoded arrays
7. **Verify** each tenant's portal looks identical before and after migration

A&A's profile gets the richest data since they're the most established tenant. Their service catalog, differentiators, and leadership data already exist in the A&A project files.

---

## Phased Build Plan

### Phase 1: Company Profile + Onboarding (Foundation)
- `tenant_company_profiles` table and migration
- Company Profile tab in Alf Platform → Tenant Detail
- Company Profile section in Tenant Portal → Settings (super-admin)
- Onboarding agent (conversational company discovery)
- Industry template library (3-5 starter templates)
- Onboarding checklist that tracks: profile confirmed, documents uploaded (by department), data source connected
- Knowledge Base upload prompts integrated into onboarding flow — "Upload your SOPs to unlock full agent intelligence"
- SOP upload categorization tied to `tenant_company_profiles.departments` (dynamic department tags, not hardcoded)
- Seed profiles for existing tenants

### Phase 2: Dynamic Workspaces + Agents
- `tenant_workspaces` table
- `tenant_agents` table
- Portal generation engine (profile → workspaces + agents)
- Dynamic sidebar rendering (tenant_workspaces drives sidebar instead of hardcoded array)
- Dynamic knowledge injection (department_key from tenant_workspaces instead of hardcoded mapping)
- Agent system prompt generation from company profile + department context
- Migrate existing tenants to dynamic workspaces

### Phase 3: Dynamic Tools + Forms
- `tenant_tools` table
- Tool form schema generation from company profile
- Dynamic tool sidebar rendering
- Proposal Builder reads from tenant profile (service_catalog, differentiators)
- QBU Builder reads from tenant profile
- Other tools made profile-aware
- Migrate existing tool configurations

### Phase 4: Dynamic Dashboards
- `tenant_dashboard_domains` table
- Dashboard domain generation from company profile
- Dynamic Command Center (KPI cards from tenant domains, not hardcoded)
- Dynamic domain dashboard rendering
- KPI definition system (tenant-specific metrics per domain)
- Migrate existing dashboard configurations

### Phase 5: Full Automation of Onboarding
- New tenant creation → automatic onboarding flow
- Profile confirmation → one-click portal generation
- Document upload → automatic agent enrichment
- Data connection → automatic dashboard activation
- The entire sequence from "new tenant" to "fully operational portal" without manual configuration

---

## Relationship to Subscription Tiers

The onboarding and portal generation system works the same across all tiers. What differs is what gets activated:

**Melmac:** Profile generates workspaces and dashboard domains. Agents, tools, and automation are not activated. The tenant sees their data organized by their actual departments.

**Orbit:** Profile generates workspaces, agents, tools, and dashboard domains. Knowledge base and action plans activate. The tenant gets AI intelligence scoped to their actual operations.

**Galaxy:** Everything in Orbit, plus SOP analysis spawns automation flows, agent skills, and connected execution. Custom builds extend the dynamically generated portal.

The profile is the same across tiers. The tier determines how much of the generated portal is active.

---

*This architecture ensures that Alf is truly what the identity document says it is: a platform that learns about each company and builds the intelligence they need. No hardcoded assumptions. No one-size-fits-all structure. Every tenant gets a portal that reflects their actual operations.*
