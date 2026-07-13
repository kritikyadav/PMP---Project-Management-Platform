jest.mock('../db', () => ({
  db: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock('../middleware/rbac', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'pgm-id', email: 'pgm@test.com', role: 'program_manager', assignedProjectIds: [] };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../realtime', () => ({
  emitFieldOverridden: jest.fn(),
  emitProjectAssigned: jest.fn(),
}));

import request from 'supertest';
import express from 'express';
import { db } from '../db';
import { pgmRouter } from '../routes/pgm';
import { emitFieldOverridden } from '../realtime';

const mockDb = db as unknown as { query: jest.Mock; connect: jest.Mock };

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/pgm', pgmRouter);
  return app;
}

function makeMockClient(queryResponses: Array<{ rows: unknown[] }>) {
  let call = 0;
  const query = jest.fn().mockImplementation(() => Promise.resolve(queryResponses[call++] ?? { rows: [] }));
  return { query, release: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /pgm/portfolio', () => {
  it('returns all active project portfolio rows', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ project_id: 'proj-1', project_name: 'Alpha', publish_status: 'submitted' }],
    });

    const res = await request(buildApp()).get('/pgm/portfolio');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('p.status = $1'), ['active']);
  });

  it('applies pm, client, rag, and publish filters', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    await request(buildApp()).get('/pgm/portfolio?pm_name=Jane&client_name=ACME&rag_status=red&publish_status=submitted');

    const [sql, params] = mockDb.query.mock.calls[0];
    expect(sql).toContain('pm.name');
    expect(sql).toContain('p.client_name');
    expect(sql).toContain('pub.rag_schedule');
    expect(sql).toContain('pub.id IS NOT NULL');
    expect(params).toEqual(['active', '%Jane%', '%ACME%', 'red']);
  });
});

describe('GET /pgm/projects/:id', () => {
  it('returns project drill-down with overrides', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ project_id: 'proj-1', project_name: 'Alpha', id: 'sub-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ovr-1', field_name: 'rag_schedule' }] });

    const res = await request(buildApp()).get('/pgm/projects/proj-1');

    expect(res.status).toBe(200);
    expect(res.body.project_name).toBe('Alpha');
    expect(res.body.overrides).toHaveLength(1);
  });

  it('returns 404 for missing project', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(buildApp()).get('/pgm/projects/missing');

    expect(res.status).toBe(404);
  });
});

describe('GET /pgm/projects/:id/history', () => {
  it('returns chronological published versions', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'sub-2', version: 2 }, { id: 'sub-1', version: 1 }],
    });

    const res = await request(buildApp()).get('/pgm/projects/proj-1/history');

    expect(res.status).toBe(200);
    expect(res.body[0].version).toBe(2);
  });
});

describe('POST /pgm/submissions/:id/overrides', () => {
  it('saves an override with audit log and emits realtime event', async () => {
    const saved = {
      id: 'ovr-1',
      submission_id: 'sub-1',
      field_name: 'rag_schedule',
      original_value: 'green',
      override_value: 'red',
      override_reason: 'Schedule risk increased',
      overridden_by: 'pgm-id',
      created_at: '2026-04-30T00:00:00Z',
    };
    const client = makeMockClient([
      { rows: [] },
      { rows: [{ id: 'sub-1', submitted_by: 'pm-1', original_value: 'green' }] },
      { rows: [saved] },
      { rows: [] },
      { rows: [] },
    ]);
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(buildApp())
      .post('/pgm/submissions/sub-1/overrides')
      .send({
        field_name: 'rag_schedule',
        override_value: 'red',
        override_reason: 'Schedule risk increased',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('ovr-1');
    expect(emitFieldOverridden).toHaveBeenCalledWith(saved, 'pm-1');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("VALUES ('submission.override'"),
      expect.arrayContaining(['pgm-id', 'sub-1'])
    );
    expect(res.body).toEqual(expect.objectContaining({
      original_value: 'green',
      override_value: 'red',
      override_reason: 'Schedule risk increased',
      overridden_by: 'pgm-id',
      created_at: '2026-04-30T00:00:00Z',
    }));
  });

  it('rejects overrides without a long enough reason', async () => {
    const res = await request(buildApp())
      .post('/pgm/submissions/sub-1/overrides')
      .send({ field_name: 'rag_schedule', override_value: 'red', override_reason: 'short' });

    expect(res.status).toBe(400);
  });

  it('rejects non-overridable fields', async () => {
    const res = await request(buildApp())
      .post('/pgm/submissions/sub-1/overrides')
      .send({ field_name: 'status', override_value: 'draft', override_reason: 'Invalid field override' });

    expect(res.status).toBe(400);
  });
});

describe('POST /pgm/projects', () => {
  it('creates a project as Program Manager', async () => {
    const client = makeMockClient([
      { rows: [] },
      { rows: [{ id: 'pm-1' }] },
      { rows: [{ id: 'proj-1', name: 'Alpha', client_name: 'ACME', assigned_pm_id: 'pm-1', engagement_type: 'Fixed Cost', methodology: 'Agile', stakeholders: [], status: 'active' }] },
      { rows: [] },
      { rows: [] },
    ]);
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(buildApp())
      .post('/pgm/projects')
      .send({ name: 'Alpha', client_name: 'ACME', assigned_pm_id: 'pm-1', engagement_type: 'Fixed Cost', methodology: 'Agile', stakeholders: [] });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Alpha');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("VALUES ('project.create'"),
      expect.arrayContaining(['pgm-id', 'proj-1'])
    );
  });
});
