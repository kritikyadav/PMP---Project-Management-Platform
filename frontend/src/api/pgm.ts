import { apiFetch, apiFetchBlob } from './client.js';
import type { Submission, SubmissionOverride, Stakeholder } from './pm.js';
import type { RaidLog, TeamMember } from '../../../shared/src/types.js';

export interface PortfolioProject {
  project_id: string;
  project_name: string;
  client_name: string;
  assigned_pm_id: string | null;
  pm_name: string | null;
  submission_id: string | null;
  version: number | null;
  sprint_name: string | null;
  published_at: string | null;
  rag_schedule: string | null;
  rag_budget: string | null;
  rag_scope: string | null;
  rag_resources: string | null;
  rag_timeline: string | null;
  rag_project_health: string | null;
  prev_rag_schedule: string | null;
  prev_rag_budget: string | null;
  prev_rag_scope: string | null;
  prev_rag_resources: string | null;
  prev_rag_timeline: string | null;
  prev_rag_project_health: string | null;
  milestones_count: number;
  publish_status: 'submitted' | 'not_submitted';
  project_status?: 'active' | 'archived';
  project_start_date?: string | null;
  project_end_date?: string | null;
}

export interface ProjectDetail extends Submission {
  project_id: string;
  project_name: string;
  client_name: string;
  pm_name: string | null;
  overrides: SubmissionOverride[];
  project_status?: 'active' | 'archived';
  project_start_date?: string | null;
  project_end_date?: string | null;
  rag_timeline: string | null;
  rag_project_health: string | null;
  engagement_type: string | null;
  methodology: string | null;
  stakeholders: Stakeholder[];
  team_members: TeamMember[];
}

export interface HistorySubmission extends Submission {
  submitted_by_name: string;
}

export interface PortfolioFilters {
  pm_name?: string;
  client_name?: string;
  rag_status?: string;
  publish_status?: string;
  show_archived?: string;
  sprint_start_date?: string;
  sprint_end_date?: string;
}

function queryString(filters: PortfolioFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

export const pgmApi = {
  portfolio: (filters: PortfolioFilters = {}) => {
    const query = queryString(filters);
    return apiFetch<PortfolioProject[]>(`/pgm/portfolio${query ? `?${query}` : ''}`);
  },

  projectDetail: (projectId: string) =>
    apiFetch<ProjectDetail>(`/pgm/projects/${projectId}`),

  history: (projectId: string) =>
    apiFetch<HistorySubmission[]>(`/pgm/projects/${projectId}/history`),

  overrideField: (submissionId: string, data: { field_name: string; override_value: string; override_reason: string }) =>
    apiFetch<SubmissionOverride>(`/pgm/submissions/${submissionId}/overrides`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  createProject: (data: { name: string; client_name: string; assigned_pm_id?: string; engagement_type: string; methodology: string; stakeholders?: Stakeholder[] }) =>
    apiFetch<PortfolioProject>('/pgm/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listPMs: () =>
    apiFetch<{ id: string; name: string | null; email: string }[]>('/pgm/pms'),

  assignPm: (projectId: string, assigned_pm_id: string | null) =>
    apiFetch<PortfolioProject>(`/pgm/projects/${projectId}/assign-pm`, {
      method: 'PUT',
      body: JSON.stringify({ assigned_pm_id }),
    }),

  setStatus: (projectId: string, status: 'active' | 'archived') =>
    apiFetch<PortfolioProject>(`/pgm/projects/${projectId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),

  patchProjectDates: (projectId: string, data: { project_start_date?: string | null; project_end_date?: string | null }) =>
    apiFetch<{ id: string; project_start_date: string | null; project_end_date: string | null }>(
      `/projects/${projectId}/dates`,
      { method: 'PATCH', body: JSON.stringify(data) }
    ),

  listRaid: (projectId: string) =>
    apiFetch<RaidLog[]>(`/projects/${projectId}/raid`),

  createRaidEntry: (projectId: string, data: any) =>
    apiFetch<RaidLog>(`/projects/${projectId}/raid`, { method: 'POST', body: JSON.stringify(data) }),

  updateRaidEntry: (projectId: string, raidId: string, data: any) =>
    apiFetch<RaidLog>(`/projects/${projectId}/raid/${raidId}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteRaidEntry: (projectId: string, raidId: string) =>
    apiFetch<void>(`/projects/${projectId}/raid/${raidId}`, { method: 'DELETE' }),

  exportCsv: (filters: PortfolioFilters = {}) => {
    const query = queryString(filters);
    return apiFetchBlob(`/pgm/portfolio/export${query ? `?${query}` : ''}`);
  },

  getProjectTeamMembers: (projectId: string) =>
    apiFetch<TeamMember[]>(`/projects/${projectId}/team-members`),

  updateProjectTeamMembers: (projectId: string, data: TeamMember[]) =>
    apiFetch<TeamMember[]>(`/projects/${projectId}/team-members`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  updateStakeholders: (projectId: string, data: Stakeholder[]) =>
    apiFetch<Stakeholder[]>(`/projects/${projectId}/stakeholders`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  patchProjectMetadata: (projectId: string, data: { engagement_type?: string; methodology?: string }) =>
    apiFetch<{ id: string; engagement_type: string | null; methodology: string | null }>(
      `/projects/${projectId}/metadata`,
      { method: 'PATCH', body: JSON.stringify(data) }
    ),

  updateSubmissionMilestones: (projectId: string, submissionId: string, milestones: import('../../../shared/src/types.js').MilestoneEntry[]) =>
    apiFetch<import('../../../shared/src/types.js').MilestoneEntry[]>(
      `/pgm/projects/${projectId}/submissions/${submissionId}/milestones`,
      { method: 'PATCH', body: JSON.stringify(milestones) }
    ),
};
