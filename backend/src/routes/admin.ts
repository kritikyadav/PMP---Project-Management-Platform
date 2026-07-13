import { Router } from 'express';
import type { PoolClient } from 'pg';
import bcrypt from 'bcrypt';
import { db } from '../db';
import { requireAuth, requireRole } from '../middleware/rbac';
import { emitProjectAssigned, emitProjectUnassigned } from '../realtime';

export const adminRouter = Router();

adminRouter.use(requireAuth);
adminRouter.use(requireRole(['system_admin']));

const VALID_ROLES = ['system_admin', 'program_manager', 'pm', 'cxo', 'employee'];

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

// ─── Users ────────────────────────────────────────────────────────────────────

adminRouter.get('/users', async (req, res) => {
  const { role } = req.query as { role?: string };
  const query = role
    ? 'SELECT id, email, name, role, is_active FROM users WHERE role = $1 ORDER BY email'
    : 'SELECT id, email, name, role, is_active FROM users ORDER BY email';
  const params = role ? [role] : [];
  const result = await db.query(query, params);
  res.json(result.rows);
});

adminRouter.post('/users', async (req, res) => {
  const { email, name, role, password } = req.body as {
    email?: string;
    name?: string;
    role?: string;
    password?: string;
  };

  if (!email || !role || !password) {
    res.status(400).json({ error: 'email, role and password are required' });
    return;
  }
  if (!VALID_ROLES.includes(role)) {
    res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    return;
  }
  if (password.length < 8 || password.length > 50) {
    res.status(400).json({ error: 'password must be between 8 and 50 characters' });
    return;
  }

  const actorId = req.user!.id;
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const newUser = await withTransaction(async (client) => {
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
      if (existing.rows.length > 0) {
        throw Object.assign(new Error('Email already exists'), { code: 'DUPLICATE' });
      }

      const insert = await client.query(
        'INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, is_active',
        [email.toLowerCase(), name ?? null, role, passwordHash]
      );
      const user = insert.rows[0];

      await client.query(
        `INSERT INTO audit_log (action, actor_id, target_type, target_id, metadata)
         VALUES ('user.create', $1, 'user', $2, $3)`,
        [actorId, user.id, JSON.stringify({ email: user.email, role: user.role })]
      );

      return user;
    });

    res.status(201).json(newUser);
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException & { code?: string }).code === 'DUPLICATE') {
      res.status(409).json({ error: 'A user with this email already exists' });
      return;
    }
    throw err;
  }
});

adminRouter.patch('/users/:id/role', async (req, res) => {
  const { id } = req.params;
  const { role } = req.body as { role?: string };
  const actorId = req.user!.id;

  if (!role || !VALID_ROLES.includes(role)) {
    res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    return;
  }
  if (id === actorId) {
    res.status(400).json({ error: 'You cannot change your own role.' });
    return;
  }

  await withTransaction(async (client) => {
    const existing = await client.query('SELECT id, role FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }
    const prevRole: string = existing.rows[0].role;

    await client.query(
      'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2',
      [role, id]
    );

    await client.query(
      `INSERT INTO audit_log (action, actor_id, target_type, target_id, metadata)
       VALUES ('user.change_role', $1, 'user', $2, $3)`,
      [actorId, id, JSON.stringify({ from: prevRole, to: role })]
    );
  }).catch((err: unknown) => {
    if (err instanceof Error && (err as NodeJS.ErrnoException & { code?: string }).code === 'NOT_FOUND') {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    throw err;
  });

  if (!res.headersSent) res.json({ success: true });
});

adminRouter.patch('/users/:id/deactivate', async (req, res) => {
  const { id } = req.params;
  const actorId = req.user!.id;

  await withTransaction(async (client) => {
    const existing = await client.query('SELECT id, is_active FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    await client.query(
      'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1',
      [id]
    );

    await client.query(
      `INSERT INTO audit_log (action, actor_id, target_type, target_id)
       VALUES ('user.deactivate', $1, 'user', $2)`,
      [actorId, id]
    );
  }).catch((err: unknown) => {
    if (err instanceof Error && (err as NodeJS.ErrnoException & { code?: string }).code === 'NOT_FOUND') {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    throw err;
  });

  if (!res.headersSent) res.json({ success: true });
});

adminRouter.patch('/users/:id/activate', async (req, res) => {
  const { id } = req.params;
  const actorId = req.user!.id;

  await withTransaction(async (client) => {
    const existing = await client.query('SELECT id, is_active FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    await client.query(
      'UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1',
      [id]
    );

    await client.query(
      `INSERT INTO audit_log (action, actor_id, target_type, target_id)
       VALUES ('user.activate', $1, 'user', $2)`,
      [actorId, id]
    );
  }).catch((err: unknown) => {
    if (err instanceof Error && (err as NodeJS.ErrnoException & { code?: string }).code === 'NOT_FOUND') {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    throw err;
  });

  if (!res.headersSent) res.json({ success: true });
});

// ─── Projects ─────────────────────────────────────────────────────────────────

adminRouter.get('/projects', async (_req, res) => {
  const result = await db.query(`
    SELECT p.id, p.name, p.client_name, p.assigned_pm_id, p.status,
           u.name AS pm_name, u.email AS pm_email
    FROM projects p
    LEFT JOIN users u ON u.id = p.assigned_pm_id
    ORDER BY p.name
  `);
  res.json(result.rows);
});

adminRouter.post('/projects', async (req, res) => {
  const { name, client_name, assigned_pm_id } = req.body as {
    name?: string;
    client_name?: string;
    assigned_pm_id?: string;
  };
  const actorId = req.user!.id;

  if (!name || !client_name) {
    res.status(400).json({ error: 'name and client_name are required' });
    return;
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
      `INSERT INTO projects (name, client_name, assigned_pm_id, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, client_name, assigned_pm_id, status`,
      [name, client_name, assigned_pm_id ?? null, actorId]
    );
    const project = insert.rows[0];

    await client.query(
      `INSERT INTO audit_log (action, actor_id, target_type, target_id, metadata)
       VALUES ('project.create', $1, 'project', $2, $3)`,
      [actorId, project.id, JSON.stringify({ name, client_name })]
    );

    return project;
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

adminRouter.patch('/projects/:id/assign-pm', async (req, res) => {
  const { id } = req.params;
  const { pm_id } = req.body as { pm_id?: string };
  const actorId = req.user!.id;

  if (!pm_id) {
    res.status(400).json({ error: 'pm_id is required' });
    return;
  }

  const updatedProject = await withTransaction(async (client) => {
    const project = await client.query(
      `SELECT id, name, assigned_pm_id FROM projects WHERE id = $1 AND status = 'active'`,
      [id]
    );
    if (project.rows.length === 0) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }
    const previousPmId = project.rows[0].assigned_pm_id;

    const pm = await client.query(
      `SELECT id FROM users WHERE id = $1 AND role = 'pm' AND is_active = true`,
      [pm_id]
    );
    if (pm.rows.length === 0) {
      throw Object.assign(new Error('Invalid PM'), { code: 'INVALID_PM' });
    }

    const updated = await client.query(
      `UPDATE projects SET assigned_pm_id = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name`,
      [pm_id, id]
    );

    await client.query(
      `INSERT INTO audit_log (action, actor_id, target_type, target_id, metadata)
       VALUES ('project.assign_pm', $1, 'project', $2, $3)`,
       [actorId, id, JSON.stringify({ pm_id })]
    );

    return { ...updated.rows[0], previousPmId };
  }).catch((err: unknown) => {
    const code = (err as NodeJS.ErrnoException & { code?: string }).code;
    if (code === 'NOT_FOUND') { res.status(404).json({ error: 'Active project not found' }); return null; }
    if (code === 'INVALID_PM') { res.status(400).json({ error: 'pm_id must be an active user with role pm' }); return null; }
    throw err;
  });

  if (!res.headersSent) {
    if (updatedProject) {
      if (updatedProject.previousPmId && updatedProject.previousPmId !== pm_id) {
        emitProjectUnassigned(updatedProject.previousPmId, { id: updatedProject.id, name: updatedProject.name });
      }
      emitProjectAssigned(pm_id, updatedProject);
    }
    res.json({ success: true });
  }
});

adminRouter.patch('/projects/:id/archive', async (req, res) => {
  const { id } = req.params;
  const actorId = req.user!.id;

  const archivedProject = await withTransaction(async (client) => {
    const project = await client.query(
      `SELECT id, name, assigned_pm_id FROM projects WHERE id = $1`,
      [id]
    );
    if (project.rows.length === 0) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    await client.query(
      `UPDATE projects SET status = 'archived', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    await client.query(
      `INSERT INTO audit_log (action, actor_id, target_type, target_id)
       VALUES ('project.archive', $1, 'project', $2)`,
      [actorId, id]
    );
    return project.rows[0];
  }).catch((err: unknown) => {
    if (err instanceof Error && (err as NodeJS.ErrnoException & { code?: string }).code === 'NOT_FOUND') {
      res.status(404).json({ error: 'Project not found' });
      return null;
    }
    throw err;
  });

  if (archivedProject) {
    if (archivedProject.assigned_pm_id) {
      emitProjectUnassigned(archivedProject.assigned_pm_id, { id: archivedProject.id, name: archivedProject.name });
    }
    if (!res.headersSent) res.json({ success: true });
  }
});

adminRouter.patch('/projects/:id/unarchive', async (req, res) => {
  const { id } = req.params;
  const actorId = req.user!.id;

  const unarchivedProject = await withTransaction(async (client) => {
    const project = await client.query(
      `SELECT id, name, assigned_pm_id FROM projects WHERE id = $1`,
      [id]
    );
    if (project.rows.length === 0) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    await client.query(
      `UPDATE projects SET status = 'active', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    await client.query(
      `INSERT INTO audit_log (action, actor_id, target_type, target_id)
       VALUES ('project.unarchive', $1, 'project', $2)`,
      [actorId, id]
    );
    return project.rows[0];
  }).catch((err: unknown) => {
    if (err instanceof Error && (err as NodeJS.ErrnoException & { code?: string }).code === 'NOT_FOUND') {
      res.status(404).json({ error: 'Project not found' });
      return null;
    }
    throw err;
  });

  if (unarchivedProject) {
    if (unarchivedProject.assigned_pm_id) {
      emitProjectAssigned(unarchivedProject.assigned_pm_id, { id: unarchivedProject.id, name: unarchivedProject.name });
    }
    if (!res.headersSent) res.json({ success: true });
  }
});
