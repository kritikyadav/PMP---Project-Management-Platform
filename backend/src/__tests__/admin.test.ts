jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock('../db', () => ({
  db: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock('../middleware/rbac', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'admin-id', email: 'admin@test.com', role: 'system_admin', assignedProjectIds: [] };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

import request from 'supertest';
import express from 'express';
import bcrypt from 'bcrypt';
import { db } from '../db';
import { adminRouter } from '../routes/admin';

const mockDb = db as unknown as { query: jest.Mock; connect: jest.Mock };

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  return app;
}

function makeMockClient(queryResponses: Array<{ rows: unknown[] }>) {
  let call = 0;
  const query = jest.fn().mockImplementation(() => Promise.resolve(queryResponses[call++] ?? { rows: [] }));
  const release = jest.fn();
  return { query, release };
}

describe('GET /admin/users', () => {
  it('returns list of users', async () => {
    const users = [{ id: '1', email: 'a@test.com', name: 'A', role: 'pm', is_active: true }];
    mockDb.query.mockResolvedValueOnce({ rows: users });

    const res = await request(buildApp()).get('/admin/users');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(users);
  });

  it('filters by role query param', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).get('/admin/users?role=pm');
    expect(res.status).toBe(200);
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE role = $1'),
      ['pm']
    );
  });
});

describe('POST /admin/users', () => {
  const newUser = { id: 'new-id', email: 'pm@test.com', name: 'PM User', role: 'pm', is_active: true };

  beforeEach(() => jest.clearAllMocks());

  it('creates a user successfully', async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValueOnce('hashed-pw');
    const client = makeMockClient([
      { rows: [] },         // BEGIN
      { rows: [] },         // SELECT (no duplicate)
      { rows: [newUser] },  // INSERT users
      { rows: [] },         // INSERT audit_log
      { rows: [] },         // COMMIT
    ]);
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(buildApp())
      .post('/admin/users')
      .send({ email: 'pm@test.com', name: 'PM User', role: 'pm', password: 'Password123' });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe('pm@test.com');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("VALUES ('user.create'"),
      expect.arrayContaining(['admin-id', newUser.id])
    );
  });

  it('rejects duplicate email with 409', async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValueOnce('hashed-pw');
    const client = makeMockClient([
      { rows: [] },                           // BEGIN
      { rows: [{ id: 'existing-id' }] },      // SELECT finds existing
      { rows: [] },                           // ROLLBACK
    ]);
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(buildApp())
      .post('/admin/users')
      .send({ email: 'pm@test.com', role: 'pm', password: 'Password123' });

    expect(res.status).toBe(409);
  });

  it('rejects missing email with 400', async () => {
    const res = await request(buildApp())
      .post('/admin/users')
      .send({ role: 'pm' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid role with 400', async () => {
    const res = await request(buildApp())
      .post('/admin/users')
      .send({ email: 'x@test.com', role: 'hacker', password: 'Password123' });
    expect(res.status).toBe(400);
  });

  it('rejects missing password with 400', async () => {
    const res = await request(buildApp())
      .post('/admin/users')
      .send({ email: 'pm@test.com', role: 'pm' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('password');
  });

  it('rejects password shorter than 8 characters or longer than 50 characters with 400', async () => {
    let res = await request(buildApp())
      .post('/admin/users')
      .send({ email: 'pm@test.com', role: 'pm', password: 'short7' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('between 8 and 50 characters');

    res = await request(buildApp())
      .post('/admin/users')
      .send({ email: 'pm@test.com', role: 'pm', password: 'a'.repeat(51) });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('between 8 and 50 characters');
  });
});

describe('PATCH /admin/users/:id/deactivate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deactivates an existing user', async () => {
    const client = makeMockClient([
      { rows: [] },                         // BEGIN
      { rows: [{ id: 'user-1', is_active: true }] }, // SELECT
      { rows: [] },                         // UPDATE
      { rows: [] },                         // INSERT audit_log
      { rows: [] },                         // COMMIT
    ]);
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(buildApp()).patch('/admin/users/user-1/deactivate');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("VALUES ('user.deactivate'"),
      ['admin-id', 'user-1']
    );
  });

  it('returns 404 for unknown user', async () => {
    const client = makeMockClient([
      { rows: [] }, // BEGIN
      { rows: [] }, // SELECT returns nothing
      { rows: [] }, // ROLLBACK
    ]);
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(buildApp()).patch('/admin/users/nonexistent/deactivate');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /admin/users/:id/activate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('activates an existing user', async () => {
    const client = makeMockClient([
      { rows: [] },                         // BEGIN
      { rows: [{ id: 'user-1', is_active: false }] }, // SELECT
      { rows: [] },                         // UPDATE
      { rows: [] },                         // INSERT audit_log
      { rows: [] },                         // COMMIT
    ]);
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(buildApp()).patch('/admin/users/user-1/activate');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("VALUES ('user.activate'"),
      ['admin-id', 'user-1']
    );
  });

  it('returns 404 for unknown user', async () => {
    const client = makeMockClient([
      { rows: [] }, // BEGIN
      { rows: [] }, // SELECT returns nothing
      { rows: [] }, // ROLLBACK
    ]);
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(buildApp()).patch('/admin/users/nonexistent/activate');
    expect(res.status).toBe(404);
  });
});

describe('POST /admin/projects', () => {
  const newProject = { id: 'proj-1', name: 'Alpha', client_name: 'ACME', assigned_pm_id: null, status: 'active' };

  beforeEach(() => jest.clearAllMocks());

  it('creates a project without a PM', async () => {
    const client = makeMockClient([
      { rows: [] },             // BEGIN
      { rows: [newProject] },   // INSERT projects
      { rows: [] },             // INSERT audit_log
      { rows: [] },             // COMMIT
    ]);
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(buildApp())
      .post('/admin/projects')
      .send({ name: 'Alpha', client_name: 'ACME' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Alpha');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("VALUES ('project.create'"),
      expect.arrayContaining(['admin-id', newProject.id])
    );
  });

  it('creates a project and assigns a valid PM', async () => {
    const client = makeMockClient([
      { rows: [] },                        // BEGIN
      { rows: [{ id: 'pm-1' }] },          // SELECT PM (valid)
      { rows: [{ ...newProject, assigned_pm_id: 'pm-1' }] }, // INSERT
      { rows: [] },                        // INSERT audit_log
      { rows: [] },                        // COMMIT
    ]);
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(buildApp())
      .post('/admin/projects')
      .send({ name: 'Alpha', client_name: 'ACME', assigned_pm_id: 'pm-1' });

    expect(res.status).toBe(201);
  });

  it('rejects assigning an invalid or inactive PM', async () => {
    const client = makeMockClient([
      { rows: [] },  // BEGIN
      { rows: [] },  // SELECT PM → not found / not active
      { rows: [] },  // ROLLBACK
    ]);
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(buildApp())
      .post('/admin/projects')
      .send({ name: 'Alpha', client_name: 'ACME', assigned_pm_id: 'bad-id' });

    expect(res.status).toBe(400);
  });

  it('rejects missing required fields with 400', async () => {
    const res = await request(buildApp())
      .post('/admin/projects')
      .send({ name: 'Alpha' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /admin/projects/:id/assign-pm', () => {
  beforeEach(() => jest.clearAllMocks());

  it('assigns a PM to a project (replacing any existing PM)', async () => {
    const client = makeMockClient([
      { rows: [] },                    // BEGIN
      { rows: [{ id: 'proj-1' }] },    // SELECT project
      { rows: [{ id: 'pm-1' }] },      // SELECT PM (valid)
      { rows: [] },                    // UPDATE
      { rows: [] },                    // INSERT audit_log
      { rows: [] },                    // COMMIT
    ]);
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(buildApp())
      .patch('/admin/projects/proj-1/assign-pm')
      .send({ pm_id: 'pm-1' });

    expect(res.status).toBe(200);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE projects SET assigned_pm_id'),
      ['pm-1', 'proj-1']
    );
  });

  it('returns 404 for archived/missing project', async () => {
    const client = makeMockClient([
      { rows: [] }, // BEGIN
      { rows: [] }, // SELECT project → not found
      { rows: [] }, // ROLLBACK
    ]);
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(buildApp())
      .patch('/admin/projects/nonexistent/assign-pm')
      .send({ pm_id: 'pm-1' });

    expect(res.status).toBe(404);
  });

  it('returns 400 if pm_id is missing', async () => {
    const res = await request(buildApp())
      .patch('/admin/projects/proj-1/assign-pm')
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('PATCH /admin/projects/:id/archive', () => {
  beforeEach(() => jest.clearAllMocks());

  it('archives an active project', async () => {
    const client = makeMockClient([
      { rows: [] },                    // BEGIN
      { rows: [{ id: 'proj-1' }] },    // SELECT project
      { rows: [] },                    // UPDATE status = archived
      { rows: [] },                    // INSERT audit_log
      { rows: [] },                    // COMMIT
    ]);
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(buildApp()).patch('/admin/projects/proj-1/archive');
    expect(res.status).toBe(200);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("VALUES ('project.archive'"),
      ['admin-id', 'proj-1']
    );
  });

  it('returns 404 for missing project', async () => {
    const client = makeMockClient([
      { rows: [] }, // BEGIN
      { rows: [] }, // SELECT → not found
      { rows: [] }, // ROLLBACK
    ]);
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(buildApp()).patch('/admin/projects/nonexistent/archive');
    expect(res.status).toBe(404);
  });
});
