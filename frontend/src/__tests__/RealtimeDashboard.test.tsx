import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgMDashboard } from '../pages/PgMDashboard.js';
import { CXODashboard } from '../pages/CXODashboard.js';

type Handler = (payload?: unknown) => void;

const socketMock = vi.hoisted(() => {
  const handlers: Record<string, Handler[]> = {};
  const disconnect = vi.fn();
  const off = vi.fn((event: string, handler: Handler) => {
    handlers[event] = (handlers[event] ?? []).filter((registered) => registered !== handler);
  });
  const on = vi.fn((event: string, handler: Handler) => {
    handlers[event] = [...(handlers[event] ?? []), handler];
  });
  const io = vi.fn(() => ({ on, off, disconnect }));
  return { handlers, disconnect, on, off, io };
});

vi.mock('socket.io-client', () => ({ io: socketMock.io }));

vi.mock('../api/pgm.js', () => ({
  pgmApi: {
    portfolio: vi.fn().mockResolvedValue([]),
    projectDetail: vi.fn(),
    history: vi.fn().mockResolvedValue([]),
    overrideField: vi.fn(),
    createProject: vi.fn(),
    listPMs: vi.fn().mockResolvedValue([]),
    listRaid: vi.fn().mockResolvedValue([]),
    patchProjectDates: vi.fn(),
    assignPm: vi.fn(),
    setStatus: vi.fn(),
    exportCsv: vi.fn(),
  },
}));

vi.mock('../api/cxo.js', () => ({
  cxoApi: {
    summary: vi.fn().mockResolvedValue({
      total_active_projects: 0,
      health_green: 0,
      health_amber: 0,
      health_red: 0,
      not_submitted: 0,
      schedule_green: 0,
      schedule_amber: 0,
      schedule_red: 0,
      budget_green: 0,
      budget_amber: 0,
      budget_red: 0,
      scope_green: 0,
      scope_amber: 0,
      scope_red: 0,
      resources_green: 0,
      resources_amber: 0,
      resources_red: 0,
    }),
    projects: vi.fn().mockResolvedValue([]),
    projectDetail: vi.fn(),
    listRaid: vi.fn().mockResolvedValue([]),
  },
}));

function emitSocketEvent(event: string, payload?: unknown) {
  for (const handler of socketMock.handlers[event] ?? []) handler(payload);
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(socketMock.handlers)) delete socketMock.handlers[key];
});

describe('Realtime dashboards', () => {
  it('connects Program Manager dashboard to the pgm realtime room and renders publish updates', async () => {
    render(<PgMDashboard />);

    expect(socketMock.io).toHaveBeenCalledWith('http://localhost:4000', expect.objectContaining({
      query: { role: 'program_manager' },
    }));

    emitSocketEvent('connect');
    emitSocketEvent('project.published', {
      project_id: 'proj-1',
      submission_id: 'sub-1',
      version: 4,
      submitted_by: 'pm-1',
    });

    await waitFor(() => expect(screen.getByText('Project published')).toBeInTheDocument());
    expect(screen.getByText(/Project proj-1 published version 4/)).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('connects CXO dashboard to the cxo realtime room and renders override updates', async () => {
    render(<CXODashboard />);

    expect(socketMock.io).toHaveBeenCalledWith('http://localhost:4000', expect.objectContaining({
      query: { role: 'cxo' },
    }));

    emitSocketEvent('field.overridden', {
      submission_id: 'sub-1',
      field_name: 'rag_schedule',
      override_value: 'red',
      overridden_by: 'pgm-1',
    });

    await waitFor(() => expect(screen.getByText('Field overridden')).toBeInTheDocument());
    expect(screen.getByText(/rag_schedule changed to red/)).toBeInTheDocument();
  });

  it('disconnects the dashboard socket on unmount', () => {
    const { unmount } = render(<PgMDashboard />);
    unmount();
    expect(socketMock.disconnect).toHaveBeenCalled();
  });
});
