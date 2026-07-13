import request from 'supertest';
import express from 'express';
import { raidRouter } from '../routes/raid';

let currentUser = { id: 'pm-id', email: 'pm@test.com', role: 'pm', assignedProjectIds: ['proj-1'] };

jest.mock('../db', () => ({
  db: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock('../middleware/rbac', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = currentUser;
    next();
  },
}));

import { db } from '../db';

const mockDb = db as unknown as { query: jest.Mock; connect: jest.Mock };
const app = express();
app.use(express.json());
app.use('/projects', raidRouter);

function makeClient() {
  return {
    query: jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ next_seq: 1 }] })
      .mockResolvedValueOnce({ rows: [{ display_name: 'PM User' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'raid-1', project_id: 'proj-1', raid_seq_id: 1, type: 'Risk', title: 'Risk title', raised_by: 'PM User', status: 'Pending' }] })
      .mockResolvedValueOnce({ rows: [] }),
    release: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  currentUser = { id: 'pm-id', email: 'pm@test.com', role: 'pm', assignedProjectIds: ['proj-1'] };
});

describe('RAID routes', () => {
  it('lists RAID entries for assigned PM project', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'proj-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'raid-1', raid_seq_id: 1, title: 'Risk title' }] });

    const res = await request(app).get('/projects/proj-1/raid');

    expect(res.status).toBe(200);
    expect(res.body[0].title).toBe('Risk title');
  });

  it('blocks CXO writes', async () => {
    currentUser = { id: 'cxo-id', email: 'cxo@test.com', role: 'cxo', assignedProjectIds: [] };

    const res = await request(app).post('/projects/proj-1/raid').send({ type: 'Risk', title: 'Risk title' });

    expect(res.status).toBe(403);
  });

  it('creates entries with sequence and raised_by default', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'proj-1' }] });
    const client = makeClient();
    mockDb.connect.mockResolvedValueOnce(client);

    const res = await request(app).post('/projects/proj-1/raid').send({ type: 'Risk', title: 'Risk title' });

    expect(res.status).toBe(201);
    expect(res.body.raised_by).toBe('PM User');
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('MAX(raid_seq_id)'), ['proj-1']);
  });
});
