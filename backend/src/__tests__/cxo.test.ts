jest.mock('../db', () => ({
  db: { query: jest.fn() },
}));

jest.mock('../middleware/rbac', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'cxo-id', email: 'cxo@test.com', role: 'cxo', assignedProjectIds: [] };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

import request from 'supertest';
import express from 'express';
import { db } from '../db';
import { cxoRouter } from '../routes/cxo';

const mockDb = db as unknown as { query: jest.Mock };

function cxoApp() {
  const app = express();
  app.use(express.json());
  app.use('/cxo', cxoRouter);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CXO routes', () => {
  it('returns executive summary aggregation', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{
        total_active_projects: 3,
        health_green: 1,
        health_amber: 1,
        health_red: 1,
        not_submitted: 0,
      }],
    });

    const res = await request(cxoApp()).get('/cxo/summary');

    expect(res.status).toBe(200);
    expect(res.body.total_active_projects).toBe(3);
    expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('rag_project_health'), ['active']);
    expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('timeline_green'), ['active']);
  });

  it('returns read-only project summary table rows', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ project_id: 'proj-1', project_name: 'Alpha', rag_schedule: 'green' }],
    });

    const res = await request(cxoApp()).get('/cxo/projects');

    expect(res.status).toBe(200);
    expect(res.body[0].project_name).toBe('Alpha');
  });

  it('returns a read-only project drill-down', async () => {
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ project_id: 'proj-1', project_name: 'Alpha', id: 'sub-1', overview: 'Overview' }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const res = await request(cxoApp()).get('/cxo/projects/proj-1');

    expect(res.status).toBe(200);
    expect(res.body.overview).toBe('Overview');
  });

  it('returns 404 for missing active project', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(cxoApp()).get('/cxo/projects/missing');

    expect(res.status).toBe(404);
  });

  it('forbids CXO override attempts', async () => {
    const res = await request(cxoApp())
      .post('/cxo/submissions/sub-1/overrides')
      .send({ field_name: 'rag_schedule', override_value: 'red', override_reason: 'Executive cannot edit' });

    expect(res.status).toBe(403);
  });
});
