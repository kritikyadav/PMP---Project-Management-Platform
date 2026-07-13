-- Migration 002: Team Structure and Zoho Integration

ALTER TABLE users ADD COLUMN IF NOT EXISTS zoho_emp_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS zoho_role VARCHAR(255);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('system_admin', 'program_manager', 'pm', 'cxo', 'employee'));

ALTER TABLE project_submissions ADD COLUMN IF NOT EXISTS team_structure JSONB DEFAULT '[]'::jsonb;
