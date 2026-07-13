import { apiFetch } from './client.js';
import type { PortfolioProject, ProjectDetail } from './pgm.js';
import type { RaidLog } from '../../../shared/src/types.js';

export interface ExecutiveSummary {
  total_active_projects: number;
  health_green: number;
  health_amber: number;
  health_red: number;
  not_submitted: number;
  schedule_green: number;
  schedule_amber: number;
  schedule_red: number;
  budget_green: number;
  budget_amber: number;
  budget_red: number;
  scope_green: number;
  scope_amber: number;
  scope_red: number;
  resources_green: number;
  resources_amber: number;
  resources_red: number;
  timeline_green: number;
  timeline_amber: number;
  timeline_red: number;
}

export interface CxoFilters {
  sprint_start_date?: string;
  sprint_end_date?: string;
}

function queryString(filters: CxoFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

export const cxoApi = {
  summary: (filters: CxoFilters = {}) => {
    const query = queryString(filters);
    return apiFetch<ExecutiveSummary>(`/cxo/summary${query ? `?${query}` : ''}`);
  },

  projects: (filters: CxoFilters = {}) => {
    const query = queryString(filters);
    return apiFetch<PortfolioProject[]>(`/cxo/projects${query ? `?${query}` : ''}`);
  },

  projectDetail: (projectId: string) => apiFetch<ProjectDetail>(`/cxo/projects/${projectId}`),

  listRaid: (projectId: string) => apiFetch<RaidLog[]>(`/projects/${projectId}/raid`),
};
