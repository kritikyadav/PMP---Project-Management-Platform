import { Router } from 'express';
import { db } from '../db';
import { requireAuth, requireRole } from '../middleware/rbac';
import { computeProjectHealth } from '../utils/projectHealth';

export const cxoRouter = Router();

cxoRouter.use(requireAuth);
cxoRouter.use(requireRole(['cxo']));

const LATEST_PUBLISHED_JOIN = `
  LEFT JOIN LATERAL (
    SELECT *
    FROM project_submissions
    WHERE project_id = p.id AND status = 'published'
    ORDER BY version DESC LIMIT 1
  ) pub ON true
`;

function buildCxoFilters(query: { sprint_start_date?: string; sprint_end_date?: string }) {
  const conditions = ['p.status = $1'];
  const values: string[] = ['active'];
  if (query.sprint_start_date) {
    values.push(query.sprint_start_date);
    conditions.push(`pub.sprint_start_date >= $${values.length}`);
  }
  if (query.sprint_end_date) {
    values.push(query.sprint_end_date);
    conditions.push(`pub.sprint_end_date <= $${values.length}`);
  }
  return { where: conditions.join(' AND '), values };
}

cxoRouter.get('/summary', async (req, res) => {
  const { where, values } = buildCxoFilters(req.query);
  const result = await db.query(
    `WITH latest AS (
       SELECT
         p.id AS project_id,
         overridden.rag_schedule,
         overridden.rag_budget,
         overridden.rag_scope,
         overridden.rag_resources,
         overridden.rag_timeline,
         overridden.rag_project_health
       FROM projects p
       ${LATEST_PUBLISHED_JOIN}
       LEFT JOIN LATERAL (
         SELECT
           s.rag_schedule,
           s.rag_budget,
           s.rag_scope,
           s.rag_resources,
           s.rag_timeline,
           CASE
             WHEN s.rag_schedule IS NULL OR s.rag_budget IS NULL OR s.rag_scope IS NULL OR s.rag_resources IS NULL OR s.rag_timeline IS NULL THEN NULL
             ELSE
               CASE
                 WHEN (
                   (CASE s.rag_schedule WHEN 'green' THEN 3 WHEN 'amber' THEN 2 ELSE 1 END) +
                   (CASE s.rag_budget WHEN 'green' THEN 3 WHEN 'amber' THEN 2 ELSE 1 END) +
                   (CASE s.rag_scope WHEN 'green' THEN 3 WHEN 'amber' THEN 2 ELSE 1 END) +
                   (CASE s.rag_resources WHEN 'green' THEN 3 WHEN 'amber' THEN 2 ELSE 1 END) +
                   (CASE s.rag_timeline WHEN 'green' THEN 3 WHEN 'amber' THEN 2 ELSE 1 END)
                 ) >= 13 THEN 'green'
                 WHEN (
                   (CASE s.rag_schedule WHEN 'green' THEN 3 WHEN 'amber' THEN 2 ELSE 1 END) +
                   (CASE s.rag_budget WHEN 'green' THEN 3 WHEN 'amber' THEN 2 ELSE 1 END) +
                   (CASE s.rag_scope WHEN 'green' THEN 3 WHEN 'amber' THEN 2 ELSE 1 END) +
                   (CASE s.rag_resources WHEN 'green' THEN 3 WHEN 'amber' THEN 2 ELSE 1 END) +
                   (CASE s.rag_timeline WHEN 'green' THEN 3 WHEN 'amber' THEN 2 ELSE 1 END)
                 ) >= 8 THEN 'amber'
                 ELSE 'red'
               END
           END AS rag_project_health
         FROM (
           SELECT
             COALESCE(
               (SELECT override_value FROM submission_overrides WHERE submission_id = pub.id AND field_name = 'rag_schedule' ORDER BY created_at DESC LIMIT 1),
               pub.rag_schedule
             ) AS rag_schedule,
             COALESCE(
               (SELECT override_value FROM submission_overrides WHERE submission_id = pub.id AND field_name = 'rag_budget' ORDER BY created_at DESC LIMIT 1),
               pub.rag_budget
             ) AS rag_budget,
             COALESCE(
               (SELECT override_value FROM submission_overrides WHERE submission_id = pub.id AND field_name = 'rag_scope' ORDER BY created_at DESC LIMIT 1),
               pub.rag_scope
             ) AS rag_scope,
             COALESCE(
               (SELECT override_value FROM submission_overrides WHERE submission_id = pub.id AND field_name = 'rag_resources' ORDER BY created_at DESC LIMIT 1),
               pub.rag_resources
             ) AS rag_resources,
             COALESCE(
               (SELECT override_value FROM submission_overrides WHERE submission_id = pub.id AND field_name = 'rag_timeline' ORDER BY created_at DESC LIMIT 1),
               pub.rag_timeline
             ) AS rag_timeline
         ) s
       ) overridden ON pub.id IS NOT NULL
       WHERE ${where}
     )
     SELECT
       COUNT(*)::int AS total_active_projects,
       COUNT(*) FILTER (WHERE rag_project_health = 'green')::int AS health_green,
       COUNT(*) FILTER (WHERE rag_project_health = 'amber')::int AS health_amber,
       COUNT(*) FILTER (WHERE rag_project_health = 'red')::int AS health_red,
       COUNT(*) FILTER (WHERE rag_project_health IS NULL)::int AS not_submitted,
       COUNT(*) FILTER (WHERE rag_schedule = 'green')::int AS schedule_green,
       COUNT(*) FILTER (WHERE rag_schedule = 'amber')::int AS schedule_amber,
       COUNT(*) FILTER (WHERE rag_schedule = 'red')::int AS schedule_red,
       COUNT(*) FILTER (WHERE rag_budget = 'green')::int AS budget_green,
       COUNT(*) FILTER (WHERE rag_budget = 'amber')::int AS budget_amber,
       COUNT(*) FILTER (WHERE rag_budget = 'red')::int AS budget_red,
       COUNT(*) FILTER (WHERE rag_scope = 'green')::int AS scope_green,
       COUNT(*) FILTER (WHERE rag_scope = 'amber')::int AS scope_amber,
       COUNT(*) FILTER (WHERE rag_scope = 'red')::int AS scope_red,
       COUNT(*) FILTER (WHERE rag_resources = 'green')::int AS resources_green,
       COUNT(*) FILTER (WHERE rag_resources = 'amber')::int AS resources_amber,
       COUNT(*) FILTER (WHERE rag_resources = 'red')::int AS resources_red,
       COUNT(*) FILTER (WHERE rag_timeline = 'green')::int AS timeline_green,
       COUNT(*) FILTER (WHERE rag_timeline = 'amber')::int AS timeline_amber,
       COUNT(*) FILTER (WHERE rag_timeline = 'red')::int AS timeline_red
     FROM latest`,
    values
  );

  res.json(result.rows[0]);
});

cxoRouter.get('/projects', async (req, res) => {
  const { where, values } = buildCxoFilters(req.query);
  const result = await db.query(
    `SELECT
       p.id AS project_id,
       p.name AS project_name,
       p.client_name,
       p.project_start_date,
       p.project_end_date,
       COALESCE(pm.name, pm.email) AS pm_name,
       pub.id AS submission_id,
       pub.version,
       pub.sprint_name,
       pub.updated_at AS published_at,
       overridden.rag_schedule,
       overridden.rag_budget,
       overridden.rag_scope,
       overridden.rag_resources,
       overridden.rag_timeline,
       overridden.rag_project_health,
       COALESCE(jsonb_array_length(pub.milestones), 0) AS milestones_count,
       CASE WHEN pub.id IS NULL THEN 'not_submitted' ELSE 'submitted' END AS publish_status,
       prev.prev_rag_schedule,
       prev.prev_rag_budget,
       prev.prev_rag_scope,
       prev.prev_rag_resources,
       prev.prev_rag_timeline,
       prev.prev_rag_project_health
     FROM projects p
     LEFT JOIN users pm ON pm.id = p.assigned_pm_id
     ${LATEST_PUBLISHED_JOIN}
     LEFT JOIN LATERAL (
       SELECT
         s.rag_schedule,
         s.rag_budget,
         s.rag_scope,
         s.rag_resources,
         s.rag_timeline,
         CASE
           WHEN s.rag_schedule IS NULL OR s.rag_budget IS NULL OR s.rag_scope IS NULL OR s.rag_resources IS NULL OR s.rag_timeline IS NULL THEN NULL
           ELSE
             CASE
               WHEN (
                 (CASE s.rag_schedule WHEN 'green' THEN 3 WHEN 'amber' THEN 2 ELSE 1 END) +
                 (CASE s.rag_budget WHEN 'green' THEN 3 WHEN 'amber' THEN 2 ELSE 1 END) +
                 (CASE s.rag_scope WHEN 'green' THEN 3 WHEN 'amber' THEN 2 ELSE 1 END) +
                 (CASE s.rag_resources WHEN 'green' THEN 3 WHEN 'amber' THEN 2 ELSE 1 END) +
                 (CASE s.rag_timeline WHEN 'green' THEN 3 WHEN 'amber' THEN 2 ELSE 1 END)
               ) >= 13 THEN 'green'
               WHEN (
                 (CASE s.rag_schedule WHEN 'green' THEN 3 WHEN 'amber' THEN 2 ELSE 1 END) +
                 (CASE s.rag_budget WHEN 'green' THEN 3 WHEN 'amber' THEN 2 ELSE 1 END) +
                 (CASE s.rag_scope WHEN 'green' THEN 3 WHEN 'amber' THEN 2 ELSE 1 END) +
                 (CASE s.rag_resources WHEN 'green' THEN 3 WHEN 'amber' THEN 2 ELSE 1 END) +
                 (CASE s.rag_timeline WHEN 'green' THEN 3 WHEN 'amber' THEN 2 ELSE 1 END)
               ) >= 8 THEN 'amber'
               ELSE 'red'
             END
         END AS rag_project_health
       FROM (
         SELECT
           COALESCE(
             (SELECT override_value FROM submission_overrides WHERE submission_id = pub.id AND field_name = 'rag_schedule' ORDER BY created_at DESC LIMIT 1),
             pub.rag_schedule
           ) AS rag_schedule,
           COALESCE(
             (SELECT override_value FROM submission_overrides WHERE submission_id = pub.id AND field_name = 'rag_budget' ORDER BY created_at DESC LIMIT 1),
             pub.rag_budget
           ) AS rag_budget,
           COALESCE(
             (SELECT override_value FROM submission_overrides WHERE submission_id = pub.id AND field_name = 'rag_scope' ORDER BY created_at DESC LIMIT 1),
             pub.rag_scope
           ) AS rag_scope,
           COALESCE(
             (SELECT override_value FROM submission_overrides WHERE submission_id = pub.id AND field_name = 'rag_resources' ORDER BY created_at DESC LIMIT 1),
             pub.rag_resources
           ) AS rag_resources,
           COALESCE(
             (SELECT override_value FROM submission_overrides WHERE submission_id = pub.id AND field_name = 'rag_timeline' ORDER BY created_at DESC LIMIT 1),
             pub.rag_timeline
           ) AS rag_timeline
       ) s
     ) overridden ON pub.id IS NOT NULL
     LEFT JOIN LATERAL (
       SELECT
         rag_schedule       AS prev_rag_schedule,
         rag_budget         AS prev_rag_budget,
         rag_scope          AS prev_rag_scope,
         rag_resources      AS prev_rag_resources,
         rag_timeline       AS prev_rag_timeline,
         rag_project_health AS prev_rag_project_health
       FROM project_submissions
       WHERE project_id = p.id AND status = 'published'
         AND (pub.id IS NULL OR id != pub.id)
       ORDER BY version DESC LIMIT 1
     ) prev ON true
     WHERE ${where}
     ORDER BY p.name`,
    values
  );

  res.json(result.rows);
});

cxoRouter.get('/projects/:id', async (req, res) => {
  const { id } = req.params;
  const result = await db.query(
    `SELECT
       p.id AS project_id,
       p.name AS project_name,
       p.client_name,
       p.project_start_date,
       p.project_end_date,
       p.engagement_type,
       p.methodology,
       p.stakeholders,
       p.team_members,
       COALESCE(pm.name, pm.email) AS pm_name,
       pub.*
     FROM projects p
     LEFT JOIN users pm ON pm.id = p.assigned_pm_id
     ${LATEST_PUBLISHED_JOIN}
     WHERE p.id = $1 AND p.status = 'active'`,
    [id]
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Active project not found' });
    return;
  }

  const detail = result.rows[0];
  if (detail && detail.id) {
    const overrides = await db.query(
      `SELECT * FROM submission_overrides WHERE submission_id = $1 ORDER BY created_at DESC`,
      [detail.id]
    );
    if (overrides.rows.length > 0) {
      const latestOverrides: Record<string, string> = {};
      for (const ovr of overrides.rows) {
        if (!latestOverrides[ovr.field_name]) {
          latestOverrides[ovr.field_name] = ovr.override_value;
        }
      }
      for (const [field, val] of Object.entries(latestOverrides)) {
        detail[field] = val;
      }
      detail.rag_project_health = computeProjectHealth(
        detail.rag_schedule,
        detail.rag_budget,
        detail.rag_scope,
        detail.rag_resources,
        detail.rag_timeline
      );
    }
  }

  res.json(detail);
});

cxoRouter.post('/submissions/:id/overrides', (_req, res) => {
  res.status(403).json({ error: 'CXO access is read-only' });
});
