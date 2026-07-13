import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { db } from '../db';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  name?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies.accessToken;
  if (!token) {
    res.status(401).json({ error: 'Missing access token in cookies' });
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret) as AuthUser;
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired access token' });
    return;
  }
}

export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden: insufficient role' });
      return;
    }
    next();
  };
}

export function requireProjectAccess(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  
  if (req.user.role === 'pm') {
    const projectId = req.params.projectId || req.body.projectId;
    if (!projectId) {
       res.status(400).json({ error: 'Project ID required for access check' });
       return;
    }
    
    // Check database to see if the user is the assigned PM for this active project
    db.query(`SELECT id FROM projects WHERE id = $1 AND assigned_pm_id = $2 AND status = 'active'`, [projectId, req.user.id])
      .then(result => {
        if (result.rows.length === 0) {
          res.status(403).json({ error: 'Forbidden: not assigned to this project' });
          return;
        }
        next();
      })
      .catch(err => {
        console.error('requireProjectAccess db error:', err);
        res.status(500).json({ error: 'Internal server error' });
      });
  } else {
    next();
  }
}
