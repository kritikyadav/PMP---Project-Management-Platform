import { Router } from 'express';
import type { PoolClient } from 'pg';
import { db } from '../db';
import { requireAuth, requireRole } from '../middleware/rbac';
import { emitFieldOverridden, emitProjectAssigned, emitProjectUnassigned } from '../realtime';
import { computeProjectHealth } from '../utils/projectHealth';

export const pgmRouter = Router();

pgmRouter.use(requireAuth);
pgmRouter.use(requireRole(['program_manager']));

const VALID_RAG = ['green', 'amber', 'red'];
const OVERRIDABLE_FIELDS = [
  'rag_schedule',
  'rag_budget',
  'rag_scope',
  'rag_resources',
  'rag_timeline',
] as const;

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function isOverridableField(field: string): field is (typeof OVERRIDABLE_FIELDS)[number] {
  return (OVERRIDABLE_FIELDS as readonly string[]).includes(field);
}

function buildPortfolioFilters(query: {
  pm_name?: string;
  client_name?: string;
  rag_status?: string;
  publish_status?: string;
  show_archived?: string;
  sprint_start_date?: string;
  sprint_end_date?: string;
}) {
  const conditions = [];
  const values: string[] = [];

  if (query.show_archived === 'true') {
    conditions.push('p.status IN ($1, $2)');
    values.push('active', 'archived');
  } else {
    conditions.push('p.status = $1');
    values.push('active');
  }

  if (query.pm_name) {
    values.push(`%${query.pm_name}%`);
    conditions.push(`COALESCE(pm.name, pm.email, '') ILIKE $${values.length}`);
  }
  if (query.client_name) {
    values.push(`%${query.client_name}%`);
    conditions.push(`p.client_name ILIKE $${values.length}`);
  }
  if (query.rag_status && VALID_RAG.includes(query.rag_status)) {
    values.push(query.rag_status);
    conditions.push(
      `$${values.length} IN (overridden.rag_schedule, overridden.rag_budget, overridden.rag_scope, overridden.rag_resources, overridden.rag_timeline)`
    );
  }
  if (query.publish_status === 'submitted') {
    conditions.push('pub.id IS NOT NULL');
  }
  if (query.publish_status === 'not_submitted') {
    conditions.push('pub.id IS NULL');
  }
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

pgmRouter.get('/portfolio', async (req, res) => {
  const { where, values } = buildPortfolioFilters(req.query as {
    pm_name?: string;
    client_name?: string;
    rag_status?: string;
    publish_status?: string;
    show_archived?: string;
    sprint_start_date?: string;
    sprint_end_date?: string;
  });

  const result = await db.query(
    `SELECT
       p.id AS project_id,
       p.name AS project_name,
       p.client_name,
       p.assigned_pm_id,
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
     LEFT JOIN LATERAL (
       SELECT *
       FROM project_submissions
       WHERE project_id = p.id AND status = 'published'
       ORDER BY version DESC LIMIT 1
     ) pub ON true
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

pgmRouter.get('/pms', async (_req, res) => {
  const result = await db.query(
    `SELECT id, name, email FROM users WHERE role = 'pm' AND is_active = true ORDER BY name`
  );
  res.json(result.rows);
});

pgmRouter.get('/projects/:id', async (req, res) => {
  const { id } = req.params;
  const result = await db.query(
    `SELECT
       pub.*,
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
       p.status AS project_status
     FROM projects p
     LEFT JOIN users pm ON pm.id = p.assigned_pm_id
     LEFT JOIN LATERAL (
       SELECT *
       FROM project_submissions
       WHERE project_id = p.id AND status = 'published'
       ORDER BY version DESC LIMIT 1
     ) pub ON true
     WHERE p.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const detail = result.rows[0];
  const overrides = detail.id
    ? await db.query(
        `SELECT * FROM submission_overrides WHERE submission_id = $1 ORDER BY created_at DESC`,
        [detail.id]
      )
    : { rows: [] };

  if (detail && overrides.rows.length > 0) {
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

  res.json({ ...detail, overrides: overrides.rows });
});

pgmRouter.get('/projects/:id/history', async (req, res) => {
  const { id } = req.params;
  const result = await db.query(
    `SELECT ps.*, COALESCE(u.name, u.email) AS submitted_by_name
     FROM project_submissions ps
     JOIN users u ON u.id = ps.submitted_by
     WHERE ps.project_id = $1 AND ps.status = 'published'
     ORDER BY ps.version DESC`,
    [id]
  );
  res.json(result.rows);
});

pgmRouter.post('/submissions/:id/overrides', async (req, res) => {
  const { id } = req.params;
  const { field_name, override_value, override_reason } = req.body as {
    field_name?: string;
    override_value?: string;
    override_reason?: string;
  };

  if (!field_name || !isOverridableField(field_name)) {
    res.status(400).json({ error: 'field_name is not overridable' });
    return;
  }
  if (override_value === undefined || override_value === null || override_value === '') {
    res.status(400).json({ error: 'override_value is required' });
    return;
  }
  if (!override_reason || override_reason.trim().length < 10) {
    res.status(400).json({ error: 'override_reason must be at least 10 characters' });
    return;
  }

  const actorId = req.user!.id;

  const result = await withTransaction(async (client) => {
    const submission = await client.query(
      `SELECT id, submitted_by, ${field_name} AS original_value
       FROM project_submissions
       WHERE id = $1 AND status = 'published'`,
      [id]
    );
    if (submission.rows.length === 0) {
      throw Object.assign(new Error('Submission not found'), { code: 'NOT_FOUND' });
    }

    const pmUserId = submission.rows[0].submitted_by;

    const inserted = await client.query(
      `INSERT INTO submission_overrides
          (submission_id, field_name, original_value, override_value, override_reason, overridden_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
      [
        id,
        field_name,
        submission.rows[0].original_value == null ? null : String(submission.rows[0].original_value),
        override_value,
        override_reason.trim(),
        actorId,
      ]
    );
    const row = inserted.rows[0];

    await client.query(
      `INSERT INTO audit_log (action, actor_id, target_type, target_id, metadata)
       VALUES ('submission.override', $1, 'submission', $2, $3)`,
      [actorId, id, JSON.stringify({ field_name, override_id: row.id })]
    );

    return { override: row, pmUserId };
  }).catch((err: unknown) => {
    if (err instanceof Error && (err as NodeJS.ErrnoException & { code?: string }).code === 'NOT_FOUND') {
      res.status(404).json({ error: 'Published submission not found' });
      return null;
    }
    throw err;
  });

  if (result) {
    emitFieldOverridden(result.override, result.pmUserId);
    res.status(201).json(result.override);
  }
});

pgmRouter.post('/projects', async (req, res) => {
  const { name, client_name, assigned_pm_id, engagement_type, methodology, stakeholders } = req.body as {
    name?: string;
    client_name?: string;
    assigned_pm_id?: string;
    engagement_type?: string;
    methodology?: string;
    stakeholders?: unknown;
  };
  const actorId = req.user!.id;

  if (!name || !client_name) {
    res.status(400).json({ error: 'name and client_name are required' });
    return;
  }
  if (!engagement_type || !['Fixed Cost', 'T&M', 'Hybrid'].includes(engagement_type)) {
    res.status(400).json({ error: 'engagement_type must be one of: Fixed Cost, T&M, Hybrid' });
    return;
  }
  if (!methodology || !['Agile', 'Waterfall'].includes(methodology)) {
    res.status(400).json({ error: 'methodology must be one of: Agile, Waterfall' });
    return;
  }
  if (stakeholders !== undefined) {
    if (!Array.isArray(stakeholders)) {
      res.status(400).json({ error: 'stakeholders must be an array' });
      return;
    }
    for (const stakeholder of stakeholders) {
      if (
        !stakeholder ||
        typeof stakeholder !== 'object' ||
        typeof (stakeholder as { name?: unknown }).name !== 'string' ||
        !(stakeholder as { name: string }).name.trim()
      ) {
        res.status(400).json({ error: 'Each stakeholder must include a name' });
        return;
      }

      const { contact_no, email } = stakeholder as { contact_no?: unknown; email?: unknown };

      if (contact_no !== undefined && contact_no !== null && String(contact_no).trim() !== '') {
        if (!/^\d{10,15}$/.test(String(contact_no).trim())) {
          res.status(400).json({ error: 'Contact number must be a valid 10-15 digit number' });
          return;
        }
      }

      if (email !== undefined && email !== null && String(email).trim() !== '') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
          res.status(400).json({ error: 'Invalid email format' });
          return;
        }
      }
    }
  }

  const project = await withTransaction(async (client) => {
    if (assigned_pm_id) {
      const pm = await client.query(
        `SELECT id FROM users WHERE id = $1 AND role = 'pm' AND is_active = true`,
        [assigned_pm_id]
      );
      if (pm.rows.length === 0) {
        throw Object.assign(new Error('Invalid PM'), { code: 'INVALID_PM' });
      }
    }

    const insert = await client.query(
      `INSERT INTO projects (name, client_name, assigned_pm_id, engagement_type, methodology, stakeholders, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING id, name, client_name, assigned_pm_id, engagement_type, methodology, stakeholders, status`,
      [name, client_name, assigned_pm_id ?? null, engagement_type, methodology, JSON.stringify(stakeholders ?? []), actorId]
    );
    const row = insert.rows[0];

    await client.query(
      `INSERT INTO audit_log (action, actor_id, target_type, target_id, metadata)
       VALUES ('project.create', $1, 'project', $2, $3)`,
      [actorId, row.id, JSON.stringify({ name, client_name })]
    );

    return row;
  }).catch((err: unknown) => {
    if (err instanceof Error && (err as NodeJS.ErrnoException & { code?: string }).code === 'INVALID_PM') {
      res.status(400).json({ error: 'assigned_pm_id must be an active user with role pm' });
      return null;
    }
    throw err;
  });

  if (project) {
    if (project.assigned_pm_id) {
      emitProjectAssigned(project.assigned_pm_id, project);
    }
    res.status(201).json(project);
  }
});

pgmRouter.put('/projects/:id/assign-pm', async (req, res) => {
  const { id } = req.params;
  const { assigned_pm_id } = req.body as { assigned_pm_id: string | null };
  const actorId = req.user!.id;

  const project = await withTransaction(async (client) => {
    const prevQuery = await client.query(
      `SELECT id, name, assigned_pm_id FROM projects WHERE id = $1`,
      [id]
    );
    if (prevQuery.rows.length === 0) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }
    const previousPmId = prevQuery.rows[0].assigned_pm_id;

    if (assigned_pm_id) {
      const pm = await client.query(
        `SELECT id FROM users WHERE id = $1 AND role = 'pm' AND is_active = true`,
        [assigned_pm_id]
      );
      if (pm.rows.length === 0) {
        throw Object.assign(new Error('Invalid PM'), { code: 'INVALID_PM' });
      }
    }

    const updated = await client.query(
      `UPDATE projects SET assigned_pm_id = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, assigned_pm_id, status`,
      [assigned_pm_id, id]
    );
    if (updated.rows.length === 0) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    await client.query(
      `INSERT INTO audit_log (action, actor_id, target_type, target_id, metadata)
       VALUES ('project.assign_pm', $1, 'project', $2, $3)`,
      [actorId, id, JSON.stringify({ assigned_pm_id })]
    );

    return { ...updated.rows[0], previousPmId };
  }).catch((err: unknown) => {
    if (err instanceof Error && (err as any).code === 'INVALID_PM') {
      res.status(400).json({ error: 'assigned_pm_id must be an active user with role pm' });
      return null;
    }
    if (err instanceof Error && (err as any).code === 'NOT_FOUND') {
      res.status(404).json({ error: 'Project not found' });
      return null;
    }
    throw err;
  });

  if (project) {
    if (project.previousPmId && project.previousPmId !== assigned_pm_id) {
      emitProjectUnassigned(project.previousPmId, { id: project.id, name: project.name });
    }
    if (project.assigned_pm_id) {
      emitProjectAssigned(project.assigned_pm_id, project);
    }
    res.json(project);
  }
});

pgmRouter.put('/projects/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body as { status: 'active' | 'archived' };
  const actorId = req.user!.id;

  if (status !== 'active' && status !== 'archived') {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const project = await withTransaction(async (client) => {
    const prevQuery = await client.query(
      `SELECT id, name, assigned_pm_id, status FROM projects WHERE id = $1`,
      [id]
    );
    if (prevQuery.rows.length === 0) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }
    const previousPmId = prevQuery.rows[0].assigned_pm_id;
    const prevStatus = prevQuery.rows[0].status;

    const updated = await client.query(
      `UPDATE projects SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, status, assigned_pm_id`,
      [status, id]
    );
    if (updated.rows.length === 0) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    const action = status === 'archived' ? 'project.archive' : 'project.unarchive';
    await client.query(
      `INSERT INTO audit_log (action, actor_id, target_type, target_id, metadata)
       VALUES ($1, $2, 'project', $3, $4)`,
      [action, actorId, id, JSON.stringify({ status })]
    );

    return { ...updated.rows[0], previousPmId, prevStatus };
  }).catch((err: unknown) => {
    if (err instanceof Error && (err as any).code === 'NOT_FOUND') {
      res.status(404).json({ error: 'Project not found' });
      return null;
    }
    throw err;
  });

  if (project) {
    if (project.prevStatus !== status && project.assigned_pm_id) {
      if (status === 'archived') {
        emitProjectUnassigned(project.assigned_pm_id, { id: project.id, name: project.name });
      } else {
        emitProjectAssigned(project.assigned_pm_id, { id: project.id, name: project.name });
      }
    }
    res.json(project);
  }
});

pgmRouter.get('/portfolio/export', async (req, res) => {
  const { where, values } = buildPortfolioFilters(req.query as any);
  const result = await db.query(
    `SELECT
       p.id AS project_id, p.name AS project_name, p.client_name, p.status AS project_status,
       p.project_start_date, p.project_end_date,
       COALESCE(pm.name, pm.email) AS pm_name,
       pub.*
     FROM projects p
     LEFT JOIN users pm ON pm.id = p.assigned_pm_id
     LEFT JOIN LATERAL (
       SELECT * FROM project_submissions
       WHERE project_id = p.id AND status = 'published'
       ORDER BY version DESC LIMIT 1
     ) pub ON true
     WHERE ${where}
     ORDER BY p.name`,
    values
  );

  const rows = result.rows;
  if (rows.length === 0) {
    res.setHeader('Content-Type', 'text/csv');
    res.send('No data');
    return;
  }

  const submissionIds = rows.map(r => r.id).filter(Boolean);
  if (submissionIds.length > 0) {
    const overrides = await db.query(
      `SELECT * FROM submission_overrides WHERE submission_id = ANY($1) ORDER BY created_at DESC`,
      [submissionIds]
    );
    const latestOverridesMap: Record<string, Record<string, string>> = {};
    for (const ovr of overrides.rows) {
      if (!latestOverridesMap[ovr.submission_id]) {
        latestOverridesMap[ovr.submission_id] = {};
      }
      if (!latestOverridesMap[ovr.submission_id][ovr.field_name]) {
        latestOverridesMap[ovr.submission_id][ovr.field_name] = ovr.override_value;
      }
    }
    for (const row of rows) {
      if (row.id && latestOverridesMap[row.id]) {
        for (const [field, val] of Object.entries(latestOverridesMap[row.id])) {
          row[field] = val;
        }
        row.rag_project_health = computeProjectHealth(
          row.rag_schedule,
          row.rag_budget,
          row.rag_scope,
          row.rag_resources,
          row.rag_timeline
        );
      }
    }
  }

  const headers = Object.keys(rows[0]);
  const csvRows = [headers.join(',')];
  for (const row of rows) {
    const vals = headers.map((header) => {
      const val = row[header];
      if (val === null || val === undefined) return '';
      let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      str = str.replace(/"/g, '""');
      return `"${str}"`;
    });
    csvRows.push(vals.join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="portfolio_export.csv"');
  res.send(csvRows.join('\n'));
});

// PATCH /pgm/projects/:projectId/submissions/:submissionId/milestones
// PgM can update milestones on any submission (including published) at any time
pgmRouter.patch('/projects/:projectId/submissions/:submissionId/milestones', async (req, res) => {
  const { projectId, submissionId } = req.params;
  const milestones = req.body;

  if (!Array.isArray(milestones)) {
    res.status(400).json({ error: 'Body must be an array of milestones' });
    return;
  }

  const result = await db.query(
    `UPDATE project_submissions
     SET milestones = $1::jsonb, updated_at = NOW()
     WHERE id = $2 AND project_id = $3
     RETURNING id, milestones`,
    [JSON.stringify(milestones), submissionId, projectId]
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Submission not found' });
    return;
  }

  await db.query(
    `INSERT INTO audit_log (action, actor_id, target_type, target_id, metadata)
     VALUES ('submission.milestones_updated', $1, 'submission', $2, $3)`,
    [req.user!.id, submissionId, JSON.stringify({ project_id: projectId, count: milestones.length })]
  );

  res.json(result.rows[0].milestones);
});
