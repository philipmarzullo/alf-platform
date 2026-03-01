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
  },
];
