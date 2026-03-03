-- Role-based nav simplification
-- Adds department_key to profiles for role-based nav scoping (user/manager see only their dept)

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department_key text;

CREATE INDEX IF NOT EXISTS idx_profiles_department_key ON profiles (tenant_id, department_key);
