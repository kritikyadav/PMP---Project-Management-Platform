import { apiFetch } from './client.js';
import type { TeamMember, MilestoneEntry, MilestoneStatus, RaidLog } from '../../../shared/src/types.js';

export interface Stakeholder {
  id: string;
  name: string;
  contact_no: string;
  email: string;
}

export type { TeamMember, MilestoneEntry, MilestoneStatus, RaidLog };

export interface PMProject {
  id: string;
  name: string;
  client_name: string;
  project_start_date: string | null;
  project_end_date: string | null;
  engagement_type: string | null;
  methodology: string | null;
  draft_id: string | null;
  draft_updated_at: string | null;
  published_version: number | null;
  published_updated_at: string | null;
  published_sprint_start_date: string | null;
  rag_project_health: string | null;
  rag_schedule: string | null;
  rag_budget: string | null;
  rag_scope: string | null;
  rag_resources: string | null;
  rag_timeline: string | null;
  tech_team_size: number | null;
  milestones?: MilestoneEntry[];
}

export interface Submission {
  id: string;
  project_id: string;
  submitted_by: string;
  status: 'draft' | 'published';
  version: number;
  sprint_name: string | null;
  sprint_start_date: string | null;
  sprint_end_date: string | null;
  stakeholder_name: string | null;
  tech_team_size: number | null;
  rag_schedule: string | null;
  rag_schedule_comment: string | null;
  rag_budget: string | null;
  rag_budget_comment: string | null;
  rag_scope: string | null;
  rag_scope_comment: string | null;
  rag_resources: string | null;
  rag_resources_comment: string | null;
  rag_timeline: string | null;
  rag_timeline_comment: string | null;
  rag_project_health: string | null;
  milestones: MilestoneEntry[];
  overview: string | null;
  business_coordination: string | null;
  feature_releases: string | null;
  development_uat: string | null;
  ongoing_work: string | null;
  upcoming_deliverables: string | null;
  team_structure: TeamMember[] | null;
  updated_at: string;
  created_at: string;
}

export interface SubmissionOverride {
  id: string;
  submission_id: string;
  field_name: string;
  original_value: string | null;
  override_value: string;
  override_reason: string;
  overridden_by: string;
  created_at: string;
}

export type SubmissionFields = Omit<Submission, 'id' | 'project_id' | 'submitted_by' | 'status' | 'version' | 'updated_at' | 'created_at'>;

export interface TeamMemberUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  ms_department: string | null;
  ms_job_title: string | null;
}

export interface AllocationResult {
  total_allocated: number;
  available: number;
  projects: { project_id: string; project_name: string; allocation_percentage: number }[];
}

export const pmApi = {
  listProjects: () =>
    apiFetch<PMProject[]>('/pm/projects'),

  getTeamMembers: () =>
    apiFetch<TeamMemberUser[]>('/pm/team-members'),

  getMemberAllocation: (userId: string, excludeProjectId?: string) => {
    const q = excludeProjectId ? `?exclude_project_id=${excludeProjectId}` : '';
    return apiFetch<AllocationResult>(`/pm/members/${userId}/allocation${q}`);
  },

  getSubmission: (projectId: string) =>
    apiFetch<Submission | null>(`/pm/projects/${projectId}/submission`),

  saveDraft: (projectId: string, data: Partial<SubmissionFields>) =>
    apiFetch<Submission>(`/pm/projects/${projectId}/submission/draft`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  publish: (projectId: string, data: Partial<SubmissionFields>) =>
    apiFetch<Submission>(`/pm/projects/${projectId}/submission/publish`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getOverrides: (projectId: string) =>
    apiFetch<SubmissionOverride[]>(`/pm/projects/${projectId}/overrides`),

  patchProjectDates: (projectId: string, data: { project_start_date?: string | null; project_end_date?: string | null }) =>
    apiFetch<{ id: string; name: string; project_start_date: string | null; project_end_date: string | null }>(
      `/projects/${projectId}/dates`,
      { method: 'PATCH', body: JSON.stringify(data) }
    ),

  listRaid: (projectId: string) =>
    apiFetch<RaidLog[]>(`/projects/${projectId}/raid`),

  createRaidEntry: (projectId: string, data: Partial<Omit<RaidLog, 'id' | 'project_id' | 'raid_seq_id' | 'created_at' | 'updated_at' | 'created_by' | 'raised_by_id'>>) =>
    apiFetch<RaidLog>(`/projects/${projectId}/raid`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateRaidEntry: (projectId: string, raidId: string, data: Partial<RaidLog>) =>
    apiFetch<RaidLog>(`/projects/${projectId}/raid/${raidId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteRaidEntry: (projectId: string, raidId: string) =>
    apiFetch<void>(`/projects/${projectId}/raid/${raidId}`, { method: 'DELETE' }),

  listMilestoneStatuses: () =>
    apiFetch<MilestoneStatus[]>('/milestone-statuses'),

  createMilestoneStatus: (label: string) =>
    apiFetch<MilestoneStatus>('/milestone-statuses', {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),

  getProjectTeamMembers: (projectId: string) =>
    apiFetch<TeamMember[]>(`/projects/${projectId}/team-members`),

  updateProjectTeamMembers: (projectId: string, data: TeamMember[]) =>
    apiFetch<TeamMember[]>(`/projects/${projectId}/team-members`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getStakeholders: (projectId: string) =>
    apiFetch<Stakeholder[]>(`/projects/${projectId}/stakeholders`),

  updateStakeholders: (projectId: string, data: Stakeholder[]) =>
    apiFetch<Stakeholder[]>(`/projects/${projectId}/stakeholders`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getMilestones: (projectId: string) =>
    apiFetch<MilestoneEntry[]>(`/projects/${projectId}/milestones`),

  updateMilestones: (projectId: string, data: MilestoneEntry[]) =>
    apiFetch<MilestoneEntry[]>(`/projects/${projectId}/milestones`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  patchProjectMetadata: (projectId: string, data: { engagement_type?: string; methodology?: string }) =>
    apiFetch<{ id: string; engagement_type: string | null; methodology: string | null }>(
      `/projects/${projectId}/metadata`,
      { method: 'PATCH', body: JSON.stringify(data) }
    ),
};
