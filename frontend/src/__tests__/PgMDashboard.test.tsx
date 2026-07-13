import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgMDashboard } from '../pages/PgMDashboard.js';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from 'sonner';

vi.mock('../realtime/dashboardSocket.js', () => ({
  useDashboardRealtime: vi.fn(() => ({ connected: true, events: [] })),
}));

vi.mock('../api/pgm.js', () => ({
  pgmApi: {
    portfolio: vi.fn(),
    projectDetail: vi.fn(),
    history: vi.fn(),
    overrideField: vi.fn(),
    createProject: vi.fn(),
    listPMs: vi.fn(),
    assignPm: vi.fn(),
    setStatus: vi.fn(),
    patchProjectDates: vi.fn(),
    listRaid: vi.fn(),
    createRaidEntry: vi.fn(),
    updateRaidEntry: vi.fn(),
    deleteRaidEntry: vi.fn(),
    exportCsv: vi.fn(),
  },
}));

import { pgmApi } from '../api/pgm.js';

const mockPgmApi = pgmApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

const portfolioRows = [
  {
    project_id: 'proj-1',
    project_name: 'Alpha Project',
    client_name: 'ACME',
    assigned_pm_id: 'pm-1',
    pm_name: 'Jane PM',
    submission_id: 'sub-1',
    version: 2,
    sprint_name: 'Sprint 12',
    published_at: '2026-04-30T00:00:00Z',
    rag_schedule: 'green',
    rag_budget: 'amber',
    rag_scope: 'green',
    rag_resources: 'red',
    milestones_count: 1,
    publish_status: 'submitted',
  },
  {
    project_id: 'proj-2',
    project_name: 'Beta Project',
    client_name: 'Beta Co',
    assigned_pm_id: null,
    pm_name: null,
    submission_id: null,
    version: null,
    sprint_name: null,
    published_at: null,
    rag_schedule: null,
    rag_budget: null,
    rag_scope: null,
    rag_resources: null,
    milestones_count: 0,
    publish_status: 'not_submitted',
  },
];

const detail = {
  id: 'sub-1',
  project_id: 'proj-1',
  project_name: 'Alpha Project',
  client_name: 'ACME',
  pm_name: 'Jane PM',
  submitted_by: 'pm-1',
  status: 'published',
  version: 2,
  sprint_name: 'Sprint 12',
  sprint_start_date: '2026-04-01',
  sprint_end_date: '2026-04-14',
  stakeholder_name: 'Stakeholder',
  tech_team_size: 5,
  rag_schedule: 'green',
  rag_schedule_comment: null,
  rag_budget: 'amber',
  rag_budget_comment: null,
  rag_scope: 'green',
  rag_scope_comment: null,
  rag_resources: 'red',
  rag_resources_comment: null,
  milestones: [{ id: 'ms-1', name: 'Kickoff', target_date: '2026-04-10', status: 'On Track', comment: null }],
  overview: 'Project overview',
  business_coordination: null,
  feature_releases: null,
  development_uat: null,
  ongoing_work: null,
  upcoming_deliverables: 'Next delivery',
  updated_at: '2026-04-30T00:00:00Z',
  created_at: '2026-04-30T00:00:00Z',
  overrides: [],
  project_start_date: null,
  project_end_date: null,
  project_status: 'active',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPgmApi['portfolio'].mockResolvedValue(portfolioRows);
  mockPgmApi['projectDetail'].mockResolvedValue(detail);
  mockPgmApi['history'].mockResolvedValue([{ ...detail, submitted_by_name: 'Jane PM' }]);
  mockPgmApi['listPMs'].mockResolvedValue([{ id: 'pm-1', name: 'Jane PM', email: 'jane@test.com' }]);
  mockPgmApi['listRaid'].mockResolvedValue([]);
  mockPgmApi['patchProjectDates'].mockResolvedValue({ id: 'proj-1', project_start_date: null, project_end_date: null });
  mockPgmApi['assignPm'].mockResolvedValue(portfolioRows[0]);
  mockPgmApi['setStatus'].mockResolvedValue(portfolioRows[0]);
  mockPgmApi['overrideField'].mockResolvedValue({
    id: 'ovr-1',
    submission_id: 'sub-1',
    field_name: 'rag_schedule',
    original_value: 'green',
    override_value: 'red',
    override_reason: 'Schedule risk changed',
    overridden_by: 'pgm-id',
    created_at: '2026-04-30T00:00:00Z',
  });
  mockPgmApi['createProject'].mockResolvedValue(portfolioRows[0]);
});

describe('PgMDashboard', () => {
  it('renders portfolio rows and not submitted status', async () => {
    render(<PgMDashboard />);

    await waitFor(() => expect(screen.getAllByText('Alpha Project').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Beta Project').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pending Update').length).toBeGreaterThan(0);
    expect(screen.getByText('Program Office - Executive View')).toBeInTheDocument();
  });

  it('applies and clears filters', async () => {
    render(<PgMDashboard />);

    await waitFor(() => expect(screen.getAllByText('Alpha Project').length).toBeGreaterThan(0));
    fireEvent.change(screen.getByPlaceholderText('Search project, client, or PM...'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByDisplayValue('Any Health Status (RAG)'), { target: { value: 'red' } });
    fireEvent.click(screen.getByText('Apply Filters'));

    await waitFor(() => expect(mockPgmApi['portfolio']).toHaveBeenCalledWith(expect.objectContaining({
      rag_status: 'red',
    })));

    fireEvent.click(screen.getByText('Clear All'));
    await waitFor(() => expect(mockPgmApi['portfolio']).toHaveBeenCalledWith({}));
  });

  it('opens project drill-down and renders history navigation', async () => {
    render(<PgMDashboard />);

    await waitFor(() => expect(screen.getAllByText('Alpha Project').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Alpha Project')[0]);

    await waitFor(() => expect(screen.getByText('Project Charter')).toBeInTheDocument());
    expect(screen.getByText('Project overview')).toBeInTheDocument();
    expect(screen.getByText('Recent Submissions')).toBeInTheDocument();
    expect(screen.getByText('Version 2')).toBeInTheDocument();
  });

  it('validates and saves overrides', async () => {
    render(<PgMDashboard />);

    await waitFor(() => expect(screen.getAllByText('Alpha Project').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Alpha Project')[0]);
    await waitFor(() => screen.getByText('Project Charter'));

    fireEvent.click(screen.getAllByText('Schedule')[1]);
    fireEvent.change(screen.getByDisplayValue('Select New Status'), { target: { value: 'red' } });
    fireEvent.change(screen.getByPlaceholderText('Override reason / comment...'), { target: { value: 'Schedule risk changed' } });
    fireEvent.click(screen.getByText('Update Status'));

    await waitFor(() => expect(mockPgmApi['overrideField']).toHaveBeenCalledWith('sub-1', expect.objectContaining({
      field_name: 'rag_schedule',
      override_value: 'red',
    })));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Override saved.'));
  });

  it('opens project wizard from PgM dashboard', async () => {
    render(<PgMDashboard />);

    fireEvent.click(await screen.findByText('+ New Project'));
    expect(await screen.findByText('New Project Wizard')).toBeInTheDocument();
  });
});

