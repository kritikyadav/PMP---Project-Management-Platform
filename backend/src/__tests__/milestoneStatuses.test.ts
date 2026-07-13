import request from 'supertest';
import express from 'express';
import { milestoneStatusesRouter } from '../routes/milestoneStatuses';

let currentUser = { id: 'pm-id', email: 'pm@test.com', role: 'pm', assignedProjectIds: [] as string[] };

jest.mock('../db', () => ({
  db: { query: jest.fn() },
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

const mockDb = db as unknown as { query: jest.Mock };
const app = express();
app.use(express.json());
app.use('/milestone-statuses', milestoneStatusesRouter);

beforeEach(() => {
  jest.clearAllMocks();
  currentUser = { id: 'pm-id', email: 'pm@test.com', role: 'pm', assignedProjectIds: [] };
});

describe('milestone status routes', () => {
  it('lists statuses for authenticated users', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 's1', label: 'On Track' }] });

    const res = await request(app).get('/milestone-statuses');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 's1', label: 'On Track' }]);
  });

  it('creates a status for PM/PgM users', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 's1', label: 'On Track', created_by: 'pm-id' }] });

    const res = await request(app).post('/milestone-statuses').send({ label: ' On Track ' });

    expect(res.status).toBe(201);
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO milestone_statuses'),
      ['On Track', 'pm-id']
    );
  });

  it('allows only creator or Program Manager to rename', async () => {
    currentUser = { id: 'other-pm', email: 'other@test.com', role: 'pm', assignedProjectIds: [] };
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 's1', created_by: 'pm-id' }] });

    const res = await request(app).patch('/milestone-statuses/s1').send({ label: 'Delayed' });

    expect(res.status).toBe(403);
  });
});
