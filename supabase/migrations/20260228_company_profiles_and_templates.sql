-- Phase 1: Company Profile System
-- Creates tenant_company_profiles and industry_templates tables,
-- seeds A&A (confirmed) + Meridian/Summit/Greenfield (draft) profiles,
-- and seeds one industry template.

-- ═══════════════════════════════════════════════════════
-- 1. tenant_company_profiles
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenant_company_profiles (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES alf_tenants(id) ON DELETE CASCADE,
  industry        text,
  sub_vertical    text,
  company_description text,
  founded_year    integer,
  employee_count  text,
  headquarters    text,
  ownership_model text,
  geographic_coverage jsonb DEFAULT '[]'::jsonb,
  certifications  jsonb DEFAULT '[]'::jsonb,
  departments     jsonb DEFAULT '[]'::jsonb,
  service_catalog jsonb DEFAULT '[]'::jsonb,
  differentiators jsonb DEFAULT '[]'::jsonb,
  key_clients     jsonb DEFAULT '[]'::jsonb,
  union_partnerships jsonb DEFAULT '[]'::jsonb,
  technology_platforms jsonb DEFAULT '[]'::jsonb,
  training_programs jsonb DEFAULT '[]'::jsonb,
  key_leadership  jsonb DEFAULT '[]'::jsonb,
  profile_status  text DEFAULT 'draft' CHECK (profile_status IN ('draft', 'confirmed', 'enriched')),
  onboarding_checklist jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  CONSTRAINT tenant_company_profiles_tenant_unique UNIQUE (tenant_id)
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_tenant_company_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tenant_company_profiles_updated_at
  BEFORE UPDATE ON tenant_company_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_company_profiles_updated_at();

-- ─── RLS ───

ALTER TABLE tenant_company_profiles ENABLE ROW LEVEL SECURITY;

-- Platform owner: full access
CREATE POLICY "platform_owner_full_access"
  ON tenant_company_profiles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'platform_owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'platform_owner'
    )
  );

-- Tenant super-admin: read/write own
CREATE POLICY "super_admin_own_profile"
  ON tenant_company_profiles
  FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super-admin'
    )
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super-admin'
    )
  );

-- Tenant admin/user: read own
CREATE POLICY "tenant_user_read_own"
  ON tenant_company_profiles
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
  );


-- ═══════════════════════════════════════════════════════
-- 2. Seed A&A company profile (confirmed)
-- ═══════════════════════════════════════════════════════

INSERT INTO tenant_company_profiles (
  tenant_id,
  industry,
  sub_vertical,
  company_description,
  founded_year,
  employee_count,
  headquarters,
  ownership_model,
  geographic_coverage,
  certifications,
  departments,
  service_catalog,
  differentiators,
  key_clients,
  union_partnerships,
  technology_platforms,
  training_programs,
  key_leadership,
  profile_status,
  onboarding_checklist
)
SELECT
  id,
  'Facility Services',
  'Integrated FM',
  'A&A Elevated Facility Solutions is a minority-owned, 100% employee-owned (ESOP) facility services company founded in 1973, delivering custodial, maintenance, and grounds services across 150M+ square feet daily.',
  1973,
  '2,000+',
  '965 Midland Ave, Yonkers, NY 10704',
  'ESOP',
  '["Northeast", "Mid-Atlantic", "Southeast", "Midwest", "West Coast", "South"]'::jsonb,
  '["MBE", "MWBE", "CIMS-GB"]'::jsonb,
  '[
    { "key": "operations", "name": "Operations", "description": "Day-to-day custodial, maintenance, and grounds service delivery", "icon": "clipboard-list" },
    { "key": "hr", "name": "Human Resources", "description": "Workforce management, benefits, union compliance, training", "icon": "users" },
    { "key": "finance", "name": "Finance", "description": "Budgeting, accounts receivable, financial reporting", "icon": "dollar-sign" },
    { "key": "sales", "name": "Sales", "description": "Business development, proposals, client acquisition", "icon": "building" },
    { "key": "purchasing", "name": "Purchasing", "description": "Procurement, vendor management, inventory", "icon": "shopping-cart" },
    { "key": "safety", "name": "Safety", "description": "Risk management, OSHA compliance, incident tracking, training", "icon": "shield" }
  ]'::jsonb,
  '[
    { "category": "Janitorial", "services": ["Day Porter", "Nightly Cleaning", "Deep Clean / Periodic", "Event Support", "Health Protocols", "Special Event Support"] },
    { "category": "Grounds", "services": ["Landscaping", "Snow & Ice Removal", "Irrigation", "Athletic Field Management", "Autonomous Mowing", "Outdoor Event Prep"] },
    { "category": "MEP", "services": ["Preventive Maintenance", "Emergency Response", "Building Systems Management"] }
  ]'::jsonb,
  '[
    { "key": "people_first", "label": "People First Philosophy", "description": "Employee dignity drives service quality — not a slogan, the operating system of the company" },
    { "key": "esop", "label": "Employee-Owned (ESOP)", "description": "Employee ownership aligns workforce incentives with client success" },
    { "key": "retention", "label": "96% Client Retention", "description": "Long-term partnerships built on consistent performance" },
    { "key": "union", "label": "Union Workforce Expertise", "description": "25+ years managing union workforces including 32BJ, Local 30, Local 74" },
    { "key": "technology", "label": "Technology Platform (AA360)", "description": "QA tracking, multilingual training, performance analytics, robotics integration" },
    { "key": "glide_path", "label": "Glide Path Shared Savings", "description": "Shared-savings model returning verified efficiency gains to clients" },
    { "key": "complex_env", "label": "Complex Environment Experience", "description": "Higher education, research labs, clinical spaces, residential life — 20+ years" },
    { "key": "manager_heavy", "label": "Manager-Heavy Model", "description": "Daily oversight, strong client communication, real-time accountability" },
    { "key": "sync", "label": "SYNC Specialist Cleaning", "description": "Task-based service model with 5 specialist roles for consistency and accountability" }
  ]'::jsonb,
  '["Long Island University", "Fordham University", "Caldwell University", "Lewis & Clark College", "Loyola Law School"]'::jsonb,
  '["32BJ", "1102", "Local 30", "Local 74"]'::jsonb,
  '[
    { "name": "AA360", "description": "QA tracking, multilingual training, performance analytics, robotics integration, AI auditing" },
    { "name": "Lighthouse", "description": "Real-time task completion tracking and quality verification" },
    { "name": "Corrigo", "description": "Work order management" },
    { "name": "TMA", "description": "Asset management and CMMS for MEP operations" },
    { "name": "Microsoft Project", "description": "Transition planning and milestone tracking" }
  ]'::jsonb,
  '["People First Orientation", "OSHA/HAZMAT/Driving Safety", "APPA-Level Custodial Training", "Green Cleaning Certification", "Lockout/Tagout", "Confined Space", "Arc Flash", "Seasonal Grounds Readiness"]'::jsonb,
  '[
    { "name": "Armando Rodriguez", "title": "President & CEO" },
    { "name": "Michael DeChristopher", "title": "COO" },
    { "name": "Eric Wheeler", "title": "VP of Operations" },
    { "name": "Philip Marzullo", "title": "Director of Innovation" },
    { "name": "Dana Micklos", "title": "Risk & Safety Director" },
    { "name": "Will Loeffel", "title": "Assistant Controller" },
    { "name": "Jaimie Restrepo", "title": "Startup/Transition Director" },
    { "name": "Sabi Radesich", "title": "Senior PM" },
    { "name": "Rocco Popoli", "title": "Senior Grounds" },
    { "name": "Mike Anthony", "title": "Remediation/Construction" }
  ]'::jsonb,
  'confirmed',
  '{"profile_confirmed": true, "documents_uploaded": true, "data_source_connected": true}'::jsonb
FROM alf_tenants
WHERE company_name ILIKE '%A&A%' OR company_name ILIKE '%elevated%'
LIMIT 1;


-- ═══════════════════════════════════════════════════════
-- 3. Seed draft profiles for other tenants
-- ═══════════════════════════════════════════════════════

-- Meridian
INSERT INTO tenant_company_profiles (tenant_id, industry, company_description, profile_status)
SELECT id, 'Facility Services',
  'Meridian Facility Solutions provides comprehensive commercial cleaning and facility maintenance services to corporate and institutional clients.',
  'draft'
FROM alf_tenants
WHERE company_name ILIKE '%meridian%'
LIMIT 1;

-- Summit
INSERT INTO tenant_company_profiles (tenant_id, industry, company_description, profile_status)
SELECT id, 'Facility Services',
  'Summit Building Services delivers integrated facility management solutions including custodial, grounds, and mechanical services.',
  'draft'
FROM alf_tenants
WHERE company_name ILIKE '%summit%'
LIMIT 1;

-- Greenfield
INSERT INTO tenant_company_profiles (tenant_id, industry, company_description, profile_status)
SELECT id, 'Property Management',
  'Greenfield Property Group manages commercial and residential properties with a focus on tenant satisfaction and operational efficiency.',
  'draft'
FROM alf_tenants
WHERE company_name ILIKE '%greenfield%'
LIMIT 1;


-- ═══════════════════════════════════════════════════════
-- 4. industry_templates
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS industry_templates (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  industry_key    text NOT NULL UNIQUE,
  name            text NOT NULL,
  description     text,
  template_data   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE industry_templates ENABLE ROW LEVEL SECURITY;

-- Platform owner only
CREATE POLICY "platform_owner_templates"
  ON industry_templates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'platform_owner'
    )
  );

-- All authenticated users can read templates
CREATE POLICY "authenticated_read_templates"
  ON industry_templates
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Seed: Facility Services (Integrated)
INSERT INTO industry_templates (industry_key, name, description, template_data)
VALUES (
  'facility_services_integrated',
  'Facility Services (Integrated)',
  'Full-service facility management: custodial, grounds, and MEP. Ideal for companies managing multiple service lines across large portfolios.',
  '{
    "industry": "Facility Services",
    "sub_vertical": "Integrated FM",
    "departments": [
      { "key": "operations", "name": "Operations", "description": "Day-to-day custodial, maintenance, and grounds service delivery", "icon": "clipboard-list" },
      { "key": "hr", "name": "Human Resources", "description": "Workforce management, benefits, union compliance, training", "icon": "users" },
      { "key": "finance", "name": "Finance", "description": "Budgeting, accounts receivable, financial reporting", "icon": "dollar-sign" },
      { "key": "sales", "name": "Sales", "description": "Business development, proposals, client acquisition", "icon": "building" },
      { "key": "purchasing", "name": "Purchasing", "description": "Procurement, vendor management, inventory", "icon": "shopping-cart" },
      { "key": "safety", "name": "Safety", "description": "Risk management, OSHA compliance, incident tracking, training", "icon": "shield" }
    ],
    "service_catalog": [
      { "category": "Janitorial", "services": ["Day Porter", "Nightly Cleaning", "Deep Clean / Periodic", "Event Support", "Health Protocols"] },
      { "category": "Grounds", "services": ["Landscaping", "Snow & Ice Removal", "Irrigation", "Athletic Field Management"] },
      { "category": "MEP", "services": ["Preventive Maintenance", "Emergency Response", "Building Systems Management"] }
    ],
    "differentiators": [
      { "key": "ownership", "label": "Ownership Model", "description": "" },
      { "key": "retention", "label": "Client Retention Rate", "description": "" },
      { "key": "safety_record", "label": "Safety Record", "description": "" },
      { "key": "technology", "label": "Technology Platform", "description": "" },
      { "key": "union_expertise", "label": "Union Workforce Expertise", "description": "" }
    ]
  }'::jsonb
);
