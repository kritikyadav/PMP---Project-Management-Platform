import { Router } from 'express';
import type { PoolClient } from 'pg';
import { db } from '../db';
import { requireAuth, requireRole } from '../middleware/rbac';
import { emitProjectPublished } from '../realtime';
import { computeProjectHealth } from '../utils/projectHealth';

export const pmRouter = Router();

pmRouter.use(requireAuth);

// GET /pm/team-members
pmRouter.get('/team-members', requireRole(['pm', 'program_manager']), async (_req, res) => {
  const result = await db.query(
    `SELECT id, email, name, role, ms_department, ms_job_title
     FROM users
     ORDER BY COALESCE(name, email)`
  );
  res.json(result.rows);
});

// GET /pm/members/:userId/allocation
pmRouter.get('/members/:userId/allocation', requireRole(['pm', 'program_manager']), async (req, res) => {
  const { userId } = req.params;
  const excludeProjectId = (req.query.exclude_project_id as string) || null;

  const result = await db.query<{
    project_id: string;
    project_name: string;
    allocation_percentage: string;
  }>(
    `SELECT
       p.id AS project_id,
       p.name AS project_name,
       (member->>'allocation_percentage')::numeric AS allocation_percentage
     FROM projects p
     CROSS JOIN LATERAL jsonb_array_elements(p.team_members) AS member
     WHERE p.status = 'active'
       AND ($1::uuid IS NULL OR p.id != $1::uuid)
       AND member->>'user_id' = $2
       AND (member->>'allocation_percentage') IS NOT NULL
       AND (member->>'allocation_percentage')::numeric > 0`,
    [excludeProjectId, userId]
  );

  const projects = result.rows.map((r) => ({
    project_id: r.project_id,
    project_name: r.project_name,
    allocation_percentage: parseFloat(r.allocation_percentage),
  }));
  const total_allocated = projects.reduce((s, r) => s + r.allocation_percentage, 0);
  res.json({ total_allocated, available: 100 - total_allocated, projects });
});

pmRouter.use(requireRole(['pm']));

const SECTION_FIELDS = [
  'sprint_name', 'sprint_start_date', 'sprint_end_date',
  'stakeholder_name', 'tech_team_size',
  'rag_schedule', 'rag_schedule_comment',
  'rag_budget', 'rag_budget_comment',
  'rag_scope', 'rag_scope_comment',
  'rag_resources', 'rag_resources_comment',
  'rag_timeline', 'rag_timeline_comment',
  'milestones',
  'overview', 'business_coordination',
  'feature_releases', 'development_uat',
  'ongoing_work', 'upcoming_deliverables',
  'team_structure',
] as const;

const REQUIRED_FOR_PUBLISH = [
  'sprint_name', 'sprint_start_date', 'sprint_end_date',
  'tech_team_size',
  'rag_schedule', 'rag_budget', 'rag_scope', 'rag_resources', 'rag_timeline',
];

const VALID_RAG = ['green', 'amber', 'red'];
const RAG_STATUS_FIELDS = ['rag_schedule', 'rag_budget', 'rag_scope', 'rag_resources', 'rag_timeline'];

type SubmissionBody = { [K in (typeof SECTION_FIELDS)[number]]?: any };

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

function buildFieldParams(body: SubmissionBody) {
  const DATE_FIELDS = new Set(['sprint_start_date', 'sprint_end_date']);
  return SECTION_FIELDS.map((f) => {
    const v = body[f];
    if (f === 'tech_team_size') return v != null && v !== '' ? Number(v) : null;
    if (f === 'team_structure') return v ? JSON.stringify(v) : '[]';
    if (f === 'milestones') return v ? JSON.stringify(v) : '[]';
    if (DATE_FIELDS.has(f)) return v != null && v !== '' ? (v as string).slice(0, 10) : null;
    return v != null && v !== '' ? v : null;
  });
}

function computeHealth(body: SubmissionBody): string | null {
  return computeProjectHealth(
    body.rag_schedule as string,
    body.rag_budget as string,
    body.rag_scope as string,
    body.rag_resources as string,
    body.rag_timeline as string
  );
}

async function checkTeamAllocation(
  projectId: string,
  teamStructure: any[]
): Promise<{ violations: any[] }> {
  const membersWithAllocation = teamStructure.filter(
    (m) => m.user_id && m.allocation_percentage != null && Number(m.allocation_percentage) > 0
  );
  if (membersWithAllocation.length === 0) return { violations: [] };

  const userIds = membersWithAllocation.map((m) => m.user_id as string);

  const result = await db.query<{ user_id: string; committed: string }>(
    `SELECT
       member->>'user_id' AS user_id,
       COALESCE(SUM((member->>'allocation_percentage')::numeric), 0) AS committed
     FROM projects p
     CROSS JOIN LATERAL jsonb_array_elements(p.team_members) AS member
     WHERE p.status = 'active'
       AND p.id != $1
       AND member->>'user_id' = ANY($2::text[])
       AND (member->>'allocation_percentage') IS NOT NULL
     GROUP BY member->>'user_id'`,
    [projectId, userIds]
  );

  const committedMap = new Map(
    result.rows.map((r) => [r.user_id, parseFloat(r.committed)])
  );

  // Sum up requested allocations for each user in the current team structure
  const currentRequestedMap = new Map<string, number>();
  for (const m of membersWithAllocation) {
    const userId = m.user_id as string;
    const currentAlloc = currentRequestedMap.get(userId) ?? 0;
    currentRequestedMap.set(userId, currentAlloc + Number(m.allocation_percentage));
  }

  const violations = membersWithAllocation
    .filter((m) => {
      const committed = committedMap.get(m.user_id as string) ?? 0;
      const requestedTotal = currentRequestedMap.get(m.user_id as string) ?? 0;
      return committed + requestedTotal > 100;
    })
    .map((m) => {
      const committed = committedMap.get(m.user_id as string) ?? 0;
      const requestedTotal = currentRequestedMap.get(m.user_id as string) ?? 0;
      return {
        user_id: m.user_id,
        employee_name: m.employee_name,
        requested: requestedTotal,
        committed,
        available: 100 - committed,
      };
    });

  return { violations };
}

// GET /pm/projects
pmRouter.get('/projects', async (req, res) => {
  const pmId = req.user!.id;

  const result = await db.query(
    `SELECT
     p.id, p.name, p.client_name,
       p.project_start_date, p.project_end_date,
       p.engagement_type, p.methodology,
       draft.id         AS draft_id,
       draft.updated_at AS draft_updated_at,
       pub.version      AS published_version,
       pub.updated_at   AS published_updated_at,
       pub.sprint_start_date AS published_sprint_start_date,
       overridden.rag_project_health,
       overridden.rag_schedule,
       overridden.rag_budget,
       overridden.rag_scope,
       overridden.rag_resources,
       overridden.rag_timeline,
       pub.tech_team_size
     FROM projects p
     LEFT JOIN project_submissions draft
       ON draft.project_id = p.id
      AND draft.submitted_by = $1
      AND draft.status = 'draft'
     LEFT JOIN LATERAL (
       SELECT id, version, updated_at, sprint_start_date,
              rag_project_health, rag_schedule, rag_budget, rag_scope, rag_resources, rag_timeline, tech_team_size
       FROM project_submissions
       WHERE project_id = p.id AND submitted_by = $1 AND status = 'published'
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
     WHERE p.assigned_pm_id = $1 AND p.status = 'active'
     ORDER BY p.name`,
    [pmId]
  );

  res.json(result.rows);
});

// GET /pm/projects/:id/submission
pmRouter.get('/projects/:id/submission', async (req, res) => {
  const pmId = req.user!.id;
  const { id } = req.params;

  const project = await db.query(
    `SELECT id, team_members FROM projects WHERE id = $1 AND assigned_pm_id = $2 AND status = 'active'`,
    [id, pmId]
  );
  if (project.rows.length === 0) {
    res.status(404).json({ error: 'Project not found or not assigned to you' });
    return;
  }

  const result = await db.query(
    `SELECT * FROM project_submissions
     WHERE project_id = $1 AND submitted_by = $2
     ORDER BY
       CASE WHEN status = 'draft' THEN 0 ELSE 1 END,
       version DESC
     LIMIT 1`,
    [id, pmId]
  );

  res.json(result.rows[0] ?? null);
});

// PUT /pm/projects/:id/submission/draft
pmRouter.put('/projects/:id/submission/draft', async (req, res) => {
  const pmId = req.user!.id;
  const { id } = req.params;
  const body = req.body as SubmissionBody;

  const project = await db.query(
    `SELECT id FROM projects WHERE id = $1 AND assigned_pm_id = $2 AND status = 'active'`,
    [id, pmId]
  );
  if (project.rows.length === 0) {
    res.status(404).json({ error: 'Project not found or not assigned to you' });
    return;
  }

  if (body.team_structure && Array.isArray(body.team_structure)) {
    const { violations } = await checkTeamAllocation(id, body.team_structure);
    if (violations.length > 0) {
      res.status(400).json({ error: 'Over-allocation detected', violations });
      return;
    }
  }

  const bodyForSave = { ...body };
  if (bodyForSave.team_structure === undefined) {
    bodyForSave.team_structure = project.rows[0].team_members ?? [];
  }

  const fields = buildFieldParams(bodyForSave);
  const health = computeHealth(bodyForSave);

  const submission = await withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT id FROM project_submissions WHERE project_id = $1 AND submitted_by = $2 AND status = 'draft'`,
      [id, pmId]
    );

    if (existing.rows.length > 0) {
      const draftId = existing.rows[0].id;
      const setClauses = [...SECTION_FIELDS.map((f, i) => `${f} = $${i + 1}`), `rag_project_health = $${SECTION_FIELDS.length + 1}`].join(', ');
      const updated = await client.query(
        `UPDATE project_submissions SET ${setClauses}, updated_at = NOW() WHERE id = $${SECTION_FIELDS.length + 2} RETURNING *`,
        [...fields, health, draftId]
      );
      return updated.rows[0];
    }

    const versionRes = await client.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM project_submissions WHERE project_id = $1 AND submitted_by = $2`,
      [id, pmId]
    );
    const nextVersion = versionRes.rows[0].next_version;

    const cols = ['project_id', 'submitted_by', 'status', 'version', ...SECTION_FIELDS, 'rag_project_health'].join(', ');
    const placeholders = ['$1', '$2', "'draft'", '$3', ...SECTION_FIELDS.map((_, i) => `$${i + 4}`), `$${SECTION_FIELDS.length + 4}`].join(', ');
    const inserted = await client.query(
      `INSERT INTO project_submissions (${cols}) VALUES (${placeholders}) RETURNING *`,
      [id, pmId, nextVersion, ...fields, health]
    );
    return inserted.rows[0];
  });

  res.json(submission);
});

// POST /pm/projects/:id/submission/publish
pmRouter.post('/projects/:id/submission/publish', async (req, res) => {
  const pmId = req.user!.id;
  const { id } = req.params;
  const body = req.body as SubmissionBody;

  const project = await db.query(
    `SELECT id FROM projects WHERE id = $1 AND assigned_pm_id = $2 AND status = 'active'`,
    [id, pmId]
  );
  if (project.rows.length === 0) {
    res.status(404).json({ error: 'Project not found or not assigned to you' });
    return;
  }

  const missing = REQUIRED_FOR_PUBLISH.filter((f) => {
    const v = body[f as keyof SubmissionBody];
    return v === undefined || v === null || v === '';
  });
  if (missing.length > 0) {
    res.status(400).json({ error: 'Missing required fields', fields: missing });
    return;
  }

  for (const field of RAG_STATUS_FIELDS) {
    const v = body[field as keyof SubmissionBody] as string;
    if (!VALID_RAG.includes(v)) {
      res.status(400).json({ error: `Invalid RAG value for ${field}`, valid: VALID_RAG });
      return;
    }
  }

  if (body.team_structure && Array.isArray(body.team_structure)) {
    const { violations } = await checkTeamAllocation(id, body.team_structure);
    if (violations.length > 0) {
      res.status(400).json({ error: 'Over-allocation detected', violations });
      return;
    }
  }

  const fields = buildFieldParams(body);
  const health = computeHealth(body);

  const published = await withTransaction(async (client) => {
    const draft = await client.query(
      `SELECT id, version FROM project_submissions WHERE project_id = $1 AND submitted_by = $2 AND status = 'draft'`,
      [id, pmId]
    );
    if (draft.rows.length === 0) {
      throw Object.assign(new Error('No draft to publish'), { code: 'NO_DRAFT' });
    }

    const draftId = draft.rows[0].id;
    const setClauses = [
      ...SECTION_FIELDS.map((f, i) => `${f} = $${i + 1}`),
      `rag_project_health = $${SECTION_FIELDS.length + 1}`,
    ].join(', ');

    const sameWeekRes = await client.query(
      `SELECT id FROM project_submissions
       WHERE project_id = $1 AND submitted_by = $2 AND status = 'published'
         AND sprint_start_date IS NOT NULL
         AND date_trunc('week', sprint_start_date::date) = date_trunc('week', $3::date)
       ORDER BY version DESC LIMIT 1`,
      [id, pmId, (body.sprint_start_date as string)?.slice(0, 10) ?? null]
    );

    if (sameWeekRes.rows.length > 0) {
      throw Object.assign(
        new Error('A published report already exists for this sprint week. Contact your Program Manager to make changes.'),
        { code: 'WEEK_ALREADY_PUBLISHED' }
      );
    }

    const result = await client.query(
      `UPDATE project_submissions SET ${setClauses}, status = 'published', updated_at = NOW()
       WHERE id = $${SECTION_FIELDS.length + 2} RETURNING *`,
      [...fields, health, draftId]
    );

    await client.query(
      `INSERT INTO audit_log (action, actor_id, target_type, target_id, metadata)
       VALUES ('project.publish', $1, 'submission', $2, $3)`,
      [pmId, result.rows[0].id, JSON.stringify({ project_id: id, version: result.rows[0].version })]
    );

    return result.rows[0];
  }).catch((err: unknown) => {
    const code = err instanceof Error ? (err as NodeJS.ErrnoException & { code?: string }).code : undefined;
    if (code === 'NO_DRAFT') {
      res.status(400).json({ error: 'No draft found. Save a draft first before publishing.' });
      return null;
    }
    if (code === 'WEEK_ALREADY_PUBLISHED') {
      res.status(409).json({ error: (err as Error).message });
      return null;
    }
    console.error('Publish error:', err);
    res.status(500).json({ error: 'Internal server error' });
    return null;
  });

  if (published) {
    emitProjectPublished(published);
    res.json(published);
  }
});

// GET /pm/projects/:id/overrides
pmRouter.get('/projects/:id/overrides', async (req, res) => {
  const pmId = req.user!.id;
  const { id } = req.params;

  const project = await db.query(
    `SELECT id FROM projects WHERE id = $1 AND assigned_pm_id = $2 AND status = 'active'`,
    [id, pmId]
  );
  if (project.rows.length === 0) {
    res.status(404).json({ error: 'Project not found or not assigned to you' });
    return;
  }

  const result = await db.query(
    `SELECT so.* FROM submission_overrides so
     WHERE so.submission_id = (
       SELECT id FROM project_submissions
       WHERE project_id = $1 AND submitted_by = $2 AND status = 'published'
       ORDER BY version DESC LIMIT 1
     )
     ORDER BY so.field_name`,
    [id, pmId]
  );

  res.json(result.rows);
});
