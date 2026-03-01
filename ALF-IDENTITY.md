# Alf Platform — Identity, Value, and Intelligence Framework

> **Version:** 2.0 — February 28, 2026
> **Author:** Philip Marzullo, Founder
> **Purpose:** This is Alf's complete identity document. Every product decision, every agent behavior, every tenant interaction, every sales conversation, and every line of code should align with what's written here.

---

## 1. What Alf Is

Alf is an operational intelligence platform that transforms how companies run their operations. While purpose-built with deep expertise in facility services, Alf's architecture is industry-agnostic — it learns about each company through onboarding, adapts its workspaces, agents, tools, and dashboards to that company's actual structure, and progressively automates their operations from visibility to intelligence to full automation.

Alf is not a dashboard tool. Alf is not a chatbot. Alf is not a workflow builder.

Alf is the operating system that sits between a company's operational data and their daily decisions. It sees everything, understands the context, and — when the company is ready — acts on their behalf.

---

## 2. The Three Levels of Value

Alf delivers value at three levels. Each builds on the one below. Each maps to a subscription tier. Each creates natural pull toward the next.

---

### Level 1: Visibility — "See Your Operations"

**Subscription tier: Melmac**

#### What the tenant gets

Connect your operational data sources. See your entire operation in one place. Everyone sees exactly what they need — nothing more, nothing less.

- **Command Center** — Single-screen operational snapshot. Hero metrics, workspace health cards, threshold-based alerts.
- **Domain Dashboards** — Generated from the company profile during onboarding. A facility services company might get Operations, Labor, Quality, Timekeeping, Safety. A logistics company might get Fleet, Routes, Warehouse, Compliance. Each with KPIs, charts, trend lines, and site-level breakdowns.
- **RBAC-filtered views** — Three metric tiers (operational, managerial, financial) ensure the right people see the right data. Site scoping filters by location. Module access controls workspace visibility.
- **Dashboard customization** — Drag-and-drop widget reordering, visibility toggles, dashboard sharing between users.
- **Data ingestion** — Snowflake connector, file upload (CSV/Excel), future CMMS and ERP connectors.

#### What it replaces

Spreadsheets. Monthly PDF reports nobody reads. The VP who has to call three site managers to understand what's happening. The ops director who flies blind between quarterly reviews.

#### The experience

A facilities VP logs in Monday morning and sees: 47 properties, 312 open tickets, 94% completion rate, labor variance at -2.1%. The safety card shows green. The quality card shows amber — corrective actions ticked up at two sites. She clicks into the Quality dashboard and sees which sites, which areas, what changed. She knows where to focus this week without making a single phone call.

A site manager logs in and sees only his three buildings. Same structure, scoped to his world.

#### What Melmac deliberately does NOT include

- No AI agents. No workspace actions. No document generation.
- No Action Plans. No knowledge base.
- No automation insights or flow proposals.
- Dashboards show data but do not interpret it.
- Analytics module is locked.

#### Why this matters for the business

Melmac is the land. Price it to remove objection — low enough that any facilities VP approves it without a committee, without procurement, without a six-month evaluation. The goal is to get their data flowing through Alf. Once it's there, the product sells the upgrade.

#### The pull toward Orbit

Every time a Melmac user looks at their dashboard and thinks "what does this mean?" or "what should I do about this?" — that's the pull. The sidebar shows Workspaces they can't access. The Tools section is visible but locked. The Action Plans page exists but requires Orbit. The product demonstrates what's missing by being useful but incomplete.

**Upgrade trigger:** "Your dashboards show you what's happening. Orbit tells you what it means and what to do about it."

---

### Level 2: Intelligence — "Understand and Act"

**Subscription tier: Orbit**

#### What the tenant gets

Everything in Melmac, plus AI agents that live inside each workspace — interpreting data, answering questions, generating documents, surfacing patterns, and recommending specific actions with evidence.

- **Workspace Agents** — Each workspace generated from the company profile gets its own AI agent, configured with that department's context and enriched by the tenant's Knowledge Base. A facility services company's Operations Agent knows custodial SOPs. A logistics company's Fleet Agent knows route optimization procedures. Agents are spawned during onboarding, not hardcoded.
- **Workspace Actions** — Named operations within each workspace. Each agent has actions relevant to its department. Actions produce targeted, contextual output based on the company profile and knowledge base.
- **Knowledge Base** — Upload SOPs, policies, training manuals, union agreements. Documents are extracted and injected into the relevant agent's context at call time. The HR Agent at Company A knows Company A's enrollment process. The HR Agent at Company B knows Company B's. Same platform, different intelligence.
- **Action Plans** — AI-generated prioritized actions from dashboard data snapshots. 5-7 items per generation with evidence, recommendations, priority, and suggested owner. Tracked through open → in_progress → completed/dismissed.
- **Tools** — Generated based on the company profile. Every tenant gets a Proposal Builder with their own service catalog and differentiators. Additional tools (QBU Builder, Incident Report, Training Plan, Budget, Transition Plan) are activated based on what's relevant to the company's operations. Each output is branded, governed by claim rules, and enriched by the knowledge base.
- **Custom Tool Builder** — Tenant admins create their own AI-powered document generators. Define fields, set purpose, and the agent builds the tool's intelligence automatically.
- **Analytics Chat** — Conversational interface for ad-hoc data questions.

#### What it replaces

The ops director who spends 4 hours building a QBU in PowerPoint. The HR manager who manually checks enrollment status in a spreadsheet and writes individual reminder emails. The site manager who sees a ticket spike and doesn't know why. The VP who reads a dashboard and still can't write an executive summary.

#### The experience

The operations manager sees work tickets spiked 18% this month. She clicks "Ask Agent" in the Operations workspace. The Operations Agent responds: "Work tickets at North Campus increased 18% QoQ, driven primarily by HVAC complaints in Building C. Historical pattern from TMA data suggests the rooftop unit serving floors 2-4 is approaching end-of-life. Recommend scheduling a PM audit and requesting a capital replacement quote." She clicks "Generate Action Plan" and gets a prioritized list she can share with leadership.

The HR manager opens the HR workspace. 12 open enrollments with a deadline in 9 days. She clicks "Draft Reminder" — the HR Agent generates personalized emails for each employee, referencing the specific benefits they haven't enrolled in, with language that matches the company's tone. She reviews, adjusts one, and manually sends them from Outlook.

That last step — "manually sends them from Outlook" — is the pull.

#### What Orbit deliberately does NOT include

- No automation flows. No scheduled execution. No triggered workflows.
- No SOP-driven discovery of automation candidates.
- No pattern-based flow proposals.
- No outbound execution through integrations (agents draft, humans send).
- Automation Insights page is visible but shows "Upgrade to Galaxy to unlock."

#### Why this matters for the business

Orbit is the expand. Price it at a fraction of the human time it replaces. If agents save 20-40 hours per month across the organization in document creation, data interpretation, and action planning — price it so the ROI is obvious within the first month.

Orbit tenants become dependent on the agents. The QBU Builder saves the ops team a full day per quarter per account. The HR Agent becomes how they handle enrollment. The Action Plans become how leadership prioritizes. This is intentional. Value creates dependency. Dependency creates retention.

#### The pull toward Galaxy

Every time an Orbit user drafts an email with an agent and then has to manually open Outlook, copy, paste, and send — that's the pull. Every time an Action Plan recommends something and a human has to go execute it step by step — that's the pull. Every time someone thinks "I wish this just happened automatically" — that's Galaxy.

**Upgrade trigger:** "Your agents draft the work. Galaxy makes them do the work."

---

### Level 3: Automation — "Alf Runs Your Operations"

**Subscription tier: Galaxy**

#### What the tenant gets

Everything in Orbit, plus Alf reads the company's SOPs and operational patterns, designs complete process automations, and manages them — so the company's operations get smarter without adding headcount.

- **SOP-Driven Discovery** — Upload operational documents. Alf analyzes every one, identifies manual processes that follow repeatable patterns, and proposes complete automation flows.
- **Pattern-Driven Discovery** — Alf observes agent usage. When users repeatedly trigger the same action with similar inputs, Alf identifies it as an automation candidate and proposes a flow.
- **Data-Driven Discovery** — Alf monitors dashboard thresholds and Action Plan patterns. When the same issue keeps appearing, Alf proposes a flow to address it automatically.
- **Automation Flows** — Complete, multi-step processes: trigger → data check → agent action → delivery → notification. Each step has its own execution mode (auto or human review).
- **Agent Spawning** — Alf generates new agent skills from SOP analysis. When a tenant approves a flow, the embedded skills activate. Agents gain capabilities that didn't exist at deployment.
- **Connected Execution** — Microsoft 365, Google Workspace, CMMS integrations. Agents don't just draft — they send emails, create calendar events, post to Teams, update work orders. All from the tenant's own accounts.
- **Automation Management** — Proposed / Active / History views. The tenant reviews proposals, monitors active flows, and sees execution history.
- **Risk-Calibrated Recommendations** — Every flow gets a risk classification. Low risk (internal notifications): recommended auto. Medium risk (internal emails): recommended review-then-auto. High risk (external client communication): recommended always-review.
- **Full Workspace Suite** — All workspaces generated from the company profile, with all agent actions enabled.

#### What it replaces

The operations coordinator who manually runs the same reporting process every month. The HR assistant who sends the same enrollment reminders every quarter. The safety director who manually checks inspection rates and sends follow-ups when they drop. The accounts receivable clerk who manually writes collection emails every week. The site manager who manually files the same incident report format every time.

These aren't strategic roles. They're process execution roles. Galaxy automates the process so the people can focus on judgment, relationships, and exceptions.

#### The experience

A facilities director uploads their "Monthly Safety Reporting" SOP. Alf analyzes it and within minutes proposes:

**Flow: Monthly Safety Report Distribution**
- **Trigger:** 3rd business day of each month
- **Step 1:** Pull safety metrics from dashboard — recordable incidents, TRIR, good saves, near misses by site
- **Step 2:** Safety Agent generates narrative summary with site-level analysis and trend interpretation
- **Step 3:** QBU Builder compiles safety section slides with current data
- **Step 4:** Deliver compiled report via email to safety committee distribution list (from safety@company.com)
- **Step 5:** Create calendar event for safety review meeting — 2nd week of month
- **Step 6:** Notify site managers of any locations flagged for corrective action

The director reviews the flow. She changes Step 4 from auto-send to review-first for the first three months. She adjusts the trigger from the 3rd to the 5th business day. She adds her safety committee email addresses. She approves.

Now it runs. Every month. Alf handles it.

Three months later, every report has been approved without changes. Alf suggests: "This flow has executed successfully 3 consecutive times with no modifications. Would you like to switch to fully automated delivery?" She agrees. One less process to manage.

Six months later, Alf has identified and proposed 14 automation flows across her operation. 9 are active. 3 are fully automated. Her team is spending 30 fewer hours per month on manual processes. Her QBUs build themselves. Her safety reports distribute themselves. Her HR reminders send themselves. She didn't design any of this — Alf did.

#### What Galaxy deliberately enables that Orbit cannot

The core difference is not just more features. It's a fundamentally different relationship with the platform:

| Orbit | Galaxy |
|-------|--------|
| Agents draft, humans execute | Agents draft AND execute (with approval) |
| Humans identify what needs to happen | Alf identifies what needs to happen |
| Knowledge base enriches agents | Knowledge base spawns new agent capabilities |
| Action Plans are recommendations | Action Plans trigger automated flows |
| Tools generate documents on demand | Flows generate and distribute documents on schedule |
| Integrations are for data input | Integrations are for data input AND action output |
| Standard tools only | Custom-built tools and workflows tailored to the tenant |

#### Custom Builds — Galaxy Exclusive

Galaxy tenants get access to custom platform development — purpose-built features, tools, integrations, and workflows designed specifically for their operation. This is not generic configuration. This is Alf's team building something that exists only for that tenant.

**What custom builds include:**

- **Custom data ingestion pipelines** — Specialized parsers for the tenant's unique data formats. Example: A&A's QBU Excel intake template parser that extracts structured data from a supervisor questionnaire spreadsheet and maps it directly to QBU builder sections. The tenant's field teams fill out a familiar Excel form, upload it, and the platform handles the rest.
- **Custom tool creation** — Tools that go beyond what the Tool Builder can do. Specialized intake forms, multi-step generation workflows, custom output formats, or industry-specific document types that require bespoke logic.
- **Custom integrations** — Connections to tenant-specific systems that aren't in Alf's standard connector library. Legacy CMMS platforms, proprietary ERP exports, niche industry tools.
- **Custom dashboard widgets** — KPI calculations, visualizations, or data views specific to the tenant's operational model that don't fit the standard domain dashboards.
- **Custom automation flows** — Flows that require platform-level engineering beyond what the SOP analysis pipeline can propose — complex branching logic, multi-system orchestration, or custom trigger types.

**How custom builds work:**

1. Tenant identifies a need or Alf identifies an opportunity during operational analysis
2. Alf team scopes the build — what it does, what data it touches, what the output is
3. Build is executed and deployed within the tenant's portal (scoped to their tenant_id, isolated by RLS)
4. Tenant tests and approves
5. Ongoing maintenance included as part of Galaxy subscription

**Why this matters:**

Every custom build deepens the relationship and increases switching cost. The QBU Excel parser exists because A&A's field supervisors fill out a specific spreadsheet format — that parser is useless to any other tenant but invaluable to A&A. It's a small feature that saves hours per quarter and makes the platform feel like it was built specifically for them. Because it was.

Custom builds also serve as R&D. A feature built for one tenant often reveals a pattern that becomes a standard platform feature for all tenants. The QBU Excel parser today could become a generic "intake template parser" that every tenant uses tomorrow.

**Pricing:** Custom builds are included in the Galaxy subscription up to a reasonable scope. Large-scale custom development (multi-week builds, complex integrations) may be scoped as add-on projects with separate pricing. The goal is to say "yes" to most custom requests — each one increases retention and platform value.

#### Why this matters for the business

Galaxy is the lock-in. Not lock-in through switching costs — lock-in through compounding value. Every month, Alf learns more about the tenant's operations. Every flow that runs successfully makes the platform more valuable. Every SOP uploaded teaches Alf something new. The longer a tenant is on Galaxy, the harder it is to leave — not because they can't, but because they'd lose an operational intelligence layer that took months to build and is unique to them.

Price Galaxy at the value of operational improvement. If automated flows reduce work orders by 13%, eliminate SLA misses, cut 30 hours of monthly manual reporting, and prevent compliance gaps — that's worth multiples of the subscription. The tenant isn't paying for software. They're paying for smarter operations.

#### The retention mechanic

Galaxy tenants don't churn because:
- Their agents have been trained on their specific SOPs
- Their automation flows are customized to their operations
- Their custom builds exist only on this platform — purpose-built features they can't take with them
- Their execution history provides an audit trail they can't replicate
- Their team has stopped doing the manual work — the institutional knowledge of "how we used to do it" fades
- Switching to a competitor means rebuilding everything from scratch with zero operational intelligence

This is by design.

---

## 3. Subscription Architecture

### Tier Summary

| | Melmac | Orbit | Galaxy |
|---|--------|-------|--------|
| **Identity** | See your operations | Understand and act | Alf runs your operations |
| **Tagline** | Visibility | Intelligence | Automation |
| **Max users** | 10 | 25 | 100 |
| **Max agent calls/mo** | 1,000 | 5,000 | 25,000 |
| **Dashboards** | ✓ Command Center + domain dashboards | ✓ | ✓ |
| **RBAC & site scoping** | ✓ | ✓ | ✓ |
| **Dashboard customization** | ✓ | ✓ | ✓ |
| **Data connectors** | ✓ Snowflake, file upload | ✓ | ✓ + outbound integrations |
| **AI Agents** | — | ✓ Per-workspace agents | ✓ Per-workspace agents + spawned skills |
| **Knowledge Base** | — | ✓ | ✓ |
| **Action Plans** | — | ✓ | ✓ + flow triggers |
| **Tools** | — | ✓ Profile-generated + custom | ✓ Profile-generated + custom + scheduled |
| **Custom Tool Builder** | — | ✓ | ✓ |
| **Analytics Chat** | — | ✓ | ✓ |
| **Workspaces** | — | — | ✓ Full suite from company profile |
| **SOP Analysis** | — | — | ✓ |
| **Automation Flows** | — | — | ✓ |
| **Agent Spawning** | — | — | ✓ |
| **Connected Execution** | — | — | ✓ Microsoft, Google, CMMS |
| **Automation Management** | — | — | ✓ Proposed / Active / History |
| **Custom Builds** | — | — | ✓ Custom tools, integrations, pipelines, widgets |

### Module Access by Tier

| Module | Melmac | Orbit | Galaxy |
|--------|--------|-------|--------|
| dashboards | ✓ | ✓ | ✓ |
| analytics | — | ✓ | ✓ |
| tools | — | ✓ | ✓ |
| actionPlans | — | ✓ | ✓ |
| knowledge | — | ✓ | ✓ |
| workspaces (all from profile) | — | — | ✓ |
| automation | — | — | ✓ |

Note: Workspace module keys are dynamic — generated from `tenant_company_profiles.departments`, not hardcoded. A facility services tenant might have `ops`, `hr`, `finance`, `sales`, `safety`. A logistics tenant might have `fleet`, `dispatch`, `warehouse`, `hr`, `finance`. The tier controls whether workspaces are available at all, not which specific workspaces exist.

### Pricing Philosophy

**Melmac — Remove the objection.** Price low enough that a facilities VP approves without a committee. The goal is data flowing through Alf. Monthly commitment, no annual required. This is the free trial that isn't free — just cheap enough to be obvious.

**Orbit — Replace the hours.** Price at a fraction of the human time it saves. If agents save 20-40 hours/month, price it at 25-30% of what that labor costs. Monthly or annual. The ROI should be provable within 30 days.

**Galaxy — Share the improvement.** Price at the value of operational outcomes. This is where Glide Path-style economics can apply — shared savings, performance-based pricing, or premium flat rate justified by measured operational improvement. Annual commitment preferred. The value compounds over time, and the pricing should reflect that.

### Upgrade Triggers (Built Into the Product)

These are moments the product creates that naturally lead to upgrade conversations:

**Melmac → Orbit:**
- User stares at a dashboard metric and has no interpretation → "Upgrade to Orbit for AI-powered insights"
- User needs to create a QBU or proposal manually → Tools section shows locked tools with "Available on Orbit"
- Threshold breach appears in Needs Attention → No Action Plan available → "Orbit generates action plans automatically"
- Sidebar shows Workspaces (HR, Finance, etc.) grayed out or absent

**Orbit → Galaxy:**
- Agent drafts an email → user has to manually copy/paste/send → "Galaxy connects to Microsoft 365 and sends it for you"
- Same agent action triggered 5+ times in a month → Alf shows insight: "This task could be automated. Galaxy enables automation flows."
- Action Plan generates the same recommendation three months in a row → "Galaxy would have handled this automatically"
- Automation Insights page visible but locked → "Upload your SOPs. Galaxy finds the automations for you."
- User uploads an SOP to Knowledge Base → system detects automation candidates but can't act → "Galaxy turns these SOPs into automated workflows"

---

## 4. Agent Architecture

### Workspace Agents

Agents are not hardcoded. They are generated from the tenant's company profile during onboarding:

**Per-workspace agents** — One agent per department defined in the company profile. Each gets a system prompt generated from the department context + company profile + knowledge base documents. Examples:
- A facility services company with an Operations department → Operations Agent (custodial, maintenance, grounds context)
- A logistics company with a Fleet department → Fleet Agent (vehicle management, route optimization context)
- Any company with HR → HR Agent (configured for that company's specific workforce model)

**Cross-functional agents** — Generated for every tenant regardless of profile:
- Admin Agent — general support and system guidance
- Analytics Agent — conversational data Q&A across all dashboard domains

**Tool agents** — Generated based on which tools are activated for the tenant:
- Proposal Builder Agent, QBU Builder Agent, etc. — configured with the company's service catalog, differentiators, and voice from the knowledge base

### Agent Identity

Every agent in Alf has:
- **System prompt** — Base instructions incorporating shared rules (tone, claim governance, output formatting)
- **Knowledge modules** — Department-scoped documents injected at call time from the tenant's Knowledge Base
- **Automation skills** — Spawned capabilities from SOP analysis, activated within approved flows
- **Actions** — Named operations with structured inputs and targeted outputs
- **Tenant context** — Company name, industry, operational profile auto-injected
- **Model** — AI model selection (managed at platform level, never exposed to tenant)

### Knowledge Injection Pipeline

When an agent is called:
1. Map agent to its workspace via `tenant_agents.workspace_id` → `tenant_workspaces.department_key`
2. Fetch extracted documents from `tenant_documents` where department matches the workspace's department_key
3. Fetch active automation skills from `automation_actions` where agent_key matches
4. Inject the tenant's company profile summary (from `tenant_company_profiles`) as baseline context
5. Append all context to the system prompt as structured blocks
6. Execute the call with full tenant-specific intelligence

This means two tenants calling the same type of agent (e.g., both have an "Operations Agent") get different results — because their company profile, knowledge base, and operational context are different. That's the moat.

### Agent Spawning Mechanics

1. SOP analysis identifies an automatable process
2. Alf generates an agent skill — a prompt addition that gives an existing agent a new capability
3. The skill is embedded within a proposed automation flow
4. When the tenant approves the flow, the skill activates via `tenant_agent_overrides`
5. The agent now has a capability it didn't have at deployment
6. The skill is scoped to that tenant — other tenants are unaffected

### Agent Governance

- All agent calls proxied through Alf's backend (tenants never call AI providers directly)
- Claim governance enforced on every output (never fabricate metrics, cite sources)
- Usage logged per tenant, per agent, per action, per token count
- Rate limiting per tenant (sliding window)
- Agent prompts and model configuration invisible to tenants
- Tenant overrides are append-only (can add context, never replace core prompt)

---

## 5. Automation Flow Architecture

### Flow Data Model

```
automation_flows
  - id (uuid)
  - tenant_id
  - name ("Monthly Safety Report Distribution")
  - description
  - trigger_type (scheduled | event | threshold | manual)
  - trigger_config (JSONB — cron expression, event name, threshold params)
  - steps (JSONB array — ordered list of step objects)
  - required_integrations (["microsoft", "snowflake"])
  - risk_level (low | medium | high)
  - status (proposed | accepted | active | paused | rejected | retired)
  - source (sop_analysis | pattern_detection | data_driven | manual | platform_suggested)
  - source_id (links to originating analysis or action)
  - recommended_by_agent (agent_key that proposed the flow)
  - proposed_at
  - accepted_by (user_id)
  - accepted_at
  - rejected_reason (text, if rejected)
  - last_execution_at
  - execution_count
  - success_count
  - created_at
  - updated_at
```

### Step Schema

Each step in the steps JSONB array:

```json
{
  "order": 1,
  "type": "check_data | condition | agent_action | deliver_email | deliver_teams | create_calendar | update_record | notify | wait",
  "label": "Pull safety metrics from dashboard",
  "description": "Query current quarter safety KPIs across all sites",
  "config": {
    "source": "dashboard",
    "domain": "safety",
    "query_params": {}
  },
  "integration": null,
  "execution_mode": "auto | review",
  "on_failure": "pause_flow | skip | retry | notify_admin",
  "timeout_minutes": 5
}
```

### Flow Execution Log

```
automation_flow_executions
  - id (uuid)
  - flow_id
  - tenant_id
  - status (running | completed | failed | paused_for_review)
  - started_at
  - completed_at
  - step_results (JSONB array — per-step outcome, timing, output)
  - triggered_by (scheduled | manual | event_name)
  - reviewed_by (user_id, if any step required review)
  - error_detail (text, if failed)
```

### Risk Classification Rules

| Risk Level | Criteria | Default Execution Mode | Can Tenant Override? |
|------------|----------|----------------------|---------------------|
| Low | Internal notifications, data checks, report generation, dashboard updates | Auto | Yes |
| Medium | Emails to internal staff, calendar events, Teams messages, internal document distribution | Review for first 5 executions, then auto | Yes |
| High | Emails to external clients, financial communications, compliance actions, anything touching money or legal | Always review | Yes, but Alf shows warning |

### Flow Discovery Methods

**SOP-Driven:** Tenant uploads document → Alf extracts manual steps → identifies repeatable patterns → proposes flow

**Pattern-Driven:** Alf observes repeated agent actions → clusters by similarity → proposes flow when threshold reached (e.g., 5+ similar actions in 30 days)

**Data-Driven:** Alf monitors Action Plans → identifies recurring recommendations → proposes flow to handle automatically

**Platform-Suggested:** Alf has a library of common facility services flows (monthly safety reports, quarterly QBU generation, weekly AR follow-ups, enrollment reminders). When a tenant's data profile matches, Alf suggests relevant templates.

---

## 6. Integration Model

### Architecture Principle

Alf sits at the center. Integrations are inputs and outputs. The AI layer is Alf's core — tenants never bypass it.

```
[Data Sources] → INBOUND → [Alf: Visibility + Intelligence + Automation] → OUTBOUND → [Action Channels]
```

### Inbound (Data Sources → Level 1 Visibility)

| Integration | What It Provides | Connector Type |
|-------------|-----------------|---------------|
| Snowflake | ERP data, operational metrics, labor, timekeeping | Database query |
| File Upload (CSV/Excel) | Manual data loads, historical imports | File parser |
| Microsoft 365 | Documents, emails, calendar context | OAuth + Graph API |
| Google Workspace | Documents, emails, calendar context | OAuth + Google APIs |
| ServiceNow | Work orders, incident data | REST API |
| Corrigo | Work orders | REST API |
| TMA Systems | Asset management, PM schedules | REST API |
| QuickBooks / Sage | AP/AR, budgets, financial data | OAuth + API |
| ADP / Paycom | Payroll, workforce data | OAuth + API (partner program) |

### The AI Layer (Alf's Core → Level 2 Intelligence)

- All agent calls proxied through Alf's backend
- Knowledge injection scoped by tenant and department
- Claim governance enforced on every output
- Usage metered per tenant, agent, action
- Tenants never interact with AI provider directly
- API key management is platform-level (tenant never sees or provides AI keys)

### Outbound (Action Channels → Level 3 Automation)

| Integration | What It Enables | Required For |
|-------------|----------------|-------------|
| Microsoft 365 | Send email, create calendar events, post to Teams, access SharePoint | deliver_email, deliver_teams, create_calendar |
| Google Workspace | Send email, create events, access Drive | deliver_email, create_calendar |
| CMMS (ServiceNow, Corrigo, TMA) | Create/update work orders | update_record |
| Alf Internal | Notifications, action plan updates, dashboard refresh | notify, update_record |

### Credential Architecture

- **Platform-level credentials** (managed by Alf, invisible to tenant): AI provider API keys (Anthropic)
- **Tenant-level credentials** (managed by tenant super-admin or Alf on their behalf): Snowflake, Microsoft 365, Google, CMMS, financial systems
- All credentials AES-256-GCM encrypted at rest
- Encryption key isolated to backend environment
- OAuth tokens auto-refresh
- Credential audit log tracks every operation with user attribution

### Connection Management

- Tenant super-admins manage their own connections via the Connections page
- Alf platform owner has full visibility and override capability via Tenant Detail → API Keys
- For tenants without IT staff, Alf manages connections on their behalf (guided onboarding)
- Connection status monitored — stale data banners appear on dashboards when sync fails or credentials expire

---

## 7. Tenant Experience Architecture

### Role Hierarchy

| Role | What They See | What They Do |
|------|-------------|-------------|
| User | Dashboards (scoped to their sites and metric tier), workspaces (scoped to their modules) | Use agents, view data, generate documents |
| Manager | Elevated metric tier (managerial), broader site access | Same as user with more data visibility |
| Admin | All data, all modules | Manage users, knowledge base, role templates, custom tools |
| Super-admin | Everything admin sees + platform configuration | Manage connections, approve automation flows, configure settings |

### Tenant Admin Structure

**Admin pages (admin role):**
- User Management — add, edit, deactivate users, assign roles (up to admin), assign sites, set dashboard templates
- Knowledge Base — upload, categorize, delete documents
- Automation Insights — view SOP analyses and roadmaps
- Role Templates — create/edit dashboard RBAC templates
- Tool Builder — create custom AI tools

**Super-admin pages (super-admin role):**
- Everything admin has, plus:
- Connections — manage data source and service integrations
- Settings — tenant configuration, notification preferences, data & privacy info
- Automation Flows — review proposed flows, approve/customize/reject, manage active flows, view execution history

### What Tenants Never See

- AI model names or versions
- Agent system prompts or core instructions
- Platform architecture details (backend version, routing, proxy info)
- Other tenants' data, configurations, or existence
- Anthropic API keys or AI provider credentials
- Usage metering internals (they see their usage, not the billing mechanics)
- Agent knowledge injection mechanics

---

## 8. Platform Architecture (Alf's Control Layer)

### What Alf Controls

- AI model selection and configuration per agent
- Agent core prompts and base capabilities
- Knowledge injection pipeline
- Automation analysis algorithms and flow proposal logic
- Flow execution engine and scheduling
- Security: encryption, RLS, tenant isolation, credential management
- Claim governance rules enforced on all agent outputs
- Usage metering, rate limiting, and billing
- Integration connector infrastructure
- Tenant provisioning, tier management, module configuration

### Alf Platform Admin Capabilities

From the Alf Platform, the platform owner can:
- Create and configure tenants (name, tier, modules, branding)
- Manage all tenant users (add, edit roles, deactivate, assign sites, set templates)
- View and manage all tenant credentials (including platform-only types)
- Configure agent definitions (prompts, models, status, per-tenant overrides)
- Monitor usage across all tenants (by agent, by day, by tenant)
- Manage dashboard templates and apply them per tenant
- Upload knowledge base documents on behalf of tenants
- Run SOP analysis pipelines for tenants
- View automation flow proposals and execution history
- Back up individual tenants or the entire platform
- Configure platform-level settings (rate limits, default models, encryption keys)

### Two-Tier Service Model

**Self-service tenants** (have IT staff): Connect their own data sources, manage their own users, upload their own documents, review and approve their own flows. Alf is the product.

**Managed tenants** (no IT staff): Alf team handles data connection, user setup, document ingestion, and initial flow configuration. The tenant reviews and approves flows, but the setup is done for them. Alf is the product + the service.

Both run on the same platform. The difference is who drives the onboarding and configuration.

---

## 9. Onboarding Journey

> **Full onboarding architecture is defined in `ALF-DYNAMIC-ARCHITECTURE.md`.** This section provides the summary.

### Phase 0: Company Discovery (All Tiers)

1. Tenant created in Alf (tier, branding, optional industry template)
2. **Company Discovery** — structured intake via onboarding agent, document upload, or manual entry. Alf learns: industry, departments, services, differentiators, technology stack, leadership, geographic coverage.
3. Company profile generated and confirmed by tenant super-admin
4. **Portal generated from profile** — workspaces, agents, tools, dashboard domains are created dynamically based on what the company actually has. No hardcoded assumptions.
5. Users provisioned with roles, site assignments, dashboard templates

### Phase 1: See Your Operations (Level 1 → Melmac)

6. Data source connected (Snowflake, file upload, or guided setup)
7. Data flows into Alf's normalized schema
8. Dashboard domains (generated from profile) light up with real data
9. **Value delivered:** Real-time operational visibility across all sites, organized by the company's actual departments

### Phase 2: Get Intelligent Help (Level 2 → Orbit)

10. Tier upgraded — workspace agents, tools, knowledge base, action plans unlock
11. **Operational Knowledge Upload** — tenant uploads SOPs, policies, training materials, previous deliverables to Knowledge Base. This is critical — SOPs are the raw material for agent intelligence and automation discovery.
12. Workspace agents gain tenant-specific context via knowledge injection
13. Tools produce branded documents using the company's voice and profile data
14. Action Plans start generating — AI-driven prioritization from dashboard data
15. **Value delivered:** AI team that knows this company's specific operations and produces real work product

### Phase 3: Automate Your Operations (Level 3 → Galaxy)

16. Tier upgraded — full workspaces, automation, SOP analysis, connected execution unlock
17. SOP analysis runs across all uploaded documents — identifies automation candidates
18. Department automation roadmaps generated
19. Flow proposals presented in Automation Management
20. Tenant reviews, customizes, and approves flows
21. Outbound integrations connected (Microsoft 365, CMMS)
22. Approved flows activated — scheduled, triggered, or event-driven
23. Monitoring begins — execution tracking, success rates, improvement suggestions
24. Pattern-driven and data-driven discovery proposes additional flows over time
25. Custom builds extend the dynamically generated portal for tenant-specific needs
26. **Value delivered:** Operations that run themselves, getting smarter every month

---

## 10. Competitive Position

### What exists in the market

- **BI tools** (Tableau, Power BI, Looker) — Visualization. No agents. No automation. No industry specificity.
- **AI chatbots** (generic ChatGPT wrappers) — Conversation. No data integration. No operational context. No flow execution.
- **Workflow automation** (Zapier, Make, Power Automate) — Connects apps. Requires humans to design every workflow. No AI intelligence. No SOP analysis.
- **Facility management software** (FM:Systems, Archibus, iOFFICE) — Purpose-built CMMS/CAFM. No AI agents. No operational intelligence. No cross-domain visibility.
- **Industry BI** (FacilityONE, Planon Analytics) — Reports for facility data. Static dashboards. No AI interpretation. No automation.

### Where Alf is different

No platform does all three:
1. Connects operational data and provides role-filtered visibility (like BI tools)
2. Deploys AI agents that understand the specific tenant's operations (like a smart consultant)
3. Reads SOPs and designs automation flows that execute through connected services (like a workflow engine with a brain)

Alf's architecture is industry-agnostic — it learns about each company and adapts. But its deepest expertise is in facility services, where it has proven deployment experience across custodial, grounds, MEP, and integrated FM operations. This vertical depth is where Alf wins today. The horizontal architecture is where it scales tomorrow.

The closest analog is not a software product. It's hiring an operations consultant who also happens to be a software engineer. Alf replaces that person — and scales across every tenant without adding headcount.

### The moat

- **Data moat:** The longer data flows through Alf, the more historical context agents have.
- **Knowledge moat:** Every SOP uploaded makes the tenant's agents smarter and more specific.
- **Automation moat:** Every flow approved and running is operational infrastructure the tenant depends on.
- **Custom build moat:** Every custom pipeline, tool, widget, or integration exists only on Alf — built for that tenant, useless anywhere else, invaluable to them.
- **Switching cost:** Leaving Alf means losing agents trained on your SOPs, flows customized to your operations, custom features built for your workflow, and execution history you can't replicate.

---

## 11. Hard Boundaries

These are non-negotiable across all tiers, all tenants, all interactions:

- Alf **never** fabricates data, metrics, headcount, wages, or pricing
- Alf **never** bypasses tenant-set review requirements on flow steps
- Alf **never** accesses one tenant's data from another tenant's context
- Alf **never** sends communications without the tenant having explicitly approved the flow
- Alf **never** exposes AI model details, agent prompts, or platform architecture to tenants
- Alf **never** stores credentials in plaintext — always AES-256-GCM encrypted
- Alf **never** allows tenants to interact with AI providers directly — all calls proxied through backend
- Alf **never** activates automation skills without tenant approval of the containing flow
- All outbound communications (email, Teams, calendar) come from the **tenant's own accounts**, not from Alf

---

## 12. The Business in One Page

**What Alf is:** An operational intelligence platform for facility services companies.

**What Alf does:** Connects to a company's data, deploys AI agents that understand their operations, and progressively automates their workflows.

**How Alf makes money:** Three-tier subscription (Melmac → Orbit → Galaxy) with natural upgrade pull built into the product experience.

**Why tenants stay:** Agents trained on their SOPs, flows customized to their operations, and compounding intelligence that gets more valuable every month.

**Why tenants can't replicate it:** Building what Alf does requires operational domain expertise, AI agent architecture, multi-tenant security, SOP analysis pipelines, flow execution engines, and integration infrastructure. No facility services company is going to build this. And no generic AI platform understands their industry.

**The three sentences:**

**Melmac:** Connect your data. See your operations.

**Orbit:** Your data comes with an AI team that interprets every metric and builds every document.

**Galaxy:** Alf reads how you operate, builds the automations you need, and manages them — so your operations get smarter without adding headcount.

---

*This document is the source of truth for Alf's identity. All platform development, agent design, dashboard architecture, automation proposals, tenant experiences, sales conversations, and pricing decisions should align with the framework defined here.*
