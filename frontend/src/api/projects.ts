import { apiFetch } from './client.js';
import type { Stakeholder } from './pm.js';
import type { MilestoneEntry } from '../../../shared/src/types.js';

export interface AvailablePM {
  id: string;
  email: string;
  name: string | null;
}

export interface CreatedProject {
  id: string;
  name: string;
  client_name: string;
  assigned_pm_id: string | null;
  engagement_type: string | null;
  methodology: string | null;
  stakeholders: Stakeholder[];
  milestones: MilestoneEntry[];
  status: string;
}

export const projectsApi = {
  availablePMs: () => apiFetch<AvailablePM[]>('/projects/available-pms'),

  createProject: (data: { name: string; client_name: string; assigned_pm_id?: string; engagement_type: string; methodology: string; stakeholders?: Stakeholder[]; milestones?: Pick<MilestoneEntry, 'id' | 'name' | 'target_date' | 'status'>[] }) =>
    apiFetch<CreatedProject>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
