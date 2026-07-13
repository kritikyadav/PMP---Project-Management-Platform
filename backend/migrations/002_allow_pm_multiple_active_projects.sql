-- Migration 002: Allow a PM to own multiple active projects.
--
-- Each project already has a single assigned_pm_id column, which enforces one
-- PM per project. The old constraint also limited each PM to one active project.

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS one_pm_per_project;
