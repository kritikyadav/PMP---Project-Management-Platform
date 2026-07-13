-- Migration 001: Initial schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------
-- USERS
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(255) UNIQUE NOT NULL,
  name        VARCHAR(255),
  role        VARCHAR(50)  NOT NULL CHECK (role IN ('system_admin', 'program_manager', 'pm', 'cxo')),
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------
-- PROJECTS
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(255) NOT NULL,
  client_name    VARCHAR(255) NOT NULL,
  assigned_pm_id UUID         REFERENCES users(id) ON DELETE SET NULL,
  status         VARCHAR(50)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by     UUID         NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------
-- PROJECT_SUBMISSIONS
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_submissions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID        NOT NULL REFERENCES projects(id),
  submitted_by    UUID        NOT NULL REFERENCES users(id),
  status          VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'published')),
  version         INTEGER     NOT NULL DEFAULT 1,

  -- Section A: metadata
  sprint_name          VARCHAR(255),
  sprint_start_date    DATE,
  sprint_end_date      DATE,
  stakeholder_name     VARCHAR(255),
  tech_team_size       INTEGER,
  reporting_period     VARCHAR(255),

  -- Section B: RAG statuses (independent of comments per key decision)
  rag_schedule         VARCHAR(10) CHECK (rag_schedule IN ('green', 'amber', 'red')),
  rag_schedule_comment TEXT,
  rag_budget           VARCHAR(10) CHECK (rag_budget IN ('green', 'amber', 'red')),
  rag_budget_comment   TEXT,
  rag_scope            VARCHAR(10) CHECK (rag_scope IN ('green', 'amber', 'red')),
  rag_scope_comment    TEXT,
  rag_resources        VARCHAR(10) CHECK (rag_resources IN ('green', 'amber', 'red')),
  rag_resources_comment TEXT,
  rag_risks            VARCHAR(10) CHECK (rag_risks IN ('green', 'amber', 'red')),
  rag_risks_comment    TEXT,

  -- Section C: rich text (stored as Markdown)
  overview                 TEXT,
  business_coordination    TEXT,
  feature_releases         TEXT,
  development_uat          TEXT,
  ongoing_work             TEXT,
  upcoming_deliverables    TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one draft allowed per project+PM at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_draft_per_project_pm
  ON project_submissions (project_id, submitted_by)
  WHERE status = 'draft';

-- -----------------------------------------------------------------------
-- SUBMISSION_OVERRIDES
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submission_overrides (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID        NOT NULL REFERENCES project_submissions(id),
  field_name      VARCHAR(255) NOT NULL,
  original_value  TEXT,
  override_value  TEXT        NOT NULL,
  override_reason TEXT        NOT NULL CHECK (char_length(override_reason) >= 10),
  overridden_by   UUID        NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------
-- AUDIT_LOG
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  action      VARCHAR(100) NOT NULL,
  actor_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  target_type VARCHAR(100),
  target_id   UUID,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_action     ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor      ON audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_target     ON audit_log (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);

