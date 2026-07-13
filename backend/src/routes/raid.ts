import { Router } from 'express';
import { db } from '../db';
import { requireAuth } from '../middleware/rbac';

export const raidRouter = Router();

raidRouter.use(requireAuth);

async function assertProjectAccess(
  projectId: string,
  userId: string,
  userRole: string
): Promise<boolean> {
  if (userRole === 'program_manager') return true;
  if (userRole === 'cxo') return true;
  if (userRole === 'pm') {
    const res = await db.query(
      `SELECT id FROM projects WHERE id = $1 AND assigned_pm_id = $2 AND status = 'active'`,
      [projectId, userId]
    );
    return res.rows.length > 0;
  }
  return false;
}

// GET /projects/:id/raid
raidRouter.get('/:id/raid', async (req, res) => {
  const { id } = req.params;
  const user = req.user!;

  const hasAccess = await assertProjectAccess(id, user.id, user.role);
  if (!hasAccess) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const result = await db.query(
    `SELECT * FROM raid_log WHERE project_id = $1 AND deleted_at IS NULL ORDER BY raid_seq_id ASC`,
    [id]
  );
  res.json(result.rows);
});

// POST /projects/:id/raid
raidRouter.post('/:id/raid', async (req, res) => {
  const { id } = req.params;
  const user = req.user!;

  if (user.role === 'cxo') {
    res.status(403).json({ error: 'CXO access is read-only' });
    return;
  }

  const hasAccess = await assertProjectAccess(id, user.id, user.role);
  if (!hasAccess) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const {
    type, date_raised, raised_by, title, description,
    impact, urgency, probability, priority, owner, status, mitigation,
  } = req.body as {
    type?: string;
    date_raised?: string;
    raised_by?: string;
    title?: string;
    description?: string;
    impact?: string;
    urgency?: string;
    probability?: string;
    priority?: string;
    owner?: string;
    status?: string;
    mitigation?: string;
  };

  if (!type || !title) {
    res.status(400).json({ error: 'type and title are required' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const seqRes = await client.query(
      `SELECT COALESCE(MAX(raid_seq_id), 0) + 1 AS next_seq FROM raid_log WHERE project_id = $1`,
      [id]
    );
    const nextSeq: number = seqRes.rows[0].next_seq;

    const actor = await client.query<{ display_name: string }>(
      `SELECT COALESCE(NULLIF(name, ''), email) AS display_name FROM users WHERE id = $1`,
      [user.id]
    );
    const resolvedRaisedBy = raised_by || actor.rows[0]?.display_name || user.email;
    const resolvedDateRaised = date_raised ?? new Date().toISOString().slice(0, 10);

    const insert = await client.query(
      `INSERT INTO raid_log
         (project_id, raid_seq_id, type, date_raised, raised_by, raised_by_id,
          title, description, impact, urgency, probability, priority, owner, status, mitigation, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        id, nextSeq, type,
        resolvedDateRaised, resolvedRaisedBy, user.id,
        title, description ?? null,
        impact ?? null, urgency ?? null, probability ?? null, priority ?? null,
        owner ?? null, status ?? 'Pending', mitigation ?? null,
        user.id,
      ]
    );

    await client.query('COMMIT');
    res.status(201).json(insert.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PUT /projects/:id/raid/:raidId
raidRouter.put('/:id/raid/:raidId', async (req, res) => {
  const { id, raidId } = req.params;
  const user = req.user!;

  if (user.role === 'cxo') {
    res.status(403).json({ error: 'CXO access is read-only' });
    return;
  }

  const hasAccess = await assertProjectAccess(id, user.id, user.role);
  if (!hasAccess) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const allowed = [
    'type', 'date_raised', 'raised_by', 'title', 'description',
    'impact', 'urgency', 'probability', 'priority', 'owner', 'status', 'mitigation',
  ];

  const updates: string[] = [];
  const params: any[] = [];

  for (const key of allowed) {
    if (key in req.body) {
      params.push(req.body[key]);
      updates.push(`${key} = $${params.length}`);
    }
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No updatable fields provided' });
    return;
  }

  params.push(raidId, id);
  const result = await db.query(
    `UPDATE raid_log
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${params.length - 1} AND project_id = $${params.length} AND deleted_at IS NULL
     RETURNING *`,
    params
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'RAID entry not found' });
    return;
  }

  res.json(result.rows[0]);
});

// DELETE /projects/:id/raid/:raidId
raidRouter.delete('/:id/raid/:raidId', async (req, res) => {
  const { id, raidId } = req.params;
  const user = req.user!;

  if (user.role === 'cxo') {
    res.status(403).json({ error: 'CXO access is read-only' });
    return;
  }

  const hasAccess = await assertProjectAccess(id, user.id, user.role);
  if (!hasAccess) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const result = await db.query(
    `UPDATE raid_log SET deleted_at = NOW() WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL RETURNING id`,
    [raidId, id]
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'RAID entry not found' });
    return;
  }

  res.status(204).send();
});
