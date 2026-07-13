import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CXODashboard } from '../pages/CXODashboard.js';

vi.mock('../realtime/dashboardSocket.js', () => ({
  useDashboardRealtime: vi.fn(() => ({ connected: true, events: [] })),
}));

vi.mock('../api/cxo.js', () => ({
  cxoApi: {
    summary: vi.fn(),
    projects: vi.fn(),
    projectDetail: vi.fn(),
    listRaid: vi.fn(),
  },
}));

import { cxoApi } from '../api/cxo.js';

const mockCxoApi = cxoApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

const summary = {
  total_active_projects: 3,
  health_green: 1,
  health_amber: 1,
  health_red: 1,
  not_submitted: 0,
  schedule_green: 2,
  schedule_amber: 1,
  schedule_red: 0,
  budget_green: 1,
  budget_amber: 1,
  budget_red: 1,
  scope_green: 3,
  scope_amber: 0,
  scope_red: 0,
  resources_green: 1,
  resources_amber: 0,
  resources_red: 2,
};

const projects = [
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
  overview: 'Executive overview',
  business_coordination: 'Coordination update',
  feature_releases: 'Release update',
  development_uat: 'UAT update',
  ongoing_work: 'Ongoing update',
  upcoming_deliverables: 'Upcoming update',
  updated_at: '2026-04-30T00:00:00Z',
  created_at: '2026-04-30T00:00:00Z',
  overrides: [],
  project_start_date: null,
  project_end_date: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCxoApi['summary'].mockResolvedValue(summary);
  mockCxoApi['projects'].mockResolvedValue(projects);
  mockCxoApi['projectDetail'].mockResolvedValue(detail);
  mockCxoApi['listRaid'].mockResolvedValue([]);
});

describe('CXODashboard', () => {
  it('renders executive summary cards and RAG distribution', async () => {
    render(<CXODashboard />);

    await waitFor(() => expect(screen.getByText('Active Projects')).toBeInTheDocument());
    expect(screen.getByText('Red Health')).toBeInTheDocument();
    expect(screen.getByText('RAG Distribution Heatmap')).toBeInTheDocument();
    expect(screen.getAllByText('Schedule').length).toBeGreaterThan(0);
  });

  it('renders project summary table', async () => {
    render(<CXODashboard />);

    await waitFor(() => expect(screen.getByText('Alpha Project')).toBeInTheDocument());
    expect(screen.getByText('ACME')).toBeInTheDocument();
    expect(screen.getByText('Jane PM')).toBeInTheDocument();
  });

  it('opens read-only drill-down with no edit controls', async () => {
    render(<CXODashboard />);

    await waitFor(() => screen.getByText('Alpha Project'));
    fireEvent.click(screen.getByText('Alpha Project'));

    await waitFor(() => expect(screen.getByText('Health Dimensions')).toBeInTheDocument());
    expect(screen.getByText('Executive overview')).toBeInTheDocument();
    expect(screen.queryByText('Save Override')).not.toBeInTheDocument();
    expect(screen.queryByText('Override Field')).not.toBeInTheDocument();
  });
});
