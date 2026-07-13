import request from 'supertest';
import express from 'express';
import { pmRouter } from '../routes/pm';

jest.mock('../db', () => ({
  db: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock('../middleware/rbac', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { id: 'pm-id', email: 'pm@test.com', role: 'pm' };
    next();
  },
  requireRole: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

jest.mock('../realtime', () => ({
  emitProjectPublished: jest.fn(),
}));

import { db } from '../db';
import { emitProjectPublished } from '../realtime';

const mockDb = db as unknown as { query: jest.Mock; connect: jest.Mock };

function makeMockClient(responses: Array<{ rows: unknown[] }>) {
  let call = 0;
  const query = jest.fn().mockImplementation(() =>
    Promise.resolve(responses[call++] ?? { rows: [] })
  );
  return { query, release: jest.fn(), BEGIN: undefined, COMMIT: undefined };
}

const app = express();
app.use(express.json());
app.use('/pm', pmRouter);

const FULL_BODY = {
  sprint_name: 'Sprint 1',
  sprint_start_date: '2026-04-01',
  sprint_end_date: '2026-04-14',
  stakeholder_name: 'Jane Smith',
  tech_team_size: 6,
  rag_schedule: 'green',
  rag_budget: 'amber',
  rag_scope: 'green',
  rag_resources: 'green',
  rag_timeline: 'green',
  milestones: [],
  team_structure: [],
};

const MOCK_SUBMISSION = {
  id: 'sub-1',
  project_id: 'proj-1',
  submitted_by: 'pm-id',
  status: 'draft',
  version: 1,
  sprint_name: 'Sprint 1',
  sprint_start_date: '2026-04-01',
  sprint_end_date: '2026-04-14',
  stakeholder_name: 'Jane Smith',
  tech_team_size: 6,
  rag_schedule: 'green',
  rag_budget: 'amber',
  rag_scope: 'green',
  rag_resources: 'green',
  rag_timeline: 'green',
  rag_schedule_comment: null,
  rag_budget_comment: null,
  rag_scope_comment: null,
  rag_resources_comment: null,
  rag_timeline_comment: null,
  rag_project_health: 'green',
  milestones: [],
  team_structure: [],
  overview: null,
  business_coordination: null,
  feature_releases: null,
  development_uat: null,
  ongoing_work: null,
  upcoming_deliverables: null,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

const MOCK_PROJECT_ROW = { id: 'proj-1' };

// ─── GET /pm/projects ─────────────────────────────────────────────────────────

describe('GET /pm/projects', () => {
  it('returns assigned projects', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'proj-1', name: 'Alpha', client_name: 'ACME', draft_id: null, draft_updated_at: null, published_version: null, published_updated_at: null }],
    });

    const res = await request(app).get('/pm/projects');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Alpha');
  });
});

// ─── GET /pm/projects/:id/submission ─────────────────────────────────────────

describe('GET /pm/projects/:id/submission', () => {
  it('returns existing submission', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [MOCK_PROJECT_ROW] })  // project check
      .mockResolvedValueOnce({ rows: [MOCK_SUBMISSION] });   // submission

    const res = await request(app).get('/pm/projects/proj-1/submission');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('sub-1');
  });

  it('returns null when no submission exists', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [MOCK_PROJECT_ROW] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/pm/projects/proj-1/submission');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('returns 404 when project not assigned to PM', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/pm/projects/other-proj/submission');
    expect(res.status).toBe(404);
  });
});

// ─── PUT /pm/projects/:id/submission/draft ────────────────────────────────────

describe('PUT /pm/projects/:id/submission/draft', () => {
  it('creates a new draft when none exists', async () => {
    const client = makeMockClient([
      { rows: [] },                             // BEGIN (implicit)
      { rows: [] },                             // no existing draft
      { rows: [{ next_version: 1 }] },          // version calc
      { rows: [MOCK_SUBMISSION] },              // INSERT
      { rows: [] },                             // COMMIT
    ]);
    mockDb.query.mockResolvedValueOnce({ rows: [MOCK_PROJECT_ROW] });
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(app)
      .put('/pm/projects/proj-1/submission/draft')
      .send(FULL_BODY);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('draft');
    expect(res.body.version).toBe(1);
  });

  it('updates existing draft', async () => {
    const updatedDraft = { ...MOCK_SUBMISSION, sprint_name: 'Sprint 2' };
    const client = makeMockClient([
      { rows: [] },                             // BEGIN
      { rows: [{ id: 'sub-1' }] },             // existing draft found
      { rows: [updatedDraft] },                 // UPDATE
      { rows: [] },                             // COMMIT
    ]);
    mockDb.query.mockResolvedValueOnce({ rows: [MOCK_PROJECT_ROW] });
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(app)
      .put('/pm/projects/proj-1/submission/draft')
      .send({ ...FULL_BODY, sprint_name: 'Sprint 2' });

    expect(res.status).toBe(200);
    expect(res.body.sprint_name).toBe('Sprint 2');
  });

  it('returns 404 when project not assigned', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put('/pm/projects/other-proj/submission/draft')
      .send(FULL_BODY);

    expect(res.status).toBe(404);
  });

  it('returns 400 when team structure allocation sum for a user exceeds 100%', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [MOCK_PROJECT_ROW] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .put('/pm/projects/proj-1/submission/draft')
      .send({
        ...FULL_BODY,
        team_structure: [
          { user_id: 'user-1', employee_name: 'Ben Employee', allocation_percentage: 60 },
          { user_id: 'user-1', employee_name: 'Ben Employee', allocation_percentage: 50 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Over-allocation detected');
    expect(res.body.violations).toHaveLength(2);
    expect(res.body.violations[0].requested).toBe(110);
  });
});

// ─── POST /pm/projects/:id/submission/publish ─────────────────────────────────

describe('POST /pm/projects/:id/submission/publish', () => {
  it('publishes draft successfully', async () => {
    const publishedSub = { ...MOCK_SUBMISSION, status: 'published' };
    const client = makeMockClient([
      { rows: [] },                                       // BEGIN
      { rows: [{ id: 'sub-1', version: 1 }] },           // existing draft
      { rows: [] },                                       // no same-week published submission
      { rows: [publishedSub] },                           // UPDATE to published
      { rows: [] },                                       // audit_log insert
      { rows: [] },                                       // COMMIT
    ]);
    mockDb.query.mockResolvedValueOnce({ rows: [MOCK_PROJECT_ROW] });
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(app)
      .post('/pm/projects/proj-1/submission/publish')
      .send(FULL_BODY);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('published');
    expect(emitProjectPublished).toHaveBeenCalledWith(expect.objectContaining({
      id: 'sub-1',
      project_id: 'proj-1',
      status: 'published',
    }));
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("VALUES ('project.publish'"),
      expect.arrayContaining(['pm-id', 'sub-1'])
    );
  });

  it('rejects publish with missing required fields', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [MOCK_PROJECT_ROW] });

    const res = await request(app)
      .post('/pm/projects/proj-1/submission/publish')
      .send({ sprint_name: 'Sprint 1' }); // missing most fields

    expect(res.status).toBe(400);
    expect(res.body.fields).toBeDefined();
    expect(res.body.fields.length).toBeGreaterThan(0);
  });

  it('rejects publish with invalid RAG value', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [MOCK_PROJECT_ROW] });

    const res = await request(app)
      .post('/pm/projects/proj-1/submission/publish')
      .send({ ...FULL_BODY, rag_schedule: 'yellow' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid rag/i);
  });

  it('returns 400 when no draft exists to publish', async () => {
    const client = makeMockClient([
      { rows: [] },  // BEGIN
      { rows: [] },  // no draft found
                     // ROLLBACK triggered by thrown error
    ]);
    mockDb.query.mockResolvedValueOnce({ rows: [MOCK_PROJECT_ROW] });
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(app)
      .post('/pm/projects/proj-1/submission/publish')
      .send(FULL_BODY);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no draft/i);
  });

  it('versioned snapshot: published row has version from draft', async () => {
    const draftAtV2 = { ...MOCK_SUBMISSION, id: 'sub-2', version: 2 };
    const publishedAtV2 = { ...draftAtV2, status: 'published' };
    const client = makeMockClient([
      { rows: [] },
      { rows: [{ id: 'sub-2', version: 2 }] },
      { rows: [] },
      { rows: [publishedAtV2] },
      { rows: [] },
      { rows: [] },
    ]);
    mockDb.query.mockResolvedValueOnce({ rows: [MOCK_PROJECT_ROW] });
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(app)
      .post('/pm/projects/proj-1/submission/publish')
      .send(FULL_BODY);

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(2);
    expect(res.body.status).toBe('published');
  });
});

// ─── Post-publish edit creates new draft ─────────────────────────────────────

describe('Post-publish edit flow', () => {
  it('creates a new draft (version 2) after a published submission exists', async () => {
    const newDraft = { ...MOCK_SUBMISSION, id: 'sub-new', version: 2 };
    const client = makeMockClient([
      { rows: [] },                        // BEGIN
      { rows: [] },                        // no existing draft (v1 is published)
      { rows: [{ next_version: 2 }] },     // version = max(published) + 1 = 2
      { rows: [newDraft] },                // INSERT new draft
      { rows: [] },                        // COMMIT
    ]);
    mockDb.query.mockResolvedValueOnce({ rows: [MOCK_PROJECT_ROW] });
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(app)
      .put('/pm/projects/proj-1/submission/draft')
      .send(FULL_BODY);

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(2);
    expect(res.body.status).toBe('draft');
  });
});

// ─── GET /pm/projects/:id/overrides ──────────────────────────────────────────

describe('GET /pm/projects/:id/overrides', () => {
  it('returns overrides for latest published', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [MOCK_PROJECT_ROW] })
      .mockResolvedValueOnce({ rows: [{ id: 'ovr-1', field_name: 'rag_schedule', override_value: 'red', override_reason: 'Actual risk is higher', original_value: 'green', overridden_by: 'pgm-id', created_at: '2026-04-01T00:00:00Z' }] });

    const res = await request(app).get('/pm/projects/proj-1/overrides');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].field_name).toBe('rag_schedule');
  });

  it('returns empty array when no overrides', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [MOCK_PROJECT_ROW] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/pm/projects/proj-1/overrides');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('returns 404 for cross-PM override access', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/pm/projects/other-proj/overrides');

    expect(res.status).toBe(404);
  });
});
