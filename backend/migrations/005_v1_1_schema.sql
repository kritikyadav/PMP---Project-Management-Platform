-- Migration 005: v1.1 schema changes

-- -----------------------------------------------------------------------
-- USERS — replace Zoho fields with MS Teams fields
-- -----------------------------------------------------------------------
ALTER TABLE users DROP COLUMN IF EXISTS zoho_emp_id;
ALTER TABLE users DROP COLUMN IF EXISTS zoho_role;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ms_department VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS ms_job_title  VARCHAR(255);

-- -----------------------------------------------------------------------
-- PROJECTS — project-level date range
-- -----------------------------------------------------------------------
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_start_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_end_date   DATE;

-- -----------------------------------------------------------------------
-- PROJECT_SUBMISSIONS — drop rag_risks + reporting_period text;
--                       add date-range reporting period + milestones
-- -----------------------------------------------------------------------
ALTER TABLE project_submissions DROP COLUMN IF EXISTS rag_risks;
ALTER TABLE project_submissions DROP COLUMN IF EXISTS rag_risks_comment;
ALTER TABLE project_submissions DROP COLUMN IF EXISTS reporting_period;

ALTER TABLE project_submissions
  ADD COLUMN IF NOT EXISTS reporting_period_start DATE,
  ADD COLUMN IF NOT EXISTS reporting_period_end   DATE,
  ADD COLUMN IF NOT EXISTS milestones             JSONB NOT NULL DEFAULT '[]'::jsonb;

-- -----------------------------------------------------------------------
-- MILESTONE_STATUSES — global lookup table
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS milestone_statuses (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  label       VARCHAR(100) NOT NULL UNIQUE,
  created_by  UUID         NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------
-- RAID_LOG — live per-project RAID log (not versioned)
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raid_log (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  raid_seq_id  INTEGER      NOT NULL,
  type         VARCHAR(30)  NOT NULL
                 CHECK (type IN ('Risk','Assumption','Issue','Dependency')),
  date_raised  DATE         NOT NULL DEFAULT CURRENT_DATE,
  raised_by    TEXT         NOT NULL,
  raised_by_id UUID         REFERENCES users(id),
  title        VARCHAR(500) NOT NULL,
  description  TEXT,
  impact       VARCHAR(10)  CHECK (impact IN ('Low','Medium','High')),
  urgency      VARCHAR(10)  CHECK (urgency IN ('Low','Medium','High')),
  probability  VARCHAR(10)  CHECK (probability IN ('Low','Medium','High')),
  priority     VARCHAR(20)
                 CHECK (priority IN ('P1 - Critical','P2 - High','P3 - Medium','P4 - Low')),
  owner        TEXT,
  status       VARCHAR(20)  NOT NULL DEFAULT 'Pending'
                 CHECK (status IN ('Pending','In Progress','Resolved')),
  mitigation   TEXT,
  created_by   UUID         NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, raid_seq_id)
);

CREATE INDEX IF NOT EXISTS idx_raid_log_project_id ON raid_log (project_id);
