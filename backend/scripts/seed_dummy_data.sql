-- Migration 008: Seed dummy projects

-- Projects: 3 dummy projects assigned to project managers
WITH admin_user AS (
  SELECT id AS admin_id FROM users WHERE email = 'admin@email.com'
),
project_pms AS (
  SELECT email, id
  FROM users
  WHERE email IN ('paula@email.co', 'marcus@email.co', 'nina@email.co')
)
INSERT INTO projects (
  name,
  client_name,
  assigned_pm_id,
  status,
  created_by,
  project_start_date,
  project_end_date,
  stakeholders,
  team_members,
  engagement_type,
  methodology,
  milestones
)
SELECT
  'Atlas Platform Refresh',
  'email Financials',
  pm1.id,
  'active',
  admin_user.admin_id,
  '2026-06-01',
  '2026-09-30',
  '[{"name":"Alice Sponsor","email":"alice@email.co","role":"Executive Sponsor"},{"name":"Bob Lead","email":"bob@email.co","role":"Client Lead"}]',
  '[{"name":"Aisha Employee","email":"aisha@email.co","role":"Frontend Engineer"},{"name":"George Employee","email":"george@email.co","role":"Backend Engineer"}]',
  'Hybrid',
  'Agile',
  '[{"name":"Discovery","due_date":"2026-06-15","status":"Planned"},{"name":"MVP Delivery","due_date":"2026-08-15","status":"Planned"}]'
FROM admin_user
JOIN project_pms pm1 ON pm1.email = 'paula@email.co'
WHERE NOT EXISTS (
  SELECT 1 FROM projects WHERE name = 'Atlas Platform Refresh' AND client_name = 'email Financials'
);

WITH admin_user AS (
  SELECT id AS admin_id FROM users WHERE email = 'admin@email.com'
),
project_pms AS (
  SELECT email, id
  FROM users
  WHERE email IN ('paula@email.co', 'marcus@email.co', 'nina@email.co')
)
INSERT INTO projects (
  name,
  client_name,
  assigned_pm_id,
  status,
  created_by,
  project_start_date,
  project_end_date,
  stakeholders,
  team_members,
  engagement_type,
  methodology,
  milestones
)
SELECT
  'Mercury Operations Modernization',
  'Mercury Logistics',
  pm2.id,
  'active',
  admin_user.admin_id,
  '2026-07-01',
  '2026-11-30',
  '[{"name":"Max Parker","email":"max@mercury.co","role":"Executive Sponsor"},{"name":"Sarah Lead","email":"sarah@mercury.co","role":"Client Lead"}]',
  '[{"name":"Chen Employee","email":"chen@email.co","role":"DevOps Engineer"},{"name":"Ben Employee","email":"ben@email.co","role":"QA Analyst"}]',
  'T&M',
  'Agile',
  '[{"name":"Platform Stabilization","due_date":"2026-08-30","status":"Planned"},{"name":"Rollout","due_date":"2026-11-15","status":"Planned"}]'
FROM admin_user
JOIN project_pms pm2 ON pm2.email = 'marcus@email.co'
WHERE NOT EXISTS (
  SELECT 1 FROM projects WHERE name = 'Mercury Operations Modernization' AND client_name = 'Mercury Logistics'
);

WITH admin_user AS (
  SELECT id AS admin_id FROM users WHERE email = 'admin@email.com'
),
project_pms AS (
  SELECT email, id
  FROM users
  WHERE email IN ('paula@email.co', 'marcus@email.co', 'nina@email.co')
)
INSERT INTO projects (
  name,
  client_name,
  assigned_pm_id,
  status,
  created_by,
  project_start_date,
  project_end_date,
  stakeholders,
  team_members,
  engagement_type,
  methodology,
  milestones
)
SELECT
  'Nova Customer Insights',
  'Nova Retail',
  pm3.id,
  'active',
  admin_user.admin_id,
  '2026-05-15',
  '2026-10-15',
  '[{"name":"Jane Doe","email":"jane@nova.co","role":"Executive Sponsor"},{"name":"Tom Owner","email":"tom@nova.co","role":"Client Lead"}]',
  '[{"name":"Fatima Employee","email":"fatima@email.co","role":"Frontend Engineer"},{"name":"Ibrahim Employee","email":"ibrahim@email.co","role":"Customer Success"}]',
  'Fixed Cost',
  'Waterfall',
  '[{"name":"Requirements","due_date":"2026-06-30","status":"Completed"},{"name":"Analytics Build","due_date":"2026-09-30","status":"Planned"}]'
FROM admin_user
JOIN project_pms pm3 ON pm3.email = 'nina@email.co'
WHERE NOT EXISTS (
  SELECT 1 FROM projects WHERE name = 'Nova Customer Insights' AND client_name = 'Nova Retail'
);
