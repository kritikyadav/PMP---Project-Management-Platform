// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = 'system_admin' | 'program_manager' | 'pm' | 'cxo' | 'employee';

export type ProjectStatus = 'active' | 'archived';

export type SubmissionStatus = 'draft' | 'published';

export type RagValue = 'green' | 'amber' | 'red';

export type EngagementType = 'Fixed Cost' | 'T&M' | 'Hybrid';
export type Methodology = 'Agile' | 'Waterfall';

export type RaidType = 'Risk' | 'Assumption' | 'Issue' | 'Dependency';

export type RaidImpact = 'Low' | 'Medium' | 'High';

export type RaidUrgency = 'Low' | 'Medium' | 'High';

export type RaidProbability = 'Low' | 'Medium' | 'High';

export type RaidPriority = 'P1 - Critical' | 'P2 - High' | 'P3 - Medium' | 'P4 - Low';

export type RaidStatus = 'Pending' | 'In Progress' | 'Resolved';

// ─── Table interfaces ─────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  is_active: boolean;
  ms_department: string | null;
  ms_job_title: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  serial_number: number;
  user_id: string | null;
  employee_id: string;
  role: string;
  employee_name: string;
  allocation_percentage: number | null;
}

export interface Stakeholder {
  id: string;
  name: string;
  contact_no: string;
  email: string;
}

export interface MilestoneEntry {
  id: string;
  name: string;
  target_date: string | null;
  status: string;
  comment: string | null;
}

export interface MilestoneStatus {
  id: string;
  label: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  client_name: string;
  assigned_pm_id: string | null;
  status: ProjectStatus;
  project_start_date: string | null;
  project_end_date: string | null;
  stakeholders: Stakeholder[];
  team_members: TeamMember[];
  milestones: MilestoneEntry[];
  engagement_type: EngagementType | null;
  methodology: Methodology | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectSubmission {
  id: string;
  project_id: string;
  submitted_by: string;
  status: SubmissionStatus;
  version: number;

  // Section A
  sprint_name: string | null;
  sprint_start_date: string | null;
  sprint_end_date: string | null;
  stakeholder_name: string | null;
  tech_team_size: number | null;
  // Section B — RAG statuses and comments are independent
  rag_schedule: RagValue | null;
  rag_schedule_comment: string | null;
  rag_budget: RagValue | null;
  rag_budget_comment: string | null;
  rag_scope: RagValue | null;
  rag_scope_comment: string | null;
  rag_resources: RagValue | null;
  rag_resources_comment: string | null;
  // Timeline RAG (5th dimension)
  rag_timeline: RagValue | null;
  rag_timeline_comment: string | null;
  // Auto-calculated from 5 dimensions
  rag_project_health: RagValue | null;

  // Section B — Milestones (replaces rag_risks)
  milestones: MilestoneEntry[];

  // Section C — stored as Markdown
  overview: string | null;
  business_coordination: string | null;
  feature_releases: string | null;
  development_uat: string | null;
  ongoing_work: string | null;
  upcoming_deliverables: string | null;

  // Section D — Team Structure
  team_structure: TeamMember[] | null;

  created_at: string;
  updated_at: string;
}

export interface RaidLog {
  id: string;
  project_id: string;
  raid_seq_id: number;
  type: RaidType;
  date_raised: string;
  raised_by: string;
  raised_by_id: string | null;
  title: string;
  description: string | null;
  impact: RaidImpact | null;
  urgency: RaidUrgency | null;
  probability: RaidProbability | null;
  priority: RaidPriority | null;
  owner: string | null;
  status: RaidStatus;
  mitigation: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
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

export interface AuditLog {
  id: string;
  action: AuditAction;
  actor_id: string | null;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ─── Audit actions ────────────────────────────────────────────────────────────

export type AuditAction =
  | 'project.publish'
  | 'submission.override'
  | 'user.create'
  | 'user.deactivate'
  | 'project.create'
  | 'project.archive'
  | 'project.unarchive'
  | 'project.assign_pm'
  | 'project.update_status'
  | 'project.update_metadata';

// ─── JWT payload ──────────────────────────────────────────────────────────────

export interface JwtPayload {
  id: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}
