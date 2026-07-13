import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

const SOCKET_URL = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:4000';

export type DashboardRole = 'program_manager' | 'cxo';
export type DashboardEventType = 'project.published' | 'field.overridden';

export interface DashboardEvent {
  id: string;
  type: DashboardEventType;
  title: string;
  detail: string;
  receivedAt: string;
  payload?: any;
}

interface ProjectPublishedPayload {
  project_id: string;
  submission_id: string;
  version: number;
  submitted_by: string;
}

interface FieldOverriddenPayload {
  submission_id: string;
  field_name: string;
  override_value: string;
  overridden_by: string;
}

import { tokenStore } from '../utils/tokenStore.js';

export function connectDashboardSocket(role?: string): Socket {
  const token = tokenStore.getToken();

  return io(SOCKET_URL, {
    auth: { token: token ?? '' },
    withCredentials: true,
    ...(role ? { query: { role } } : {}),
  });
}

function nowLabel(): string {
  return new Date().toLocaleTimeString();
}

export function useDashboardRealtime(role?: string) {
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = connectDashboardSocket(role);

    const prepend = (event: Omit<DashboardEvent, 'id'>) => {
      const newEvent: DashboardEvent = {
        ...event,
        id: Math.random().toString(36).substring(2, 9) + '-' + Date.now(),
      };
      setEvents((current) => [newEvent, ...current].slice(0, 10));
    };

    const onProjectPublished = (payload: ProjectPublishedPayload) => {
      prepend({
        type: 'project.published',
        title: 'Project published',
        detail: `Project ${payload.project_id} published version ${payload.version}`,
        receivedAt: nowLabel(),
        payload,
      });
    };

    const onFieldOverridden = (payload: FieldOverriddenPayload) => {
      prepend({
        type: 'field.overridden',
        title: 'Field overridden',
        detail: `${payload.field_name} changed to ${payload.override_value}`,
        receivedAt: nowLabel(),
        payload,
      });
    };

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('project.published', onProjectPublished);
    socket.on('field.overridden', onFieldOverridden);

    return () => {
      socket.off('project.published', onProjectPublished);
      socket.off('field.overridden', onFieldOverridden);
      socket.disconnect();
    };
  }, []);

  return { connected, events };
}
