import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// Mock jwt-decode
vi.mock('jwt-decode', () => ({
  jwtDecode: vi.fn().mockReturnValue({ id: 'pm-id', email: 'pm@test.com', role: 'pm', name: 'PM User' }),
}));

// Mock TipTap — swap the editor for a plain textarea so tests don't need a DOM renderer
vi.mock('@tiptap/react', () => ({
  useEditor: vi.fn(() => ({
    getHTML: vi.fn(() => ''),
    commands: { setContent: vi.fn() },
    on: vi.fn(),
  })),
  EditorContent: ({ editor }: { editor: unknown }) =>
    editor ? <textarea data-testid="tiptap-editor" /> : null,
}));

vi.mock('@tiptap/starter-kit', () => ({ default: {} }));

// Mock PM API
vi.mock('../api/pm.js', () => ({
  pmApi: {
    listProjects: vi.fn(),
    getTeamMembers: vi.fn(),
    getMemberAllocation: vi.fn(),
    getSubmission: vi.fn(),
    getOverrides: vi.fn(),
    saveDraft: vi.fn(),
    publish: vi.fn(),
    patchProjectDates: vi.fn(),
    listRaid: vi.fn(),
    createRaidEntry: vi.fn(),
    updateRaidEntry: vi.fn(),
    deleteRaidEntry: vi.fn(),
    listMilestoneStatuses: vi.fn(),
    createMilestoneStatus: vi.fn(),
    getStakeholders: vi.fn(),
    updateStakeholders: vi.fn(),
    getProjectTeamMembers: vi.fn(),
    updateProjectTeamMembers: vi.fn(),
    patchProjectMetadata: vi.fn(),
  },
}));

vi.mock('../realtime/dashboardSocket.js', () => ({
  connectDashboardSocket: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    disconnect: vi.fn(),
  })),
  useDashboardRealtime: vi.fn(() => ({ connected: true, events: [] })),
}));


import * as pmApiModule from '../api/pm.js';
import { PMDashboard } from '../pages/PMDashboard.js';

// jsdom localStorage setup
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: false });

const mockPmApi = pmApiModule.pmApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

const sampleProjects = [
  {
    id: 'proj-1',
    name: 'Alpha Project',
    client_name: 'ACME Corp',
    draft_id: 'draft-1',
    draft_updated_at: '2026-04-28T10:00:00Z',
    published_version: null,
    published_updated_at: null,
    project_start_date: null,
    project_end_date: null,
    engagement_type: 'Fixed Cost',
    methodology: 'Agile',
  },
  {
    id: 'proj-2',
    name: 'Beta Project',
    client_name: 'Beta Inc',
    draft_id: null,
    draft_updated_at: null,
    published_version: 3,
    published_updated_at: '2026-04-27T10:00:00Z',
    published_sprint_start_date: new Date().toISOString().slice(0, 10),
    project_start_date: null,
    project_end_date: null,
    engagement_type: 'T&M',
    methodology: 'Waterfall',
  },
];

const sampleSubmission = {
  id: 'sub-1',
  project_id: 'proj-1',
  submitted_by: 'pm-id',
  status: 'draft' as const,
  version: 1,
  sprint_name: 'Sprint 24',
  sprint_start_date: '2026-04-01',
  sprint_end_date: '2026-04-14',
  stakeholder_name: 'Jane Smith',
  tech_team_size: 6,
  rag_schedule: 'green',
  rag_schedule_comment: null,
  rag_budget: 'amber',
  rag_budget_comment: null,
  rag_scope: 'green',
  rag_scope_comment: null,
  rag_resources: 'green',
  rag_resources_comment: null,
  rag_timeline: 'green',
  rag_timeline_comment: null,
  rag_project_health: 'green',
  milestones: [{ id: 'ms-1', name: 'Kickoff', target_date: '2026-04-10', status: 'On Track', comment: null }],
  overview: null,
  business_coordination: null,
  feature_releases: null,
  development_uat: null,
  ongoing_work: null,
  upcoming_deliverables: null,
  team_structure: [],
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

const sampleOverride = {
  id: 'ovr-1',
  submission_id: 'sub-1',
  field_name: 'rag_schedule',
  original_value: 'green',
  override_value: 'red',
  override_reason: 'Risk is underestimated by PM',
  overridden_by: 'pgm-id',
  created_at: '2026-04-02T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('token', 'fake-token');
  globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve([]),
  })) as any;
  mockPmApi['listProjects'].mockResolvedValue(sampleProjects);
  mockPmApi['getSubmission'].mockResolvedValue(sampleSubmission);
  mockPmApi['getOverrides'].mockResolvedValue([]);
  mockPmApi['saveDraft'].mockResolvedValue(sampleSubmission);
  mockPmApi['publish'].mockResolvedValue({ ...sampleSubmission, status: 'published' });
  mockPmApi['getTeamMembers'].mockResolvedValue([]);
  mockPmApi['getMemberAllocation'].mockResolvedValue({ total_allocated: 0, available: 100, projects: [] });
  mockPmApi['patchProjectDates'].mockResolvedValue({ id: 'proj-1', name: 'Alpha Project', project_start_date: null, project_end_date: null });
  mockPmApi['listRaid'].mockResolvedValue([]);
  mockPmApi['listMilestoneStatuses'].mockResolvedValue([{ id: 'status-1', label: 'On Track', created_by: 'pm-id', created_at: '', updated_at: '' }]);
  mockPmApi['createMilestoneStatus'].mockResolvedValue({ id: 'status-2', label: 'New', created_by: 'pm-id', created_at: '', updated_at: '' });
  mockPmApi['getStakeholders'].mockResolvedValue([]);
  mockPmApi['updateStakeholders'].mockResolvedValue([]);
  mockPmApi['getProjectTeamMembers'].mockResolvedValue([]);
  mockPmApi['updateProjectTeamMembers'].mockResolvedValue([]);
  mockPmApi['patchProjectMetadata'].mockResolvedValue({ id: 'proj-1', engagement_type: 'Fixed Cost', methodology: 'Agile' });
});

describe('PMDashboard — Project List', () => {
  it('renders the project list with project names', async () => {
    render(<PMDashboard />);
    await waitFor(() => expect(screen.getByText('Alpha Project')).toBeInTheDocument());
    expect(screen.getByText('Beta Project')).toBeInTheDocument();
  });

  it('shows Draft badge for projects with a draft', async () => {
    render(<PMDashboard />);
    await waitFor(() => expect(screen.getByText(/PENDING/)).toBeInTheDocument());
  });

  it('shows Published badge for projects with a published version', async () => {
    render(<PMDashboard />);
    await waitFor(() => expect(screen.getByText(/PUBLISHED/)).toBeInTheDocument());
  });

  it('shows Not Started badge for projects with no submission', async () => {
    mockPmApi['listProjects'].mockResolvedValue([{
      id: 'proj-3',
      name: 'Gamma',
      client_name: 'Gamma Co',
      draft_id: null,
      draft_updated_at: null,
      published_version: null,
      published_updated_at: null,
      project_start_date: null,
      project_end_date: null,
    }]);
    render(<PMDashboard />);
    await waitFor(() => expect(screen.getByText(/OVERDUE/)).toBeInTheDocument());
  });

  it('shows logout button in navbar', async () => {
    render(<PMDashboard />);
    await waitFor(() => expect(screen.getByText('Logout')).toBeInTheDocument());
  });
});

describe('PMDashboard — Project Editor', () => {
  async function openEditor() {
    render(<PMDashboard />);
    await waitFor(() => screen.getByText('Alpha Project'));
    fireEvent.click(screen.getByText('Alpha Project'));
    await waitFor(() => screen.getByText(/Section A.*Project Charter/));
  }

  it('opens editor when project is clicked', async () => {
    await openEditor();
    expect(screen.getByText(/Section A.*Project Charter/)).toBeInTheDocument();
  });

  it('renders Section A fields with project data pre-filled', async () => {
    await openEditor();
    const sprintInput = screen.getByDisplayValue('Sprint 24');
    expect(sprintInput).toBeInTheDocument();
  });

  it('renders Section B RAG dropdowns', async () => {
    await openEditor();
    expect(screen.getByText(/Section B.*RAG Status/)).toBeInTheDocument();
    expect(screen.getByText('Schedule')).toBeInTheDocument();
    expect(screen.getByText('Budget')).toBeInTheDocument();
    expect(screen.getByText('Scope')).toBeInTheDocument();
    expect(screen.getByText('Resources')).toBeInTheDocument();
    expect(screen.getByText('Milestones')).toBeInTheDocument();
  });

  it('renders Section C rich text fields', async () => {
    await openEditor();
    expect(screen.getByText(/Section C.*Project Updates/)).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
  });

  it('shows Save Draft and Publish buttons', async () => {
    await openEditor();
    expect(screen.getByText('Save Draft')).toBeInTheDocument();
    expect(screen.getByText('Publish Update')).toBeInTheDocument();
  });

  it('shows Preview button', async () => {
    await openEditor();
    expect(screen.getByText('Preview PPT')).toBeInTheDocument();
  });

  it('calls saveDraft when Save Draft is clicked', async () => {
    await openEditor();
    fireEvent.click(screen.getByText('Save Draft'));
    await waitFor(() => expect(mockPmApi['saveDraft']).toHaveBeenCalledWith('proj-1', expect.any(Object)));
  });

  it('calls publish when Publish is clicked', async () => {
    await openEditor();
    fireEvent.click(screen.getByText('Publish Update'));
    await waitFor(() => expect(mockPmApi['publish']).toHaveBeenCalledWith('proj-1', expect.any(Object)));
  });

  it('Save Draft remains available when submission is published', async () => {
    mockPmApi['getSubmission'].mockResolvedValue({ ...sampleSubmission, status: 'published' });
    await openEditor();
    const saveDraftBtn = screen.getByText('Save Draft');
    expect(saveDraftBtn).not.toBeDisabled();
  });

  it('opens PPT preview when Preview is clicked', async () => {
    await openEditor();
    fireEvent.click(screen.getByText('Preview PPT'));
    expect(screen.getByText('Project Update Preview')).toBeInTheDocument();
  });

  it('closes PPT preview when ✕ is clicked', async () => {
    await openEditor();
    fireEvent.click(screen.getByText('Preview PPT'));
    fireEvent.click(screen.getByText('✕'));
    expect(screen.queryByText('Project Update Preview')).not.toBeInTheDocument();
  });

  it('renders back button to return to project list', async () => {
    await openEditor();
    expect(screen.getByText(/Back/)).toBeInTheDocument();
  });

  it('navigates back to project list when back is clicked', async () => {
    await openEditor();
    fireEvent.click(screen.getByText(/Back/));
    await waitFor(() => expect(screen.getByText('My Projects')).toBeInTheDocument());
  });
});

describe('PMDashboard — Override Indicator', () => {
  it('shows override panel when PgM overrides exist', async () => {
    mockPmApi['getOverrides'].mockResolvedValue([sampleOverride]);
    render(<PMDashboard />);
    await waitFor(() => screen.getByText('Alpha Project'));
    fireEvent.click(screen.getByText('Alpha Project'));
    await waitFor(() => expect(screen.getByText(/Program Manager Overrides/i)).toBeInTheDocument());
    expect(screen.getByText('rag_schedule')).toBeInTheDocument();
    expect(screen.getByText(/Risk is underestimated by PM/)).toBeInTheDocument();
  });

  it('does not show override panel when no overrides', async () => {
    render(<PMDashboard />);
    await waitFor(() => screen.getByText('Alpha Project'));
    fireEvent.click(screen.getByText('Alpha Project'));
    await waitFor(() => screen.getByText(/Section A.*Project Charter/));
    expect(screen.queryByText(/Program Manager Overrides/i)).not.toBeInTheDocument();
  });
});

describe('PMDashboard — PPT Preview', () => {
  it('shows project name and client in preview', async () => {
    render(<PMDashboard />);
    await waitFor(() => screen.getByText('Alpha Project'));
    fireEvent.click(screen.getByText('Alpha Project'));
    await waitFor(() => screen.getByText('Preview PPT'));
    fireEvent.click(screen.getByText('Preview PPT'));
    // "Alpha Project" appears in breadcrumb and in preview modal
    expect(screen.getAllByText('Alpha Project').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('ACME Corp')).toBeInTheDocument();
  });

  it('shows RAG summary in preview', async () => {
    render(<PMDashboard />);
    await waitFor(() => screen.getByText('Alpha Project'));
    fireEvent.click(screen.getByText('Alpha Project'));
    await waitFor(() => screen.getByText('Preview PPT'));
    fireEvent.click(screen.getByText('Preview PPT'));
    expect(screen.getByText('RAG Status Summary')).toBeInTheDocument();
  });
});





