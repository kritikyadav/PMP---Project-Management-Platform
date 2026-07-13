-- v1.2 schema additions (all idempotent)

-- Timeline RAG dimension + auto-calculated project health on submissions
ALTER TABLE project_submissions
  ADD COLUMN IF NOT EXISTS rag_timeline          VARCHAR(10) CHECK (rag_timeline IN ('green','amber','red')),
  ADD COLUMN IF NOT EXISTS rag_timeline_comment  TEXT,
  ADD COLUMN IF NOT EXISTS rag_project_health    VARCHAR(10) CHECK (rag_project_health IN ('green','amber','red'));

-- Stakeholders (JSONB array), persistent team members, engagement type, methodology on projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS stakeholders    JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS team_members    JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS engagement_type VARCHAR(30) CHECK (engagement_type IN ('Fixed Cost','T&M','Hybrid')),
  ADD COLUMN IF NOT EXISTS methodology     VARCHAR(20) CHECK (methodology IN ('Agile','Waterfall'));

-- Soft delete for RAID log and milestone statuses
ALTER TABLE raid_log
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE milestone_statuses
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
