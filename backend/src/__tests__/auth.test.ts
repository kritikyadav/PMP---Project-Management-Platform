jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import request from 'supertest';
import express from 'express';
import { authRouter } from '../routes/auth';
import { db } from '../db';
import axios from 'axios';
import { ConfidentialClientApplication } from '@azure/msal-node';
import bcrypt from 'bcrypt';

jest.mock('../db', () => ({
  db: {
    query: jest.fn(),
  },
}));

jest.mock('axios');

jest.mock('@azure/msal-node', () => {
  return {
    ConfidentialClientApplication: jest.fn().mockImplementation(() => {
      return {
        getAuthCodeUrl: jest.fn().mockResolvedValue('https://login.microsoftonline.com/auth'),
        acquireTokenByCode: jest.fn().mockResolvedValue({ accessToken: 'mock-access-token' }),
      };
    }),
  };
});

const app = express();
app.use(express.json());
app.use('/auth', authRouter);

describe('Auth Router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /auth/login', () => {
    it('should redirect to MS auth URL', async () => {
      const res = await request(app).get('/auth/login');
      expect(res.status).toBe(302);
      expect(res.header.location).toBe('https://login.microsoftonline.com/auth');
    });
  });

  describe('GET /auth/callback', () => {
    it('should redirect to success with JWT if user is provisioned and active', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: { mail: 'test@example.com' },
      });

      (db.query as jest.Mock).mockImplementation((query, values) => {
        if (query.includes('FROM users')) {
          return { rows: [{ id: '1', role: 'pm', is_active: true }] };
        }
        if (query.includes('FROM projects')) {
          return { rows: [{ id: 'p1' }] };
        }
        return { rows: [] };
      });

      const res = await request(app).get('/auth/callback?code=mock-code');
      
      expect(res.status).toBe(302);
      expect(res.header.location).toContain('/auth/success?token=');
    });

    it('should redirect to error if user is not provisioned', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: { mail: 'unknown@example.com' },
      });

      (db.query as jest.Mock).mockResolvedValue({ rows: [] });

      const res = await request(app).get('/auth/callback?code=mock-code');
      
      expect(res.status).toBe(302);
      expect(res.header.location).toContain('message=account_not_provisioned');
    });

    it('should redirect to error if user is deactivated', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: { mail: 'deactivated@example.com' },
      });

      (db.query as jest.Mock).mockResolvedValue({ rows: [{ id: '1', role: 'pm', is_active: false }] });

      const res = await request(app).get('/auth/callback?code=mock-code');

      expect(res.status).toBe(302);
      expect(res.header.location).toContain('message=account_deactivated');
    });
  });
});

describe('POST /auth/credentials', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with token for valid credentials', async () => {
    (db.query as jest.Mock).mockImplementation((query: string) => {
      if (query.includes('FROM users')) {
        return Promise.resolve({
          rows: [{ id: 'user-1', role: 'pm', is_active: true, password_hash: '$2b$12$fakehash' }],
        });
      }
      if (query.includes('FROM projects')) {
        return Promise.resolve({ rows: [{ id: 'proj-1' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const res = await request(app).post('/auth/credentials').send({ email: 'pm@test.com', password: 'Password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    const { default: jwt } = await import('jsonwebtoken');
    const decoded = jwt.decode(res.body.token) as Record<string, unknown>;
    expect(decoded).toMatchObject({
      id: 'user-1',
      email: 'pm@test.com',
      role: 'pm',
      assignedProjectIds: ['proj-1'],
    });
  });

  it('returns 401 for unknown email', async () => {
    (db.query as jest.Mock).mockResolvedValue({ rows: [] });

    const res = await request(app).post('/auth/credentials').send({ email: 'nobody@test.com', password: 'Password123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('returns 401 for deactivated user', async () => {
    (db.query as jest.Mock).mockResolvedValue({
      rows: [{ id: 'user-2', role: 'pm', is_active: false, password_hash: '$2b$12$fakehash' }],
    });

    const res = await request(app).post('/auth/credentials').send({ email: 'inactive@test.com', password: 'Password123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Account deactivated');
  });

  it('returns 401 for user with no password_hash (SSO-only user)', async () => {
    (db.query as jest.Mock).mockResolvedValue({
      rows: [{ id: 'user-3', role: 'cxo', is_active: true, password_hash: null }],
    });

    const res = await request(app).post('/auth/credentials').send({ email: 'sso@test.com', password: 'Password123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('returns 401 for wrong password', async () => {
    (db.query as jest.Mock).mockResolvedValue({
      rows: [{ id: 'user-4', role: 'pm', is_active: true, password_hash: '$2b$12$fakehash' }],
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const res = await request(app).post('/auth/credentials').send({ email: 'pm@test.com', password: 'WrongPass' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('returns 400 when email or password is missing', async () => {
    const res = await request(app).post('/auth/credentials').send({ email: 'pm@test.com' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app).post('/auth/credentials').send({ password: 'Password123' });
    expect(res.status).toBe(400);
  });
});
