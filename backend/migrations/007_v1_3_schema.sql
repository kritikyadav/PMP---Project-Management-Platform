-- v1.3 schema: add milestones JSONB to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS milestones JSONB NOT NULL DEFAULT '[]';
