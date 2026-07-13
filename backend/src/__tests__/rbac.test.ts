import { Request, Response, NextFunction } from 'express';
import { requireRole, requireProjectAccess } from '../middleware/rbac';
import { db } from '../db';

jest.mock('../db', () => ({
  db: {
    query: jest.fn(),
  },
}));

describe('RBAC Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    nextFunction = jest.fn();
    jest.clearAllMocks();
  });

  describe('requireRole', () => {
    it('should return 401 if not authenticated', () => {
      const middleware = requireRole(['system_admin']);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Not authenticated' });
    });

    it('should return 403 if role is insufficient', () => {
      mockRequest.user = { id: '1', email: 'test@test.com', role: 'pm' };
      const middleware = requireRole(['system_admin']);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Forbidden: insufficient role' });
    });

    it('should call next if role is sufficient', () => {
      mockRequest.user = { id: '1', email: 'test@test.com', role: 'system_admin' };
      const middleware = requireRole(['system_admin']);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });
  });

  describe('requireProjectAccess', () => {
    it('should pass if user is not PM (e.g. system_admin)', () => {
      mockRequest.user = { id: '1', email: 'test@test.com', role: 'system_admin' };
      requireProjectAccess(mockRequest as Request, mockResponse as Response, nextFunction);
      
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should return 403 if PM is not assigned to project', async () => {
      mockRequest.user = { id: '1', email: 'test@test.com', role: 'pm' };
      mockRequest.params = { projectId: 'p2' };
      
      (db.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
      
      requireProjectAccess(mockRequest as Request, mockResponse as Response, nextFunction);
      
      // Since requireProjectAccess uses Promises, we need to wait for microtasks
      await new Promise(process.nextTick);
      
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Forbidden: not assigned to this project' });
    });

    it('should pass if PM is assigned to project', async () => {
      mockRequest.user = { id: '1', email: 'test@test.com', role: 'pm' };
      mockRequest.params = { projectId: 'p2' };
      
      (db.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'p2' }] });
      
      requireProjectAccess(mockRequest as Request, mockResponse as Response, nextFunction);
      
      await new Promise(process.nextTick);
      
      expect(nextFunction).toHaveBeenCalled();
    });
  });
});
