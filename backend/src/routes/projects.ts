import { Router } from 'express';
import type { PoolClient } from 'pg';
import { db } from '../db';
import { requireAuth, requireRole } from '../middleware/rbac';
import { emitProjectAssigned } from '../realtime';

export const projectsRouter = Router();

const PROJECT_CREATOR_ROLES = ['system_admin', 'program_manager', 'pm'];

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

projectsRouter.use(requireAuth);

projectsRouter.get('/available-pms', requireRole(PROJECT_CREATOR_ROLES), async (_req, res) => {
  const result = await db.query(
    `SELECT id, email, name
     FROM users
     WHERE role = 'pm' AND is_active = true
     ORDER BY COALESCE(name, email)`,
  );
  res.json(result.rows);
});

projectsRouter.post('/', requireRole(PROJECT_CREATOR_ROLES), async (req, res) => {
  const { name, client_name, assigned_pm_id, engagement_type, methodology, stakeholders, milestones } = req.body as {
    name?: string;
    client_name?: string;
    assigned_pm_id?: string;
    engagement_type?: string;
    methodology?: string;
    stakeholders?: unknown;
    milestones?: unknown;
  };

  const trimmedName = name?.trim();
  const trimmedClientName = client_name?.trim();

  if (!trimmedName) {
    res.status(400).json({ error: 'Project name is required' });
    return;
  }
  if (!trimmedClientName) {
    res.status(400).json({ error: 'Client name is required' });
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

  const actorId = req.user!.id;

  const project = await withTransaction(async (client) => {
    if (assigned_pm_id) {
      const pm = await client.query(
        `SELECT id FROM users WHERE id = $1 AND role = 'pm' AND is_active = true`,
        [assigned_pm_id],
      );
      if (pm.rows.length === 0) {
        throw Object.assign(new Error('Invalid PM'), { code: 'INVALID_PM' });
      }
    }

    const insert = await client.query(
      `INSERT INTO projects (name, client_name, assigned_pm_id, engagement_type, methodology, stakeholders, milestones, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
       RETURNING id, name, client_name, assigned_pm_id, engagement_type, methodology, stakeholders, milestones, status`,
      [trimmedName, trimmedClientName, assigned_pm_id || null, engagement_type, methodology, JSON.stringify(stakeholders ?? []), JSON.stringify(milestones ?? []), actorId],
    );
    const createdProject = insert.rows[0];

    await client.query(
      `INSERT INTO audit_log (action, actor_id, target_type, target_id, metadata)
       VALUES ('project.create', $1, 'project', $2, $3)`,
      [
        actorId,
        createdProject.id,
        JSON.stringify({
          name: createdProject.name,
          client_name: createdProject.client_name,
          assigned_pm_id: createdProject.assigned_pm_id,
          source: 'shared-projects-route',
        }),
      ],
    );

    return createdProject;
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

// PATCH /projects/:id/dates — PM (assigned) or PgM
projectsRouter.patch('/:id/dates', requireRole(['pm', 'program_manager']), async (req, res) => {
  const user = req.user!;
  const { id } = req.params;
  const { project_start_date, project_end_date } = req.body as {
    project_start_date?: string | null;
    project_end_date?: string | null;
  };

  if (user.role === 'pm') {
    const check = await db.query(
      `SELECT id FROM projects WHERE id = $1 AND assigned_pm_id = $2 AND status = 'active'`,
      [id, user.id]
    );
    if (check.rows.length === 0) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
  }

  if (
    project_start_date &&
    project_end_date &&
    new Date(project_end_date) < new Date(project_start_date)
  ) {
    res.status(400).json({ error: 'project_end_date cannot be before project_start_date' });
    return;
  }

  const setClauses: string[] = [];
  const params: any[] = [];

  if ('project_start_date' in req.body) {
    const d = project_start_date;
    params.push(d ? (d as string).slice(0, 10) : null);
    setClauses.push(`project_start_date = $${params.length}`);
  }
  if ('project_end_date' in req.body) {
    const d = project_end_date;
    params.push(d ? (d as string).slice(0, 10) : null);
    setClauses.push(`project_end_date = $${params.length}`);
  }

  if (setClauses.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  params.push(id);
  const result = await db.query(
    `UPDATE projects SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE id = $${params.length}
     RETURNING id, name, project_start_date, project_end_date`,
    params
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  res.json(result.rows[0]);
});

// GET /projects/:id/stakeholders
projectsRouter.get('/:id/stakeholders', async (req, res) => {
  const { id } = req.params;
  const user = req.user!;

  if (!['pm', 'program_manager', 'cxo'].includes(user.role)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  if (user.role === 'pm') {
    const check = await db.query(
      `SELECT id FROM projects WHERE id = $1 AND assigned_pm_id = $2`,
      [id, user.id]
    );
    if (check.rows.length === 0) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
  }

  const result = await db.query(`SELECT stakeholders FROM projects WHERE id = $1`, [id]);
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(result.rows[0].stakeholders ?? []);
});

// PUT /projects/:id/stakeholders
projectsRouter.put('/:id/stakeholders', requireRole(['pm', 'program_manager']), async (req, res) => {
  const { id } = req.params;
  const user = req.user!;
  const stakeholders = req.body;

  if (!Array.isArray(stakeholders)) {
    res.status(400).json({ error: 'Body must be an array of stakeholders' });
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

  if (user.role === 'pm') {
    const check = await db.query(
      `SELECT id FROM projects WHERE id = $1 AND assigned_pm_id = $2`,
      [id, user.id]
    );
    if (check.rows.length === 0) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
  }

  const result = await db.query(
    `UPDATE projects SET stakeholders = $1::jsonb, updated_at = NOW()
     WHERE id = $2 RETURNING stakeholders`,
    [JSON.stringify(stakeholders), id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(result.rows[0].stakeholders);
});

// GET /projects/:id/milestones
projectsRouter.get('/:id/milestones', async (req, res) => {
  const { id } = req.params;
  const user = req.user!;

  if (!['pm', 'program_manager', 'cxo'].includes(user.role)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  if (user.role === 'pm') {
    const check = await db.query(
      `SELECT id FROM projects WHERE id = $1 AND assigned_pm_id = $2`,
      [id, user.id]
    );
    if (check.rows.length === 0) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
  }

  const result = await db.query(`SELECT milestones FROM projects WHERE id = $1`, [id]);
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(result.rows[0].milestones ?? []);
});

// PUT /projects/:id/milestones
projectsRouter.put('/:id/milestones', requireRole(['pm', 'program_manager']), async (req, res) => {
  const { id } = req.params;
  const user = req.user!;
  const milestones = req.body;

  if (!Array.isArray(milestones)) {
    res.status(400).json({ error: 'Body must be an array of milestones' });
    return;
  }

  if (user.role === 'pm') {
    const check = await db.query(
      `SELECT id FROM projects WHERE id = $1 AND assigned_pm_id = $2`,
      [id, user.id]
    );
    if (check.rows.length === 0) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
  }

  const result = await db.query(
    `UPDATE projects SET milestones = $1::jsonb, updated_at = NOW()
     WHERE id = $2 RETURNING milestones`,
    [JSON.stringify(milestones), id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(result.rows[0].milestones);
});

// GET /projects/:id/team-members
projectsRouter.get('/:id/team-members', requireRole(['pm', 'program_manager']), async (req, res) => {
  const { id } = req.params;
  const user = req.user!;

  if (user.role === 'pm') {
    const check = await db.query(
      `SELECT id FROM projects WHERE id = $1 AND assigned_pm_id = $2`,
      [id, user.id]
    );
    if (check.rows.length === 0) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
  }

  const result = await db.query(`SELECT team_members FROM projects WHERE id = $1`, [id]);
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(result.rows[0].team_members ?? []);
});

// PUT /projects/:id/team-members
projectsRouter.put('/:id/team-members', requireRole(['pm', 'program_manager']), async (req, res) => {
  const { id } = req.params;
  const user = req.user!;
  const teamMembers = req.body;

  if (!Array.isArray(teamMembers)) {
    res.status(400).json({ error: 'Body must be an array of team members' });
    return;
  }

  if (user.role === 'pm') {
    const check = await db.query(
      `SELECT id FROM projects WHERE id = $1 AND assigned_pm_id = $2`,
      [id, user.id]
    );
    if (check.rows.length === 0) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
  }

  const result = await db.query(
    `UPDATE projects SET team_members = $1::jsonb, updated_at = NOW()
     WHERE id = $2 RETURNING team_members`,
    [JSON.stringify(teamMembers), id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(result.rows[0].team_members);
});

// PATCH /projects/:id/metadata — PM (assigned) or PgM
projectsRouter.patch('/:id/metadata', requireRole(['pm', 'program_manager']), async (req, res) => {
  const user = req.user!;
  const { id } = req.params;
  const { engagement_type, methodology } = req.body as {
    engagement_type?: string;
    methodology?: string;
  };

  const VALID_ENGAGEMENT = ['Fixed Cost', 'T&M', 'Hybrid'];
  const VALID_METHODOLOGY = ['Agile', 'Waterfall'];

  if (engagement_type !== undefined && !VALID_ENGAGEMENT.includes(engagement_type)) {
    res.status(400).json({ error: 'engagement_type must be one of: Fixed Cost, T&M, Hybrid' });
    return;
  }
  if (methodology !== undefined && !VALID_METHODOLOGY.includes(methodology)) {
    res.status(400).json({ error: 'methodology must be one of: Agile, Waterfall' });
    return;
  }

  const setClauses: string[] = [];
  const params: any[] = [];

  if (engagement_type !== undefined) {
    params.push(engagement_type);
    setClauses.push(`engagement_type = $${params.length}`);
  }
  if (methodology !== undefined) {
    params.push(methodology);
    setClauses.push(`methodology = $${params.length}`);
  }

  if (setClauses.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  if (user.role === 'pm') {
    const check = await db.query(
      `SELECT id FROM projects WHERE id = $1 AND assigned_pm_id = $2 AND status = 'active'`,
      [id, user.id]
    );
    if (check.rows.length === 0) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
  }

  params.push(id);
  const result = await db.query(
    `UPDATE projects SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE id = $${params.length}
     RETURNING id, engagement_type, methodology`,
    params
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  await db.query(
    `INSERT INTO audit_log (action, actor_id, target_type, target_id, metadata)
     VALUES ('project.update_metadata', $1, 'project', $2, $3)`,
    [user.id, id, JSON.stringify({ engagement_type, methodology })]
  );

  res.json(result.rows[0]);
});
