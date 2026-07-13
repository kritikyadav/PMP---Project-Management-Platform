import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import App from '../App';

// Mock jwt-decode
vi.mock('jwt-decode', () => {
  const jwtDecode = vi.fn();
  (globalThis as any).jwtDecodeMock = jwtDecode;
  return { jwtDecode };
});

// Mock TipTap (used inside PMDashboard)
vi.mock('@tiptap/react', () => ({
  useEditor: vi.fn(() => null),
  EditorContent: () => null,
}));
vi.mock('@tiptap/starter-kit', () => ({ default: {} }));

// Mock admin API so AdminDashboard doesn't make real fetch calls
vi.mock('../api/admin.js', () => ({
  adminApi: {
    listUsers: vi.fn().mockResolvedValue([]),
    listProjects: vi.fn().mockResolvedValue([]),
    createUser: vi.fn(),
    deactivateUser: vi.fn(),
    createProject: vi.fn(),
    assignPM: vi.fn(),
    archiveProject: vi.fn(),
    unarchiveProject: vi.fn(),
  },
}));

// Mock pm API so PMDashboard doesn't make real fetch calls
vi.mock('../api/pm.js', () => ({
  pmApi: {
    listProjects: vi.fn().mockResolvedValue([]),
    getTeamMembers: vi.fn().mockResolvedValue([]),
    getMemberAllocation: vi.fn(),
    getSubmission: vi.fn().mockResolvedValue(null),
    getOverrides: vi.fn().mockResolvedValue([]),
    saveDraft: vi.fn(),
    publish: vi.fn(),
    patchProjectDates: vi.fn(),
    listRaid: vi.fn().mockResolvedValue([]),
    listMilestoneStatuses: vi.fn().mockResolvedValue([]),
    createMilestoneStatus: vi.fn(),
  },
}));

vi.mock('../api/auth.js', () => {
  console.log('--- AUTH MOCK FACTORY EXEC ---');
  return {
    checkSession: vi.fn().mockImplementation(() => {
      console.log('--- checkSession MOCK CALLED ---');
      const hasToken = window.localStorage.getItem('token');
      if (hasToken) {
        try {
          const decoded = (globalThis as any).jwtDecodeMock ? (globalThis as any).jwtDecodeMock(hasToken) : null;
          return Promise.resolve({ id: 'pm-id', email: 'pm@test.com', role: decoded?.role || 'pm', name: 'PM User' });
        } catch {
          return Promise.resolve({ id: 'pm-id', email: 'pm@test.com', role: 'pm', name: 'PM User' });
        }
      }
      return Promise.resolve(null);
    }),
    logout: vi.fn().mockResolvedValue(undefined),
  };
});

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

vi.mock('../realtime/dashboardSocket.js', () => ({
  useDashboardRealtime: vi.fn(() => ({ connected: true, events: [] })),
  connectDashboardSocket: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

import { jwtDecode } from 'jwt-decode';

describe('Role-based routing in App', () => {
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => { store[key] = value.toString(); },
      clear: () => { store = {}; },
      removeItem: (key: string) => { delete store[key]; }
    };
  })();

  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock
  });

  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  const renderWithUrl = (url: string) => {
    window.history.pushState({}, 'Test page', url);
    render(<App />);
  };

  it('renders Login page by default or when unauthorized', async () => {
    renderWithUrl('/');
    expect(await screen.findByText(/Continue with Microsoft 365/i)).toBeInTheDocument();
  });

  it('redirects to login if trying to access protected route without token', async () => {
    renderWithUrl('/admin');
    expect(await screen.findByText(/Continue with Microsoft 365/i)).toBeInTheDocument();
  });

  it('renders System Admin Dashboard for system_admin role', async () => {
    localStorage.setItem('token', 'fake-token');
    (jwtDecode as any).mockReturnValue({ role: 'system_admin' });
    
    renderWithUrl('/admin');
    expect(await screen.findByText(/Platform Administration/i)).toBeInTheDocument();
  });

  it('renders Project Manager Dashboard for pm role', async () => {
    localStorage.setItem('token', 'fake-token');
    (jwtDecode as any).mockReturnValue({ role: 'pm' });
    
    renderWithUrl('/pm');
    expect(await screen.findByText(/My Projects/i)).toBeInTheDocument();
  });

  it('renders Program Manager Dashboard for program_manager role', async () => {
    localStorage.setItem('token', 'fake-token');
    (jwtDecode as any).mockReturnValue({ role: 'program_manager' });
    
    renderWithUrl('/pgm');
    expect(await screen.findByText(/Program Office/i)).toBeInTheDocument();
  });

  it('renders CXO Dashboard for cxo role', async () => {
    localStorage.setItem('token', 'fake-token');
    (jwtDecode as any).mockReturnValue({ role: 'cxo' });
    
    renderWithUrl('/cxo');
    expect(await screen.findByText(/Executive Dashboard/i)).toBeInTheDocument();
  });

  it('shows Access Denied if trying to access another roles dashboard', async () => {
    localStorage.setItem('token', 'fake-token');
    (jwtDecode as any).mockReturnValue({ role: 'pm' });
    
    renderWithUrl('/admin');
    expect(await screen.findByText(/Access Denied/i)).toBeInTheDocument();
    expect(screen.getByText(/You do not have the required role to access this dashboard/i)).toBeInTheDocument();
  });
});
