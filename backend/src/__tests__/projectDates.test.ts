import request from 'supertest';
import express from 'express';
import { projectsRouter } from '../routes/projects';

let currentUser = { id: 'pm-id', email: 'pm@test.com', role: 'pm', assignedProjectIds: ['proj-1'] };

jest.mock('../db', () => ({
  db: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock('../middleware/rbac', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = currentUser;
    next();
  },
  requireRole: (roles: string[]) => (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!roles.includes(currentUser.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  },
}));

import { db } from '../db';

const mockDb = db as unknown as { query: jest.Mock; connect: jest.Mock };
const app = express();
app.use(express.json());
app.use('/projects', projectsRouter);

beforeEach(() => {
  jest.clearAllMocks();
  currentUser = { id: 'pm-id', email: 'pm@test.com', role: 'pm', assignedProjectIds: ['proj-1'] };
});

describe('PATCH /projects/:id/dates', () => {
  it('rejects end date before start date', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'proj-1' }] });

    const res = await request(app).patch('/projects/proj-1/dates').send({
      project_start_date: '2026-05-10',
      project_end_date: '2026-05-01',
    });

    expect(res.status).toBe(400);
  });

  it('updates dates for assigned PM project', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'proj-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'proj-1', project_start_date: '2026-05-01', project_end_date: '2026-05-10' }] });

    const res = await request(app).patch('/projects/proj-1/dates').send({
      project_start_date: '2026-05-01',
      project_end_date: '2026-05-10',
    });

    expect(res.status).toBe(200);
    expect(res.body.project_start_date).toBe('2026-05-01');
  });
});
