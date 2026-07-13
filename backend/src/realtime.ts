import type { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from './config';

export const PGM_ROOM = 'pgm-room';
export const CXO_ROOM = 'cxo-room';

type ReviewRoomEvent = 'project.published' | 'field.overridden' | 'project.assigned';

export interface ProjectPublishedPayload {
  project_id: string;
  submission_id: string;
  version: number;
  submitted_by: string;
  published_at: string;
}

export interface FieldOverriddenPayload {
  submission_id: string;
  field_name: string;
  original_value: string | null;
  override_value: string;
  override_reason: string;
  overridden_by: string;
  created_at: string;
}

export interface ProjectAssignedPayload {
  id: string;
  name: string;
}

let socketServer: Server | null = null;

function roleFromSocket(socket: Socket): string | undefined {
  const role = socket.handshake.query.role;
  return Array.isArray(role) ? role[0] : role;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value) {
      cookies[key.trim()] = decodeURIComponent(value.trim());
    }
  }
  return cookies;
}

export function setSocketServer(io: Server): void {
  socketServer = io;
}

export function registerSocketHandlers(io: Server): void {
  setSocketServer(io);

  if (typeof io.use === 'function') {
    io.use((socket, next) => {
      let token = socket.handshake.auth?.token;
      
      // Fallback: Read token from HttpOnly cookie if auth.token is empty
      if (!token || token === '') {
        const cookies = parseCookies(socket.handshake.headers.cookie);
        token = cookies['accessToken'];
      }

      if (!token || Array.isArray(token)) {
        console.log('[Socket Auth] Connection rejected: No auth token or cookie found.');
        next(new Error('Unauthorized'));
        return;
      }

      try {
        const payload = jwt.verify(token, config.jwt.secret) as { id?: string; role?: string };
        if (typeof payload.role !== 'string') {
          console.log('[Socket Auth] Connection rejected: Invalid role in token payload.');
          next(new Error('Unauthorized'));
          return;
        }
        socket.data.role = payload.role;
        socket.data.userId = payload.id;
        console.log(`[Socket Auth] Token verified. User: ${payload.id}, Role: ${payload.role}`);
        next();
      } catch (err) {
        console.error('[Socket Auth] JWT verification failed:', err);
        next(new Error('Unauthorized'));
      }
    });
  }

  io.on('connection', (socket) => {
    const role = (socket.data?.role as string | undefined) || roleFromSocket(socket);
    const userId = socket.data?.userId as string | undefined;

    console.log(`[Socket Connection] Connected: Socket ID: ${socket.id}, User ID: ${userId || 'unknown'}, Role: ${role || 'unknown'}`);

    if (role === 'program_manager') {
      socket.join(PGM_ROOM);
      console.log(`[Socket Room] Socket ${socket.id} joined: ${PGM_ROOM}`);
    }
    if (role === 'cxo') {
      socket.join(CXO_ROOM);
      console.log(`[Socket Room] Socket ${socket.id} joined: ${CXO_ROOM}`);
    }
    if (role === 'pm' && userId) {
      const pmRoom = `pm:${userId}`;
      socket.join(pmRoom);
      console.log(`[Socket Room] Socket ${socket.id} joined PM room: ${pmRoom}`);
    }
  });
}

function emitToReviewRooms(event: ReviewRoomEvent, payload: unknown): void {
  if (!socketServer) return;
  socketServer.to(PGM_ROOM).emit(event, payload);
  socketServer.to(CXO_ROOM).emit(event, payload);
}

export function emitProjectPublished(submission: {
  id: string;
  project_id: string;
  submitted_by: string;
  version: number;
  updated_at: string;
}): void {
  emitToReviewRooms('project.published', {
    project_id: submission.project_id,
    submission_id: submission.id,
    version: submission.version,
    submitted_by: submission.submitted_by,
    published_at: submission.updated_at,
  } satisfies ProjectPublishedPayload);
}

export function emitFieldOverridden(override: FieldOverriddenPayload, pmUserId?: string): void {
  emitToReviewRooms('field.overridden', override);
  if (pmUserId) {
    const pmRoom = `pm:${pmUserId}`;
    if (socketServer) {
      console.log(`[Socket Emit] Emitting field.overridden to PM room "${pmRoom}" for submission: ${override.submission_id}`);
      socketServer.to(pmRoom).emit('field.overridden', override);
    }
  }
}

export function emitProjectAssigned(pmId: string, project: { id: string; name: string }): void {
  if (!socketServer) {
    console.log(`[Socket Emit] Failed to emit project.assigned for PM ${pmId}: socketServer is null`);
    return;
  }
  const pmRoom = `pm:${pmId}`;
  console.log(`[Socket Emit] Emitting project.assigned to room "${pmRoom}" for Project: ${project.id} (${project.name})`);
  socketServer.to(pmRoom).emit('project.assigned', {
    id: project.id,
    name: project.name,
  } satisfies ProjectAssignedPayload);
}

export function emitProjectUnassigned(pmId: string, project: { id: string; name: string }): void {
  if (!socketServer) {
    console.log(`[Socket Emit] Failed to emit project.unassigned for PM ${pmId}: socketServer is null`);
    return;
  }
  const pmRoom = `pm:${pmId}`;
  console.log(`[Socket Emit] Emitting project.unassigned to room "${pmRoom}" for Project: ${project.id} (${project.name})`);
  socketServer.to(pmRoom).emit('project.unassigned', {
    id: project.id,
    name: project.name,
  } satisfies ProjectAssignedPayload);
}

