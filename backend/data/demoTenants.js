/**
 * Demo Tenant Definitions
 *
 * Static configs for three demo tenants (Galaxy / Orbit / Melmac).
 * Used by demoSeed.js to create tenants, users, company profiles,
 * operational data, and knowledge base documents.
 */

// ── Shared password for all demo accounts ────────────────────────────
export const DEMO_PASSWORD = 'AlfDemo2026!';

// ── Demo tenant slugs (used for reset validation) ────────────────────
export const DEMO_SLUGS = new Set(['apex-demo', 'ridgeline-demo', 'clearpoint-demo']);

// ── Employee name pool (40 names) ────────────────────────────────────
export const EMPLOYEE_NAMES = [
  { first: 'Maria', last: 'Garcia' },
  { first: 'James', last: 'Johnson' },
  { first: 'Rosa', last: 'Martinez' },
  { first: 'David', last: 'Williams' },
  { first: 'Ana', last: 'Lopez' },
  { first: 'Michael', last: 'Brown' },
  { first: 'Carmen', last: 'Rodriguez' },
  { first: 'Robert', last: 'Davis' },
  { first: 'Luz', last: 'Hernandez' },
  { first: 'William', last: 'Miller' },
  { first: 'Patricia', last: 'Wilson' },
  { first: 'Carlos', last: 'Moore' },
  { first: 'Jennifer', last: 'Taylor' },
  { first: 'Jose', last: 'Anderson' },
  { first: 'Linda', last: 'Thomas' },
  { first: 'Juan', last: 'Jackson' },
  { first: 'Sandra', last: 'White' },
  { first: 'Richard', last: 'Harris' },
  { first: 'Diana', last: 'Martin' },
  { first: 'Kevin', last: 'Thompson' },
  { first: 'Elena', last: 'Clark' },
  { first: 'Brian', last: 'Lewis' },
  { first: 'Yolanda', last: 'Walker' },
  { first: 'Jason', last: 'Hall' },
  { first: 'Gloria', last: 'Allen' },
  { first: 'Daniel', last: 'Young' },
  { first: 'Teresa', last: 'King' },
  { first: 'Mark', last: 'Wright' },
  { first: 'Sofia', last: 'Scott' },
  { first: 'Anthony', last: 'Green' },
  { first: 'Isabel', last: 'Adams' },
  { first: 'Thomas', last: 'Baker' },
  { first: 'Marta', last: 'Nelson' },
  { first: 'Chris', last: 'Hill' },
  { first: 'Adriana', last: 'Ramirez' },
  { first: 'Steven', last: 'Campbell' },
  { first: 'Lucia', last: 'Mitchell' },
  { first: 'Edward', last: 'Roberts' },
  { first: 'Veronica', last: 'Carter' },
  { first: 'Frank', last: 'Phillips' },
];

// ── Tenant Definitions ───────────────────────────────────────────────

export const DEMO_TENANTS = [
  // ─── GALAXY TIER: Apex Service Group ─────────────────────
  {
    slug: 'apex-demo',
    company_name: 'Apex Service Group',
    plan: 'galaxy',
    brand_primary_color: '#1B6B3A',
    brand_sidebar_bg: '#0F2B1A',
    brand_display_name: 'Apex',
    employeesPerSite: 8,
    totalTickets: 4000,
    totalTimekeeping: 15000,
    sites: [
      'Lakewood Corporate Center',
      'Prairie View Medical Campus',
      'Riverpoint Office Park',
      'Midtown Financial Tower',
      'Gateway Logistics Hub',
      'Northfield University',
      'Crestwood Civic Center',
      'Harbor Industrial Complex',
      'Summit Ridge Mall',
      'Westgate Technology Park',
    ],
    users: [
      { email: 'user@apex-demo.alf.dev', role: 'user', name: 'Demo User', modules: ['dashboards'] },
      { email: 'manager@apex-demo.alf.dev', role: 'user', name: 'Demo Manager', modules: ['dashboards', 'analytics', 'tools', 'actionPlans'] },
      { email: 'admin@apex-demo.alf.dev', role: 'admin', name: 'Demo Admin', modules: [] },
      { email: 'superadmin@apex-demo.alf.dev', role: 'super-admin', name: 'Demo Super Admin', modules: [] },
    ],
    companyProfile: {
      industry: 'Facility Services',
      sub_vertical: 'Commercial Janitorial',
      company_description: 'Apex Service Group delivers integrated facility services to commercial, healthcare, educational, and industrial clients. With a workforce of 1,200+ across 10 locations, Apex combines data-driven operations with a people-first culture to exceed client expectations.',
      founded_year: 2003,
      employee_count: '1000-2500',
      headquarters: 'Chicago, IL',
      ownership_model: 'Private',
      geographic_coverage: ['Illinois', 'Indiana', 'Wisconsin', 'Michigan'],
      certifications: ['CIMS-GB', 'ISSA Member', 'OSHA VPP Star'],
      departments: [
        { key: 'operations', name: 'Operations', description: 'Day-to-day service delivery and quality management', icon: 'clipboard-list' },
        { key: 'hr', name: 'Human Resources', description: 'Workforce management, training, and employee relations', icon: 'users' },
        { key: 'safety', name: 'Safety', description: 'Workplace safety programs and compliance', icon: 'shield-check' },
        { key: 'finance', name: 'Finance', description: 'Budgeting, invoicing, and financial planning', icon: 'dollar-sign' },
        { key: 'sales', name: 'Sales', description: 'Business development and client retention', icon: 'trending-up' },
        { key: 'purchasing', name: 'Purchasing', description: 'Supply chain and vendor management', icon: 'shopping-cart' },
      ],
      service_catalog: [
        { category: 'Janitorial', services: ['Day Porter', 'Nightly Cleaning', 'Deep Clean', 'Carpet Care', 'Hard Floor Care'] },
        { category: 'Specialty', services: ['Post-Construction Cleanup', 'Window Washing', 'Pressure Washing', 'Electrostatic Disinfection'] },
        { category: 'Facility Support', services: ['Light Maintenance', 'Landscaping Coordination', 'Waste Management', 'Recycling Programs'] },
      ],
      differentiators: [
        { key: 'data_driven', label: 'Data-Driven Operations', description: 'Real-time dashboards and analytics power every decision from the front line to the C-suite.' },
        { key: 'people_first', label: 'People First Culture', description: 'Industry-leading retention through competitive wages, career paths, and multilingual training.' },
        { key: 'green_cleaning', label: 'Green Cleaning Certified', description: 'CIMS-GB certified with sustainable products and processes across all accounts.' },
      ],
      key_leadership: [
        { name: 'Marcus Chen', title: 'President & CEO' },
        { name: 'Sarah Mitchell', title: 'VP of Operations' },
        { name: 'Diego Ramirez', title: 'VP of Human Resources' },
      ],
      technology_platforms: [
        { name: 'Alf Platform', description: 'AI-powered operations intelligence — dashboards, analytics, and automated reporting.' },
      ],
      profile_status: 'confirmed',
      onboarding_checklist: {
        profile_confirmed: true,
        documents_uploaded: true,
        data_source_connected: true,
        portal_generated: true,
      },
    },
    knowledgeDocs: [
      {
        file_name: 'Nightly Cleaning SOP.pdf',
        doc_type: 'sop',
        department: 'ops',
        status: 'extracted',
        extracted_text: `NIGHTLY CLEANING STANDARD OPERATING PROCEDURE
Apex Service Group — Effective January 2025

1. SCOPE
This SOP applies to all nightly cleaning crews across Apex Service Group accounts. It defines the minimum standard for routine nightly cleaning of commercial office spaces, medical facilities, and educational buildings.

2. PRE-SHIFT PROCEDURES
2.1 Report to site 15 minutes before shift start
2.2 Clock in using the timekeeping system — biometric or badge scan
2.3 Attend shift briefing with Lead Cleaner or Site Supervisor
2.4 Review nightly assignment sheet for any special instructions or client requests
2.5 Inspect cleaning cart — verify all supplies stocked (chemicals, liners, microfiber cloths, mop heads)
2.6 Conduct safety walkaround — note wet floors, damaged equipment, or hazards

3. RESTROOM CLEANING (Every Night)
3.1 Post "Cleaning in Progress" signage
3.2 Don appropriate PPE (gloves, eye protection for chemical use)
3.3 Empty all trash receptacles, replace liners
3.4 Clean and disinfect all fixtures: toilets, urinals, sinks, countertops
3.5 Clean mirrors and chrome fixtures with glass cleaner
3.6 Refill soap dispensers, paper towels, and toilet tissue
3.7 Mop floors with disinfectant solution (follow dilution ratios on SDS)
3.8 Inspect for maintenance issues (leaks, broken fixtures) — report to Site Supervisor

4. OFFICE AREA CLEANING (Every Night)
4.1 Empty all trash and recycling bins, replace liners
4.2 Dust horizontal surfaces: desks, windowsills, ledges (do not move personal items)
4.3 Wipe down common-touch surfaces: door handles, light switches, elevator buttons
4.4 Vacuum all carpeted areas using HEPA-filtered equipment
4.5 Spot-clean carpet stains as identified
4.6 Dust mop or auto-scrub hard floors per floor type

5. BREAK ROOM / KITCHEN (Every Night)
5.1 Empty and reline all trash and recycling
5.2 Wipe down countertops, tables, and appliance exteriors
5.3 Clean and sanitize sinks
5.4 Spot-clean cabinet fronts and appliance surfaces
5.5 Sweep and mop floor

6. COMMON AREAS & LOBBIES (Every Night)
6.1 Vacuum entrance mats, shake out or replace as needed
6.2 Clean glass entry doors (both sides)
6.3 Dust and wipe lobby furniture
6.4 Empty trash receptacles
6.5 Spot-clean elevator interiors: walls, floor, buttons

7. POST-SHIFT PROCEDURES
7.1 Return all equipment to storage, report any damage
7.2 Secure chemical storage area
7.3 Complete shift checklist in Alf Platform
7.4 Report any building issues to Site Supervisor
7.5 Clock out using timekeeping system

8. QUALITY STANDARDS
- Floors: No visible debris, streaks, or standing water
- Restrooms: All fixtures clean, supplies stocked, no odors
- Offices: Desks clear of dust, trash emptied, carpets vacuumed edge to edge
- Client satisfaction score target: 95% or above on monthly surveys`,
      },
      {
        file_name: 'Quality Inspection SOP.pdf',
        doc_type: 'sop',
        department: 'ops',
        status: 'extracted',
        extracted_text: `QUALITY INSPECTION STANDARD OPERATING PROCEDURE
Apex Service Group — Effective January 2025

1. PURPOSE
Establish a consistent framework for site quality inspections to ensure service delivery meets Apex Service Group standards and client expectations.

2. INSPECTION FREQUENCY
2.1 Site Supervisor: Weekly walkthrough of all areas
2.2 Area Manager: Monthly formal inspection with scoring
2.3 Operations Director: Quarterly deep-dive with client participation

3. INSPECTION AREAS AND SCORING
Each area is scored 1-5:
  5 = Exceptional (exceeds standard)
  4 = Meets standard
  3 = Minor deficiency (correct within 24 hours)
  2 = Significant deficiency (correct immediately, retrain crew)
  1 = Unacceptable (escalate to management)

3.1 Restrooms — cleanliness, supply levels, odor control, fixture condition
3.2 Office Areas — dust levels, carpet condition, trash removal, surface cleanliness
3.3 Common Areas — lobby appearance, elevator cleanliness, glass doors
3.4 Break Rooms — sanitization, appliance cleanliness, floor condition
3.5 Building Exterior — entrance mats, sidewalk cleanliness, smoking areas

4. INSPECTION PROCESS
4.1 Use Alf Platform inspection form (mobile or tablet)
4.2 Photograph any deficiencies scoring 2 or below
4.3 Note corrective actions required with responsible party and deadline
4.4 Review findings with Site Supervisor or Lead Cleaner on-site
4.5 Submit completed inspection — auto-generates corrective action tickets

5. CORRECTIVE ACTION WORKFLOW
5.1 System generates work ticket for each deficiency
5.2 Assigned cleaner or supervisor has 24 hours to resolve (48 hours for equipment-dependent items)
5.3 Supervisor verifies correction and closes ticket with photo evidence
5.4 Unresolved tickets escalate to Area Manager after deadline

6. REPORTING
6.1 Monthly quality score dashboard available in Alf Platform
6.2 Trend analysis: track scores by site, area, and crew
6.3 Client-facing quality report generated quarterly for QBU presentations
6.4 Sites below 3.5 average enter Performance Improvement Plan`,
      },
      {
        file_name: 'Safety Manual.pdf',
        doc_type: 'policy',
        department: 'ops',
        status: 'extracted',
        extracted_text: `WORKPLACE SAFETY MANUAL
Apex Service Group — 2025 Edition

1. SAFETY COMMITMENT
Apex Service Group is committed to providing a safe and healthy workplace. Every employee has the right to work in an environment free from recognized hazards and the responsibility to follow all safety procedures.

2. GENERAL SAFETY RULES
2.1 Report all injuries, illnesses, and near-misses immediately to your supervisor
2.2 Wear required PPE for all tasks (gloves, eye protection, slip-resistant shoes)
2.3 Never operate equipment you haven't been trained on
2.4 Keep work areas clean and free of trip hazards
2.5 Follow all chemical safety data sheets (SDS) — available at every site
2.6 No horseplay, running, or use of personal electronic devices while operating equipment

3. CHEMICAL SAFETY
3.1 Read product labels and SDS before using any chemical
3.2 Never mix chemicals unless specifically directed by the product label
3.3 Use proper dilution ratios — over-concentration is a hazard
3.4 Store chemicals in original containers, properly labeled, in locked storage
3.5 Report spills immediately — contain with appropriate absorbent material
3.6 Emergency eyewash stations and first aid kits located at every chemical storage area

4. SLIP, TRIP, AND FALL PREVENTION
4.1 Place wet floor signs immediately when mopping or when spills occur
4.2 Clean up spills promptly
4.3 Keep electrical cords and hoses out of walkways
4.4 Use proper footwear with slip-resistant soles
4.5 Use handrails on stairs, maintain three points of contact on ladders

5. EQUIPMENT SAFETY
5.1 Inspect equipment before each use — do not use damaged equipment
5.2 Follow manufacturer operating instructions
5.3 Unplug equipment before performing maintenance or clearing jams
5.4 Store equipment properly after each shift
5.5 Report equipment malfunctions to Site Supervisor immediately

6. ERGONOMICS
6.1 Use proper lifting technique: bend at knees, keep load close to body
6.2 Do not lift more than 50 lbs without assistance or mechanical aid
6.3 Rotate tasks to avoid repetitive motion injuries
6.4 Report early signs of discomfort to supervisor for task modification

7. EMERGENCY PROCEDURES
7.1 Know the location of all emergency exits, fire extinguishers, and first aid kits
7.2 In case of fire: RACE — Rescue, Alarm, Contain, Evacuate
7.3 In case of medical emergency: call 911, then notify Site Supervisor
7.4 Severe weather: move to designated shelter areas
7.5 Active threat: Run, Hide, Fight

8. INCIDENT REPORTING
8.1 Report all incidents within 1 hour to Site Supervisor
8.2 Complete incident report form in Alf Platform within 24 hours
8.3 Near-misses are reported the same as actual incidents
8.4 No retaliation for reporting safety concerns

9. SAFETY METRICS
- Total Recordable Incident Rate (TRIR) target: below 2.0
- Near-miss reporting rate: minimum 3 per site per month
- Safety training completion: 100% within 30 days of hire
- Good Saves recognition: tracked monthly per site`,
      },
      {
        file_name: 'Employee Handbook.pdf',
        doc_type: 'policy',
        department: 'hr',
        status: 'extracted',
        extracted_text: `EMPLOYEE HANDBOOK
Apex Service Group — 2025 Edition

1. WELCOME
Welcome to Apex Service Group. This handbook outlines our policies, benefits, and expectations. Apex is committed to a people-first culture where every team member is valued and supported.

2. EMPLOYMENT POLICIES
2.1 Equal Opportunity: Apex does not discriminate based on race, color, religion, sex, national origin, age, disability, or any other protected status.
2.2 At-Will Employment: Employment is at-will for both the employee and the company.
2.3 Background Checks: All positions require pre-employment background screening.
2.4 E-Verify: Apex participates in E-Verify for employment eligibility.

3. COMPENSATION
3.1 Pay Periods: Bi-weekly (every other Friday)
3.2 Direct Deposit: Available and encouraged
3.3 Overtime: Paid at 1.5x regular rate for hours over 40 per week
3.4 Shift Differentials: Night shift premium of $1.50/hour
3.5 Pay Rates: Cleaner $18-22/hr, Lead Cleaner $22-26/hr, Site Supervisor $26-30/hr, Area Manager $28-32/hr

4. BENEFITS
4.1 Health Insurance: Medical, dental, and vision after 60 days (full-time employees)
4.2 401(k): Company match up to 3% after 1 year of service
4.3 PTO: Accrued based on tenure — 40 hours (year 1), 80 hours (year 2-4), 120 hours (year 5+)
4.4 Holidays: 7 paid holidays per year
4.5 Employee Assistance Program: Free confidential counseling services

5. ATTENDANCE AND SCHEDULING
5.1 Schedules posted one week in advance
5.2 Use timekeeping system for all clock-in/clock-out — no buddy punching
5.3 Call-offs: Notify supervisor at least 2 hours before shift start
5.4 No-call/no-show: First offense = written warning, second = termination
5.5 Excessive absenteeism (3+ unexcused absences in 30 days) may result in termination

6. UNIFORMS AND APPEARANCE
6.1 Company-issued uniform shirt required at all times on shift
6.2 Closed-toe, slip-resistant shoes required
6.3 Name badge must be visible
6.4 Clean, professional appearance expected

7. TRAINING AND DEVELOPMENT
7.1 New Hire Orientation: 8 hours (safety, procedures, equipment, customer service)
7.2 Multilingual Training: Materials available in English and Spanish
7.3 Career Path: Cleaner → Lead Cleaner → Site Supervisor → Area Manager
7.4 Tuition Reimbursement: Up to $2,000/year for approved programs after 1 year

8. DISCIPLINE POLICY
Progressive discipline: verbal warning → written warning → final warning → termination
Immediate termination for: theft, violence, substance use on site, willful safety violations

9. SEPARATION
9.1 Voluntary: 2 weeks notice requested
9.2 Final paycheck: per state law
9.3 Return all company property (uniforms, badges, keys, equipment)
9.4 Exit interview offered to all departing employees`,
      },
    ],

    // ── Automation / Intelligence Seed Data ──────────────────
    automationInsights: {
      sopAnalyses: [
        {
          file_name: 'Nightly Cleaning SOP.pdf',
          department: 'ops',
          analysis: {
            summary: 'Comprehensive nightly cleaning procedure covering pre-shift prep, restroom cleaning, office areas, break rooms, common areas, and post-shift closeout across all Apex sites.',
            manual_steps: [
              { step_number: 1, description: 'Clock in and attend shift briefing with Lead Cleaner', frequency: 'daily', current_effort_minutes: 15, complexity: 'low' },
              { step_number: 2, description: 'Inspect cleaning cart and verify supply levels', frequency: 'daily', current_effort_minutes: 10, complexity: 'low' },
              { step_number: 3, description: 'Conduct safety walkaround and note hazards', frequency: 'daily', current_effort_minutes: 10, complexity: 'medium' },
              { step_number: 4, description: 'Clean and disinfect restroom fixtures per protocol', frequency: 'daily', current_effort_minutes: 45, complexity: 'medium' },
              { step_number: 5, description: 'Refill soap, paper towels, and tissue dispensers', frequency: 'daily', current_effort_minutes: 10, complexity: 'low' },
              { step_number: 6, description: 'Vacuum carpeted areas with HEPA-filtered equipment', frequency: 'daily', current_effort_minutes: 30, complexity: 'low' },
              { step_number: 7, description: 'Complete shift checklist in Alf Platform', frequency: 'daily', current_effort_minutes: 10, complexity: 'low' },
              { step_number: 8, description: 'Report building issues to Site Supervisor', frequency: 'as-needed', current_effort_minutes: 5, complexity: 'low' },
            ],
            automation_candidates: [
              { step_numbers: [2, 5], description: 'Auto-generate supply replenishment alerts when inventory drops below threshold', method: 'integration', suggested_tools: ['Alf Platform', 'Zapier'], effort_to_automate: 'low', impact: 'medium', priority: 'quick-win', estimated_time_saved_minutes_per_occurrence: 15 },
              { step_numbers: [7], description: 'Auto-populate shift checklist with area assignments and pre-fill completion timestamps', method: 'workflow-automation', suggested_tools: ['Alf Platform'], effort_to_automate: 'low', impact: 'medium', priority: 'quick-win', estimated_time_saved_minutes_per_occurrence: 8 },
              { step_numbers: [8], description: 'Photo-based issue reporting with auto-ticket creation and routing', method: 'ai-assist', suggested_tools: ['Alf Platform', 'Slack'], effort_to_automate: 'medium', impact: 'high', priority: 'medium-term', estimated_time_saved_minutes_per_occurrence: 10 },
            ],
            quick_wins: ['Automate supply level tracking and reorder alerts', 'Pre-populate shift checklists from assignment schedules'],
            long_term_items: ['AI-powered issue detection from inspection photos', 'Predictive supply ordering based on historical usage'],
            automation_score: 62,
            automation_readiness: 'medium',
          },
        },
        {
          file_name: 'Quality Inspection SOP.pdf',
          department: 'ops',
          analysis: {
            summary: 'Quality inspection framework covering weekly, monthly, and quarterly inspections with 1-5 scoring, corrective action workflows, and trend reporting.',
            manual_steps: [
              { step_number: 1, description: 'Conduct walkthrough inspection of all building areas', frequency: 'weekly', current_effort_minutes: 60, complexity: 'medium' },
              { step_number: 2, description: 'Score each area on 1-5 scale using mobile inspection form', frequency: 'weekly', current_effort_minutes: 20, complexity: 'medium' },
              { step_number: 3, description: 'Photograph deficiencies scoring 2 or below', frequency: 'weekly', current_effort_minutes: 10, complexity: 'low' },
              { step_number: 4, description: 'Review findings with Site Supervisor on-site', frequency: 'weekly', current_effort_minutes: 15, complexity: 'medium' },
              { step_number: 5, description: 'Generate corrective action tickets from inspection results', frequency: 'weekly', current_effort_minutes: 15, complexity: 'low' },
              { step_number: 6, description: 'Verify corrections and close tickets with photo evidence', frequency: 'weekly', current_effort_minutes: 20, complexity: 'medium' },
              { step_number: 7, description: 'Compile monthly quality score dashboard', frequency: 'monthly', current_effort_minutes: 45, complexity: 'medium' },
              { step_number: 8, description: 'Generate client-facing quality report for QBU presentations', frequency: 'quarterly', current_effort_minutes: 120, complexity: 'high' },
            ],
            automation_candidates: [
              { step_numbers: [5], description: 'Auto-generate corrective action tickets from inspection scores below threshold', method: 'workflow-automation', suggested_tools: ['Alf Platform'], effort_to_automate: 'low', impact: 'high', priority: 'quick-win', estimated_time_saved_minutes_per_occurrence: 15 },
              { step_numbers: [7], description: 'Real-time quality score dashboard with automatic trend analysis', method: 'integration', suggested_tools: ['Alf Platform'], effort_to_automate: 'low', impact: 'high', priority: 'quick-win', estimated_time_saved_minutes_per_occurrence: 40 },
              { step_numbers: [8], description: 'AI-generated client quality reports pulling from inspection data and trends', method: 'ai-assist', suggested_tools: ['Alf Platform', 'Claude'], effort_to_automate: 'medium', impact: 'high', priority: 'medium-term', estimated_time_saved_minutes_per_occurrence: 90 },
              { step_numbers: [3, 6], description: 'Photo comparison AI to verify corrections match expected standards', method: 'ai-assist', suggested_tools: ['Custom AI Model'], effort_to_automate: 'high', impact: 'medium', priority: 'long-term', estimated_time_saved_minutes_per_occurrence: 20 },
            ],
            quick_wins: ['Auto-generate corrective action tickets from low scores', 'Real-time quality dashboards replacing manual compilation'],
            long_term_items: ['AI-powered photo comparison for correction verification', 'Predictive quality scoring based on crew patterns'],
            automation_score: 72,
            automation_readiness: 'high',
          },
        },
        {
          file_name: 'Safety Manual.pdf',
          department: 'ops',
          analysis: {
            summary: 'Comprehensive workplace safety manual covering chemical safety, slip/trip/fall prevention, equipment safety, ergonomics, emergency procedures, and incident reporting.',
            manual_steps: [
              { step_number: 1, description: 'Conduct new-hire safety orientation (8 hours)', frequency: 'as-needed', current_effort_minutes: 480, complexity: 'high' },
              { step_number: 2, description: 'Track safety training completion for all employees', frequency: 'monthly', current_effort_minutes: 30, complexity: 'medium' },
              { step_number: 3, description: 'Process incident reports within 24 hours', frequency: 'as-needed', current_effort_minutes: 30, complexity: 'medium' },
              { step_number: 4, description: 'Monitor TRIR and near-miss reporting rates', frequency: 'monthly', current_effort_minutes: 20, complexity: 'medium' },
              { step_number: 5, description: 'Conduct SDS review and chemical inventory checks', frequency: 'quarterly', current_effort_minutes: 60, complexity: 'medium' },
              { step_number: 6, description: 'Emergency drill coordination and documentation', frequency: 'quarterly', current_effort_minutes: 90, complexity: 'high' },
            ],
            automation_candidates: [
              { step_numbers: [2], description: 'Automated training compliance tracking with deadline alerts', method: 'workflow-automation', suggested_tools: ['Alf Platform', 'Email'], effort_to_automate: 'low', impact: 'high', priority: 'quick-win', estimated_time_saved_minutes_per_occurrence: 25 },
              { step_numbers: [3], description: 'Digital incident reporting with auto-routing to appropriate manager and OSHA tracking', method: 'workflow-automation', suggested_tools: ['Alf Platform', 'Zapier'], effort_to_automate: 'medium', impact: 'high', priority: 'medium-term', estimated_time_saved_minutes_per_occurrence: 20 },
              { step_numbers: [4], description: 'Real-time safety KPI dashboard with automatic TRIR calculation', method: 'integration', suggested_tools: ['Alf Platform'], effort_to_automate: 'low', impact: 'medium', priority: 'quick-win', estimated_time_saved_minutes_per_occurrence: 18 },
            ],
            quick_wins: ['Automated training deadline reminders', 'Real-time TRIR dashboard'],
            long_term_items: ['Predictive safety risk scoring by site', 'AI-analyzed incident report trend detection'],
            automation_score: 55,
            automation_readiness: 'medium',
          },
        },
        {
          file_name: 'Employee Handbook.pdf',
          department: 'hr',
          analysis: {
            summary: 'Employee handbook covering employment policies, compensation, benefits, attendance, uniforms, training, discipline, and separation procedures.',
            manual_steps: [
              { step_number: 1, description: 'Process new hire paperwork and onboarding checklist', frequency: 'as-needed', current_effort_minutes: 45, complexity: 'medium' },
              { step_number: 2, description: 'Track PTO accrual and balance for each employee', frequency: 'weekly', current_effort_minutes: 20, complexity: 'medium' },
              { step_number: 3, description: 'Process attendance violations and progressive discipline', frequency: 'weekly', current_effort_minutes: 15, complexity: 'medium' },
              { step_number: 4, description: 'Manage uniform distribution and tracking', frequency: 'as-needed', current_effort_minutes: 10, complexity: 'low' },
              { step_number: 5, description: 'Schedule and track training program completion', frequency: 'monthly', current_effort_minutes: 30, complexity: 'medium' },
              { step_number: 6, description: 'Process separation checklist and property return', frequency: 'as-needed', current_effort_minutes: 30, complexity: 'medium' },
            ],
            automation_candidates: [
              { step_numbers: [1], description: 'Digital onboarding workflow with auto-generated checklists and document collection', method: 'workflow-automation', suggested_tools: ['Alf Platform', 'DocuSign'], effort_to_automate: 'medium', impact: 'high', priority: 'medium-term', estimated_time_saved_minutes_per_occurrence: 30 },
              { step_numbers: [2], description: 'Automated PTO tracking integrated with timekeeping system', method: 'integration', suggested_tools: ['Alf Platform'], effort_to_automate: 'low', impact: 'medium', priority: 'quick-win', estimated_time_saved_minutes_per_occurrence: 18 },
              { step_numbers: [3], description: 'Automatic attendance violation flagging from timekeeping data with progressive discipline tracking', method: 'workflow-automation', suggested_tools: ['Alf Platform', 'Email'], effort_to_automate: 'medium', impact: 'high', priority: 'medium-term', estimated_time_saved_minutes_per_occurrence: 12 },
            ],
            quick_wins: ['Automated PTO tracking from timekeeping data', 'Digital uniform tracking checklist'],
            long_term_items: ['Full digital onboarding with e-signatures', 'Predictive turnover risk analysis'],
            automation_score: 58,
            automation_readiness: 'medium',
          },
        },
      ],

      roadmaps: [
        {
          department: 'ops',
          roadmap: {
            department: 'Operations',
            summary: 'Operations has significant automation potential across quality inspections, shift management, and safety compliance. Quick wins focus on automated ticket creation and real-time dashboards.',
            phases: [
              {
                phase: 'quick-wins',
                timeline: '0-30 days',
                items: [
                  { description: 'Auto-generate corrective action tickets from inspection scores below 3', source_sop: 'Quality Inspection SOP.pdf', effort: 'low', impact: 'high', estimated_time_saved: '4 hours/month' },
                  { description: 'Real-time quality score dashboard replacing manual monthly compilation', source_sop: 'Quality Inspection SOP.pdf', effort: 'low', impact: 'high', estimated_time_saved: '3 hours/month' },
                  { description: 'Automated supply replenishment alerts based on inventory thresholds', source_sop: 'Nightly Cleaning SOP.pdf', effort: 'low', impact: 'medium', estimated_time_saved: '2 hours/month' },
                  { description: 'Safety training compliance tracker with automated deadline reminders', source_sop: 'Safety Manual.pdf', effort: 'low', impact: 'high', estimated_time_saved: '2 hours/month' },
                ],
              },
              {
                phase: 'medium-term',
                timeline: '1-3 months',
                items: [
                  { description: 'AI-generated client quality reports for QBU presentations', source_sop: 'Quality Inspection SOP.pdf', effort: 'medium', impact: 'high', estimated_time_saved: '8 hours/quarter' },
                  { description: 'Photo-based issue reporting with auto-classification and ticket routing', source_sop: 'Nightly Cleaning SOP.pdf', effort: 'medium', impact: 'high', estimated_time_saved: '3 hours/month' },
                  { description: 'Digital incident reporting with OSHA-compliant auto-routing', source_sop: 'Safety Manual.pdf', effort: 'medium', impact: 'high', estimated_time_saved: '2 hours/month' },
                ],
              },
              {
                phase: 'long-term',
                timeline: '3-6 months',
                items: [
                  { description: 'AI-powered photo comparison for quality correction verification', source_sop: 'Quality Inspection SOP.pdf', effort: 'high', impact: 'medium', estimated_time_saved: '2 hours/month' },
                  { description: 'Predictive supply ordering based on historical usage patterns', source_sop: 'Nightly Cleaning SOP.pdf', effort: 'high', impact: 'medium', estimated_time_saved: '3 hours/month' },
                ],
              },
            ],
            total_monthly_time_saved_hours: 18,
            recommended_first_action: 'Enable auto-generation of corrective action tickets from quality inspection scores — zero cost, immediate impact on supervisor time.',
          },
        },
        {
          department: 'hr',
          roadmap: {
            department: 'Human Resources',
            summary: 'HR processes have moderate automation potential focused on onboarding, attendance tracking, and training management. Quick wins center on PTO automation and digital checklists.',
            phases: [
              {
                phase: 'quick-wins',
                timeline: '0-30 days',
                items: [
                  { description: 'Automated PTO balance tracking integrated with timekeeping system', source_sop: 'Employee Handbook.pdf', effort: 'low', impact: 'medium', estimated_time_saved: '2 hours/month' },
                  { description: 'Digital uniform tracking checklist replacing paper log', source_sop: 'Employee Handbook.pdf', effort: 'low', impact: 'low', estimated_time_saved: '1 hour/month' },
                ],
              },
              {
                phase: 'medium-term',
                timeline: '1-3 months',
                items: [
                  { description: 'Full digital onboarding workflow with auto-generated checklists and e-signatures', source_sop: 'Employee Handbook.pdf', effort: 'medium', impact: 'high', estimated_time_saved: '5 hours/month' },
                  { description: 'Automatic attendance violation flagging with progressive discipline tracking', source_sop: 'Employee Handbook.pdf', effort: 'medium', impact: 'high', estimated_time_saved: '3 hours/month' },
                ],
              },
              {
                phase: 'long-term',
                timeline: '3-6 months',
                items: [
                  { description: 'Predictive turnover risk analysis based on attendance, tenure, and engagement data', source_sop: 'Employee Handbook.pdf', effort: 'high', impact: 'high', estimated_time_saved: '4 hours/month' },
                ],
              },
            ],
            total_monthly_time_saved_hours: 11,
            recommended_first_action: 'Connect PTO tracking to existing timekeeping data — employees already clock in/out, just need to pull accrual calculations.',
          },
        },
      ],

      // Automation actions derived from roadmap items
      // status: active (skill deployed), ready_for_review, planned, manual
      automationActions: [
        // ── Active (skill deployed to agent) ──
        {
          department: 'ops',
          phase: 'quick-win',
          title: 'Auto-generate corrective action tickets from low inspection scores',
          description: 'When a quality inspection area scores 2 or below, automatically create a corrective action work ticket assigned to the Site Supervisor with a 24-hour deadline.',
          source_sop: 'Quality Inspection SOP.pdf',
          assignee_type: 'agent',
          status: 'active',
          agent_key: 'operations',
          agent_skill_prompt: 'When a quality inspection is submitted with any area scoring 2 or below, generate a corrective action ticket with: the area name, score, inspector notes, site location, and a 24-hour resolution deadline. Assign to the Site Supervisor. Include photo references if available.',
          effort: 'low',
          impact: 'high',
          estimated_time_saved: '4 hours/month',
        },
        {
          department: 'ops',
          phase: 'quick-win',
          title: 'Safety training compliance tracker with automated alerts',
          description: 'Track safety training completion for all employees and send automated reminders when training is overdue or approaching deadline.',
          source_sop: 'Safety Manual.pdf',
          assignee_type: 'agent',
          status: 'active',
          agent_key: 'safety',
          agent_skill_prompt: 'Monitor safety training records for all employees. Flag any employee who has not completed required safety training within 30 days of hire. Send weekly summary of overdue trainings to Site Supervisors and monthly compliance report to Safety Director.',
          effort: 'low',
          impact: 'high',
          estimated_time_saved: '2 hours/month',
        },
        {
          department: 'ops',
          phase: 'quick-win',
          title: 'Supply replenishment alerts from inventory thresholds',
          description: 'Monitor supply levels across sites and generate reorder alerts when inventory drops below configured thresholds.',
          source_sop: 'Nightly Cleaning SOP.pdf',
          assignee_type: 'agent',
          status: 'active',
          agent_key: 'purchasing',
          agent_skill_prompt: 'Track cleaning supply inventory levels across all sites. When any supply drops below the minimum threshold (configurable per item), generate a replenishment alert to the Purchasing department with: item name, current quantity, reorder quantity, preferred vendor, and estimated delivery time.',
          effort: 'low',
          impact: 'medium',
          estimated_time_saved: '2 hours/month',
        },
        // ── Ready for review (skill generated, awaiting activation) ──
        {
          department: 'ops',
          phase: 'quick-win',
          title: 'Real-time quality score dashboard',
          description: 'Automatically compile quality inspection scores into a real-time dashboard with trend analysis, replacing manual monthly report generation.',
          source_sop: 'Quality Inspection SOP.pdf',
          assignee_type: 'agent',
          status: 'ready_for_review',
          agent_key: 'operations',
          agent_skill_prompt: 'Compile all quality inspection scores into a department-level dashboard. Calculate average scores by site, area type, and inspector. Highlight trends (improving/declining) over the past 90 days. Flag any site with average below 3.5 for Performance Improvement Plan consideration.',
          effort: 'low',
          impact: 'high',
          estimated_time_saved: '3 hours/month',
        },
        {
          department: 'hr',
          phase: 'quick-win',
          title: 'Automated PTO balance tracking',
          description: 'Calculate and track PTO accrual balances automatically from timekeeping data, replacing manual spreadsheet tracking.',
          source_sop: 'Employee Handbook.pdf',
          assignee_type: 'agent',
          status: 'ready_for_review',
          agent_key: 'hr',
          agent_skill_prompt: 'Calculate PTO accrual for each employee based on their tenure: 40 hours for year 1, 80 hours for years 2-4, 120 hours for year 5+. Track usage from timekeeping records. Provide current balances and alert HR when employees are approaching their cap or have not used PTO in 90+ days.',
          effort: 'low',
          impact: 'medium',
          estimated_time_saved: '2 hours/month',
        },
        // ── Planned (identified, not yet built) ──
        {
          department: 'ops',
          phase: 'medium-term',
          title: 'AI-generated client quality reports for QBU presentations',
          description: 'Use AI to draft quarterly quality reports for clients based on inspection data, trends, and corrective actions taken.',
          source_sop: 'Quality Inspection SOP.pdf',
          assignee_type: 'agent',
          status: 'planned',
          agent_key: 'operations',
          effort: 'medium',
          impact: 'high',
          estimated_time_saved: '8 hours/quarter',
        },
        {
          department: 'ops',
          phase: 'medium-term',
          title: 'Photo-based issue reporting with auto-classification',
          description: 'Allow cleaners to submit photo-based issue reports that are automatically classified and routed as work tickets.',
          source_sop: 'Nightly Cleaning SOP.pdf',
          assignee_type: 'agent',
          status: 'planned',
          agent_key: 'operations',
          effort: 'medium',
          impact: 'high',
          estimated_time_saved: '3 hours/month',
        },
        {
          department: 'hr',
          phase: 'medium-term',
          title: 'Digital onboarding workflow with auto-generated checklists',
          description: 'Full digital new hire onboarding with automated document collection, checklist generation, and training scheduling.',
          source_sop: 'Employee Handbook.pdf',
          assignee_type: 'agent',
          status: 'planned',
          agent_key: 'hr',
          effort: 'medium',
          impact: 'high',
          estimated_time_saved: '5 hours/month',
        },
        {
          department: 'ops',
          phase: 'medium-term',
          title: 'Digital incident reporting with OSHA auto-routing',
          description: 'Digitize incident reporting with automatic routing to appropriate managers and OSHA compliance tracking.',
          source_sop: 'Safety Manual.pdf',
          assignee_type: 'agent',
          status: 'planned',
          agent_key: 'safety',
          effort: 'medium',
          impact: 'high',
          estimated_time_saved: '2 hours/month',
        },
        // ── Manual (requires human, no automation) ──
        {
          department: 'ops',
          phase: 'long-term',
          title: 'In-person quality review with client participation',
          description: 'Quarterly deep-dive inspections requiring Operations Director and client representative physical walkthrough.',
          source_sop: 'Quality Inspection SOP.pdf',
          assignee_type: 'human',
          status: 'manual',
          effort: 'high',
          impact: 'high',
        },
        {
          department: 'ops',
          phase: 'long-term',
          title: 'Emergency drill coordination',
          description: 'Quarterly emergency drills requiring physical presence, coordination with building management, and hands-on training.',
          source_sop: 'Safety Manual.pdf',
          assignee_type: 'human',
          status: 'manual',
          effort: 'high',
          impact: 'high',
        },
      ],

      // Action plan items (from Command Center "Generate Action Plan" feature)
      actionPlanItems: [
        {
          department: 'ops',
          title: 'Address overtime spike at Gateway Logistics Hub',
          description: 'Gateway Logistics Hub overtime has increased 34% month-over-month. Review staffing levels against contract scope and adjust crew assignments to reduce unauthorized overtime.',
          priority: 'critical',
          status: 'open',
          site_name: 'Gateway Logistics Hub',
          metric_snapshot: { overtime_pct: 0.18, overtime_change: 0.34, avg_overtime_pct: 0.09, suggested_owner_role: 'Area Manager' },
        },
        {
          department: 'ops',
          title: 'Investigate quality score decline at Northfield University',
          description: 'Northfield University quality scores have dropped from 4.2 to 3.4 over the past 60 days. Schedule a deep inspection and review crew assignments for potential training gaps.',
          priority: 'critical',
          status: 'in_progress',
          site_name: 'Northfield University',
          metric_snapshot: { quality_score: 3.4, previous_score: 4.2, trend: 'declining', suggested_owner_role: 'Operations Director' },
        },
        {
          department: 'ops',
          title: 'Reduce open work ticket backlog at Midtown Financial Tower',
          description: 'Midtown Financial Tower has 23 open work tickets, 40% above the portfolio average. Prioritize critical tickets and assign additional resources for catch-up.',
          priority: 'high',
          status: 'open',
          site_name: 'Midtown Financial Tower',
          metric_snapshot: { open_tickets: 23, avg_open_tickets: 14, pct_above_avg: 0.40, suggested_owner_role: 'Site Supervisor' },
        },
        {
          department: 'hr',
          title: 'Address elevated turnover at Summit Ridge Mall',
          description: 'Summit Ridge Mall turnover rate is 28% annualized vs company average of 18%. Conduct stay interviews with tenured staff and review compensation competitiveness for this market.',
          priority: 'high',
          status: 'open',
          site_name: 'Summit Ridge Mall',
          metric_snapshot: { turnover_rate: 0.28, company_avg: 0.18, headcount: 12, suggested_owner_role: 'HR Manager' },
        },
        {
          department: 'ops',
          title: 'Optimize labor coverage at Crestwood Civic Center',
          description: 'Crestwood Civic Center shows 92% labor utilization but client satisfaction is at 87%. Consider adjusting shift overlap to improve coverage during peak evening hours.',
          priority: 'medium',
          status: 'completed',
          site_name: 'Crestwood Civic Center',
          metric_snapshot: { labor_utilization: 0.92, client_satisfaction: 0.87, suggested_owner_role: 'Area Manager' },
        },
        {
          department: 'finance',
          title: 'Review supply cost variance at Harbor Industrial Complex',
          description: 'Supply costs at Harbor Industrial Complex are 12% above budget. Audit recent purchase orders and verify chemical dilution ratios are being followed to prevent waste.',
          priority: 'medium',
          status: 'open',
          site_name: 'Harbor Industrial Complex',
          metric_snapshot: { supply_cost_variance: 0.12, monthly_supply_cost: 4200, budget: 3750, suggested_owner_role: 'Purchasing Manager' },
        },
      ],

      // Automation execution preferences
      automationPreferences: [
        {
          agent_key: 'operations',
          action_key: 'corrective_action_tickets',
          integration_type: 'internal_workflow',
          execution_mode: 'automated',
          risk_level: 'low',
          alf_recommended_mode: 'automated',
          total_executions: 47,
          total_approved_without_edit: 42,
          auto_promote_eligible: false,
          auto_promote_threshold: 10,
          last_executed_at: '2026-02-27T14:30:00Z',
        },
        {
          agent_key: 'safety',
          action_key: 'training_compliance_alerts',
          integration_type: 'internal_workflow',
          execution_mode: 'review',
          risk_level: 'medium',
          alf_recommended_mode: 'automated',
          total_executions: 23,
          total_approved_without_edit: 19,
          auto_promote_eligible: true,
          auto_promote_threshold: 10,
          last_executed_at: '2026-02-26T09:15:00Z',
        },
        {
          agent_key: 'purchasing',
          action_key: 'supply_replenishment_alerts',
          integration_type: 'internal_workflow',
          execution_mode: 'review',
          risk_level: 'low',
          alf_recommended_mode: 'automated',
          total_executions: 15,
          total_approved_without_edit: 12,
          auto_promote_eligible: true,
          auto_promote_threshold: 10,
          last_executed_at: '2026-02-28T11:45:00Z',
        },
        {
          agent_key: 'hr',
          action_key: 'pto_balance_tracking',
          integration_type: 'internal_workflow',
          execution_mode: 'draft',
          risk_level: 'low',
          alf_recommended_mode: 'review',
          total_executions: 3,
          total_approved_without_edit: 2,
          auto_promote_eligible: false,
          auto_promote_threshold: 10,
          last_executed_at: '2026-02-25T16:00:00Z',
        },
      ],
    },
  },

  // ─── ORBIT TIER: Ridgeline Property Services ────────────
  {
    slug: 'ridgeline-demo',
    company_name: 'Ridgeline Property Services',
    plan: 'orbit',
    brand_primary_color: '#2563EB',
    brand_sidebar_bg: '#1E293B',
    brand_display_name: 'Ridgeline',
    employeesPerSite: 5,
    totalTickets: 2000,
    totalTimekeeping: 8000,
    sites: [
      'Alpine Business Center',
      'Red Rock Office Park',
      'Canyon View Medical Plaza',
      'Silver Creek Retail Center',
      'Mesa Heights Campus',
      'Pineridge Towers',
    ],
    users: [
      { email: 'user@ridgeline-demo.alf.dev', role: 'user', name: 'Demo User', modules: ['dashboards'] },
      { email: 'manager@ridgeline-demo.alf.dev', role: 'user', name: 'Demo Manager', modules: ['dashboards', 'analytics', 'tools', 'actionPlans'] },
      { email: 'admin@ridgeline-demo.alf.dev', role: 'admin', name: 'Demo Admin', modules: [] },
    ],
    companyProfile: {
      industry: 'Facility Services',
      sub_vertical: 'Property Maintenance',
      company_description: 'Ridgeline Property Services provides comprehensive property maintenance and janitorial services across the Mountain West region. Focused on medical, office, and retail environments with a 98% client retention rate.',
      founded_year: 2011,
      employee_count: '250-500',
      headquarters: 'Denver, CO',
      ownership_model: 'Private',
      geographic_coverage: ['Colorado', 'Utah', 'Wyoming'],
      certifications: ['ISSA Member', 'GBAC Star'],
      departments: [
        { key: 'operations', name: 'Operations', description: 'Service delivery and quality assurance', icon: 'clipboard-list' },
        { key: 'hr', name: 'Human Resources', description: 'Staffing, training, and employee support', icon: 'users' },
        { key: 'safety', name: 'Safety', description: 'Safety programs and incident management', icon: 'shield-check' },
      ],
      service_catalog: [
        { category: 'Janitorial', services: ['Nightly Cleaning', 'Day Porter', 'Floor Care', 'Window Cleaning'] },
        { category: 'Property Maintenance', services: ['HVAC Filter Changes', 'Light Bulb Replacement', 'Minor Repairs', 'Parking Lot Maintenance'] },
      ],
      differentiators: [
        { key: 'retention', label: '98% Client Retention', description: 'Industry-leading retention driven by consistent quality and responsive account management.' },
        { key: 'medical_expertise', label: 'Medical Facility Expertise', description: 'GBAC Star certified with specialized protocols for healthcare environments.' },
      ],
      key_leadership: [
        { name: 'Rachel Torres', title: 'CEO & Founder' },
        { name: 'Kyle Andersen', title: 'Director of Operations' },
      ],
      technology_platforms: [
        { name: 'Alf Platform', description: 'Operations intelligence dashboards and analytics.' },
      ],
      profile_status: 'confirmed',
      onboarding_checklist: {
        profile_confirmed: true,
        documents_uploaded: true,
        data_source_connected: true,
        portal_generated: true,
      },
    },
    knowledgeDocs: [
      {
        file_name: 'Nightly Cleaning SOP.pdf',
        doc_type: 'sop',
        department: 'ops',
        status: 'extracted',
        extracted_text: `NIGHTLY CLEANING STANDARD OPERATING PROCEDURE
Ridgeline Property Services — Effective March 2025

1. SCOPE
This SOP covers all nightly cleaning operations across Ridgeline accounts including office, medical, and retail environments.

2. PRE-SHIFT
2.1 Arrive 15 minutes before shift, clock in via timekeeping system
2.2 Review assignment board for special instructions and client notes
2.3 Check cleaning cart supplies — restock as needed from supply room
2.4 Conduct quick safety scan of assigned areas

3. RESTROOMS
3.1 Post wet floor signs at entrance
3.2 Don PPE (gloves, eye protection)
3.3 Empty trash, replace liners
3.4 Clean and disinfect all fixtures (toilets, urinals, sinks, counters)
3.5 Clean mirrors with glass cleaner
3.6 Refill dispensers (soap, paper towels, tissue)
3.7 Mop floors with hospital-grade disinfectant
3.8 Log restroom completion on shift checklist

4. OFFICE AREAS
4.1 Empty all trash and recycling bins
4.2 Dust surfaces — desks, ledges, windowsills
4.3 Wipe high-touch points (handles, switches, shared equipment)
4.4 Vacuum carpets with HEPA equipment
4.5 Dust mop or damp mop hard floors

5. MEDICAL AREAS (Canyon View, Silver Creek)
5.1 Follow enhanced disinfection protocol for patient areas
5.2 Use EPA-registered hospital disinfectant with appropriate dwell time
5.3 Clean waiting areas, exam rooms (after hours), and hallways
5.4 Sharps containers: do NOT handle — report if full

6. BREAK ROOMS AND COMMON AREAS
6.1 Clean and sanitize all surfaces
6.2 Empty trash, clean sinks
6.3 Wipe appliance exteriors
6.4 Vacuum or mop floors

7. POST-SHIFT
7.1 Return equipment, lock supply room
7.2 Complete digital shift checklist
7.3 Report issues to Lead Cleaner
7.4 Clock out`,
      },
      {
        file_name: 'Quality Inspection SOP.pdf',
        doc_type: 'sop',
        department: 'ops',
        status: 'extracted',
        extracted_text: `QUALITY INSPECTION STANDARD OPERATING PROCEDURE
Ridgeline Property Services — Effective March 2025

1. PURPOSE
Define a consistent quality inspection process to maintain service standards and client satisfaction.

2. FREQUENCY
2.1 Lead Cleaner: Nightly spot checks on 2-3 areas
2.2 Site Supervisor: Weekly formal walkthrough
2.3 Operations Director: Monthly scored inspection

3. SCORING (1-5 Scale)
5 = Exceeds expectations
4 = Meets standard
3 = Minor issue — correct within 24 hours
2 = Major issue — correct immediately, document
1 = Critical failure — escalate to management

4. INSPECTION AREAS
4.1 Restrooms — cleanliness, supplies, odor, fixtures
4.2 Office Spaces — dust, carpet, trash, surfaces
4.3 Common Areas — lobbies, elevators, glass
4.4 Medical Areas — disinfection compliance, waste handling
4.5 Exterior — entrances, mats, signage

5. PROCESS
5.1 Use mobile inspection form in Alf Platform
5.2 Photo-document any score of 2 or below
5.3 Discuss findings with on-site crew
5.4 Submit — system creates corrective action tickets automatically

6. FOLLOW-UP
6.1 Corrective actions due within 24 hours
6.2 Supervisor verifies and closes with evidence
6.3 Repeat deficiencies trigger retraining

7. REPORTING
7.1 Quality dashboard in Alf Platform updated real-time
7.2 Monthly trend report by site
7.3 Client-facing report included in quarterly reviews`,
      },
      {
        file_name: 'Safety Manual.pdf',
        doc_type: 'policy',
        department: 'ops',
        status: 'extracted',
        extracted_text: `WORKPLACE SAFETY MANUAL
Ridgeline Property Services — 2025 Edition

1. COMMITMENT
Ridgeline is committed to a zero-incident workplace. Safety is everyone's responsibility.

2. GENERAL RULES
2.1 Report all injuries and near-misses immediately
2.2 Wear required PPE at all times
2.3 Follow chemical safety data sheets (SDS)
2.4 Keep work areas organized and hazard-free
2.5 Never operate equipment without training

3. CHEMICAL SAFETY
3.1 Read labels and SDS before use
3.2 Never mix chemicals
3.3 Follow dilution ratios exactly
3.4 Store in original labeled containers in locked areas
3.5 Report spills immediately

4. SLIP/TRIP/FALL PREVENTION
4.1 Wet floor signs required during and after mopping
4.2 Clean spills immediately
4.3 Keep cords out of walkways
4.4 Wear slip-resistant footwear

5. EQUIPMENT SAFETY
5.1 Inspect before each use
5.2 Follow manufacturer guidelines
5.3 Unplug before maintenance
5.4 Report malfunctions immediately

6. EMERGENCIES
6.1 Know exit locations and rally points
6.2 Fire: Rescue, Alarm, Contain, Evacuate
6.3 Medical: Call 911, notify supervisor
6.4 Severe weather: move to interior rooms

7. REPORTING
7.1 All incidents reported within 1 hour
7.2 Incident form completed in Alf Platform within 24 hours
7.3 No retaliation for reporting

8. TARGETS
- TRIR below 2.5
- 100% new-hire safety training within first week`,
      },
    ],

    // ── Automation / Intelligence Seed Data (Orbit — action plans only) ──
    automationInsights: {
      sopAnalyses: [],
      roadmaps: [],
      automationActions: [],
      actionPlanItems: [
        {
          department: 'ops',
          title: 'Reduce ticket resolution time at Alpine Business Center',
          description: 'Alpine Business Center average ticket resolution is 3.2 days vs portfolio target of 2 days. Review assignment workflow and consider adding a day porter shift.',
          priority: 'high',
          status: 'open',
          site_name: 'Alpine Business Center',
          metric_snapshot: { avg_resolution_days: 3.2, target_days: 2.0, open_tickets: 11, suggested_owner_role: 'Site Supervisor' },
        },
        {
          department: 'ops',
          title: 'Address quality dip at Canyon View Medical Plaza',
          description: 'Canyon View Medical Plaza quality scores dropped to 3.6 from 4.1. Medical facility cleaning requires enhanced disinfection protocol adherence — schedule refresher training.',
          priority: 'high',
          status: 'in_progress',
          site_name: 'Canyon View Medical Plaza',
          metric_snapshot: { quality_score: 3.6, previous_score: 4.1, trend: 'declining', suggested_owner_role: 'Operations Director' },
        },
        {
          department: 'hr',
          title: 'Stabilize staffing at Silver Creek Retail Center',
          description: 'Silver Creek has had 3 call-offs in the past 2 weeks. Review scheduling and consider cross-training Mesa Heights employees as backup coverage.',
          priority: 'medium',
          status: 'open',
          site_name: 'Silver Creek Retail Center',
          metric_snapshot: { calloffs_2_weeks: 3, avg_calloffs: 1, headcount: 8, suggested_owner_role: 'HR Coordinator' },
        },
      ],
      automationPreferences: [],
    },
  },

  // ─── MELMAC TIER: Clearpoint Maintenance ─────────────────
  {
    slug: 'clearpoint-demo',
    company_name: 'Clearpoint Maintenance',
    plan: 'melmac',
    brand_primary_color: '#9333EA',
    brand_sidebar_bg: '#1E1B2E',
    brand_display_name: 'Clearpoint',
    employeesPerSite: 4,
    totalTickets: 800,
    totalTimekeeping: 3000,
    sites: [
      'Peachtree Business Park',
      'Buckhead Office Suites',
      'Midtown Commerce Center',
    ],
    users: [
      { email: 'user@clearpoint-demo.alf.dev', role: 'user', name: 'Demo User', modules: ['dashboards'] },
      { email: 'manager@clearpoint-demo.alf.dev', role: 'user', name: 'Demo Manager', modules: ['dashboards', 'analytics'] },
    ],
    companyProfile: {
      industry: 'Facility Services',
      sub_vertical: 'Commercial Cleaning',
      company_description: 'Clearpoint Maintenance is a growing commercial cleaning company serving office and business park clients in the Atlanta metro area. Known for reliability and attention to detail.',
      founded_year: 2019,
      employee_count: '50-100',
      headquarters: 'Atlanta, GA',
      ownership_model: 'Private',
      geographic_coverage: ['Georgia'],
      certifications: ['ISSA Member'],
      departments: [
        { key: 'operations', name: 'Operations', description: 'Cleaning operations and client service', icon: 'clipboard-list' },
        { key: 'hr', name: 'Human Resources', description: 'Staffing and employee management', icon: 'users' },
        { key: 'safety', name: 'Safety', description: 'Workplace safety', icon: 'shield-check' },
      ],
      service_catalog: [
        { category: 'Janitorial', services: ['Nightly Cleaning', 'Day Porter', 'Floor Care'] },
      ],
      differentiators: [
        { key: 'reliability', label: 'Reliability', description: 'Consistent, dependable service with 99% schedule adherence.' },
      ],
      key_leadership: [
        { name: 'Angela Patterson', title: 'Owner & President' },
      ],
      technology_platforms: [
        { name: 'Alf Platform', description: 'Operations dashboards and analytics.' },
      ],
      profile_status: 'confirmed',
      onboarding_checklist: {
        profile_confirmed: true,
        data_source_connected: true,
        portal_generated: true,
      },
    },
    // Melmac tier doesn't include knowledge module — no docs
    knowledgeDocs: [],
    // Melmac tier doesn't include automation features
    automationInsights: null,
  },
];
