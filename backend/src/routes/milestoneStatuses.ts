import { Router } from 'express';
import { db } from '../db';
import { requireAuth, requireRole } from '../middleware/rbac';

export const milestoneStatusesRouter = Router();

milestoneStatusesRouter.use(requireAuth);

// GET /milestone-statuses — any authenticated user
milestoneStatusesRouter.get('/', async (_req, res) => {
  const result = await db.query(
    `SELECT * FROM milestone_statuses WHERE deleted_at IS NULL ORDER BY label ASC`
  );
  res.json(result.rows);
});

// POST /milestone-statuses — PM, PgM only
milestoneStatusesRouter.post('/', requireRole(['pm', 'program_manager']), async (req, res) => {
  const { label } = req.body as { label?: string };
  const trimmed = label?.trim();
  if (!trimmed) {
    res.status(400).json({ error: 'label is required' });
    return;
  }

  try {
    const result = await db.query(
      `INSERT INTO milestone_statuses (label, created_by) VALUES ($1, $2) RETURNING *`,
      [trimmed, req.user!.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'A status with this label already exists' });
      return;
    }
    throw err;
  }
});

// PATCH /milestone-statuses/:id — creator or PgM
milestoneStatusesRouter.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { label } = req.body as { label?: string };
  const trimmed = label?.trim();
  if (!trimmed) {
    res.status(400).json({ error: 'label is required' });
    return;
  }

  const user = req.user!;
  const existing = await db.query(
    `SELECT id, created_by FROM milestone_statuses WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  if (existing.rows.length === 0) {
    res.status(404).json({ error: 'Status not found' });
    return;
  }

  if (existing.rows[0].created_by !== user.id && user.role !== 'program_manager') {
    res.status(403).json({ error: 'Only the creator or a Program Manager can rename this status' });
    return;
  }

  try {
    const result = await db.query(
      `UPDATE milestone_statuses SET label = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [trimmed, id]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'A status with this label already exists' });
      return;
    }
    throw err;
  }
});

// DELETE /milestone-statuses/:id — creator or PgM
milestoneStatusesRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const user = req.user!;

  const existing = await db.query(
    `SELECT id, created_by FROM milestone_statuses WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  if (existing.rows.length === 0) {
    res.status(404).json({ error: 'Status not found' });
    return;
  }

  if (existing.rows[0].created_by !== user.id && user.role !== 'program_manager') {
    res.status(403).json({ error: 'Only the creator or a Program Manager can delete this status' });
    return;
  }

  await db.query(`UPDATE milestone_statuses SET deleted_at = NOW() WHERE id = $1`, [id]);
  res.status(204).send();
});
