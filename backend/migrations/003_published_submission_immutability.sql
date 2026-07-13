-- Migration 003: Enforce append-only published submissions.
--
-- A draft may be updated and then promoted to published. Once a row is already
-- published, direct UPDATE or DELETE attempts are rejected by this trigger.

CREATE OR REPLACE FUNCTION prevent_published_submission_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'Published project submissions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_published_submission_update ON project_submissions;
CREATE TRIGGER trg_prevent_published_submission_update
  BEFORE UPDATE ON project_submissions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_published_submission_mutation();

DROP TRIGGER IF EXISTS trg_prevent_published_submission_delete ON project_submissions;
CREATE TRIGGER trg_prevent_published_submission_delete
  BEFORE DELETE ON project_submissions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_published_submission_mutation();
