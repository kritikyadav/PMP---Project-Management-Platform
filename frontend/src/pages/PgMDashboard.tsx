import { useEffect, useMemo, useRef, useState } from 'react';
import { Info, AlertTriangle } from 'lucide-react';
import { Navbar } from '../components/Navbar.js';
import { ProjectCreationWizard } from '../components/ProjectCreationWizard.js';
import { RealtimeActivity } from '../components/RealtimeActivity.js';
import { useDashboardRealtime } from '../realtime/dashboardSocket.js';
import { pgmApi, type HistorySubmission, type PortfolioFilters, type PortfolioProject, type ProjectDetail } from '../api/pgm.js';
import { pmApi, type Stakeholder, type TeamMemberUser, type AllocationResult } from '../api/pm.js';
import { Card, Button, Badge, Input, Select } from '../components/ui/index.js';
import { usePagination } from '../hooks/usePagination.js';
import { useScrollLock } from '../hooks/useScrollLock.js';
import type { MilestoneEntry, RaidLog, TeamMember } from '../../../shared/src/types.js';
import { toast } from 'sonner';
import { formatDate, formatDateRange as fmtDateRange } from '../utils/date.js';
import { createClientId } from '../utils/id.js';
import { RAIDSection } from '../components/pgm/RAIDSection.js';
import { PortfolioTable } from '../components/pgm/PortfolioTable.js';
import { ProjectDetailPanel } from '../components/pgm/ProjectDetail.js';

function formatDateRange(start?: string | null, end?: string | null) {
  return fmtDateRange(start, end);
}



export function PgMDashboard() {
  const realtime = useDashboardRealtime('program_manager');
  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [filters, setFilters] = useState<PortfolioFilters>({});
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [history, setHistory] = useState<HistorySubmission[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<HistorySubmission | null>(null);
  const [overrideDraft, setOverrideDraft] = useState({ field_name: '', override_value: '', override_reason: '' });
  const [showWizard, setShowWizard] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useScrollLock(isSidebarOpen);

  const [pmsList, setPmsList] = useState<{ id: string, name: string | null, email: string }[]>([]);
  const [detailTab, setDetailTab] = useState<'details' | 'raid' | 'team'>('details');
  const [raidLogs, setRaidLogs] = useState<RaidLog[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [localMilestones, setLocalMilestones] = useState<MilestoneEntry[]>([]);
  const [milestonesSaving, setMilestonesSaving] = useState(false);

  // Stakeholders local state
  const [localStakeholders, setLocalStakeholders] = useState<Stakeholder[]>([]);

  // Team members local state
  const [localTeamMembers, setLocalTeamMembers] = useState<TeamMember[]>([]);
  const [teamMembersList, setTeamMembersList] = useState<TeamMemberUser[]>([]);
  const [teamSaving, setTeamSaving] = useState(false);
  const [teamAllocationErrors, setTeamAllocationErrors] = useState<Record<number, string>>({});
  const [memberAllocations, setMemberAllocations] = useState<Record<string, AllocationResult>>({});

  const [tooltipState, setTooltipState] = useState<{
    idx: number;
    userId: string;
    employeeName: string;
    projects: any[];
    totalAllocated: number;
    available: number;
    errorMsg?: string;
    coords: { top: number; left: number };
  } | null>(null);

  useEffect(() => {
    if (!tooltipState) return;
    const handleClose = () => {
      setTooltipState(null);
    };
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('click', handleClose);
    return () => {
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('click', handleClose);
    };
  }, [tooltipState]);

  const toggleTooltip = (e: React.MouseEvent, idx: number, member: TeamMember, stats: any, errorMsg?: string) => {
    e.stopPropagation();
    if (tooltipState && tooltipState.idx === idx) {
      setTooltipState(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipState({
      idx,
      userId: member.user_id!,
      employeeName: member.employee_name,
      projects: stats.projects,
      totalAllocated: stats.totalAllocated,
      available: stats.available,
      errorMsg,
      coords: {
        top: rect.top - 8,
        left: Math.max(8, rect.right - 256)
      }
    });
  };

  async function loadMemberAllocation(userId: string) {
    if (!detail) return;
    try {
      const res = await pmApi.getMemberAllocation(userId, detail.project_id);
      setMemberAllocations(prev => ({
        ...prev,
        [userId]: res
      }));
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    if (localTeamMembers) {
      localTeamMembers.forEach(m => {
        if (m.user_id && !memberAllocations[m.user_id]) {
          void loadMemberAllocation(m.user_id);
        }
      });
    }
  }, [localTeamMembers]);

  const teamAllocationTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const initialFieldsRef = useRef<{
    start: string | null;
    end: string | null;
    engagement_type: string | null;
    methodology: string | null;
  }>({ start: null, end: null, engagement_type: null, methodology: null });

  const submittedCount = useMemo(() => projects.filter((p) => p.publish_status === 'submitted').length, [projects]);

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      (p.project_name ?? '').toLowerCase().includes(q) ||
      (p.client_name ?? '').toLowerCase().includes(q) ||
      (p.pm_name ?? '').toLowerCase().includes(q)
    );
  }, [projects, search]);

  const sortedSearchFiltered = useMemo(() => {
    if (!sortField) return searchFiltered;
    const scoreMap: Record<string, number> = { green: 3, amber: 2, red: 1 };
    const getScore = (v: string | null | undefined) => (v ? scoreMap[v] ?? 0 : 0);

    return [...searchFiltered].sort((a, b) => {
      let aVal: any = '';
      let bVal: any = '';

      if (sortField === 'project_name') {
        aVal = (a.project_name ?? '').toLowerCase();
        bVal = (b.project_name ?? '').toLowerCase();
      } else if (sortField === 'client_name') {
        aVal = (a.client_name ?? '').toLowerCase();
        bVal = (b.client_name ?? '').toLowerCase();
      } else if (sortField === 'pm_name') {
        aVal = (a.pm_name ?? '').toLowerCase();
        bVal = (b.pm_name ?? '').toLowerCase();
      } else if (sortField === 'publish_status') {
        aVal = (a.publish_status ?? '').toLowerCase();
        bVal = (b.publish_status ?? '').toLowerCase();
      } else if (sortField === 'milestones_count') {
        aVal = a.milestones_count ?? 0;
        bVal = b.milestones_count ?? 0;
      } else if (sortField === 'rag_project_health') {
        aVal = getScore(a.rag_project_health);
        bVal = getScore(b.rag_project_health);
      } else if (
        sortField === 'rag_schedule' ||
        sortField === 'rag_budget' ||
        sortField === 'rag_scope' ||
        sortField === 'rag_resources' ||
        sortField === 'rag_timeline'
      ) {
        aVal = getScore(a[sortField as keyof typeof a] as string | null);
        bVal = getScore(b[sortField as keyof typeof b] as string | null);
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [searchFiltered, sortField, sortOrder]);

  const { page, setPage, pageSize, handlePageSizeChange, totalPages, paginated, totalItems } = usePagination(sortedSearchFiltered);

  useEffect(() => { setPage(1); }, [search, sortField, sortOrder]);

  async function loadPortfolio(nextFilters = filters) {
    const rows = await pgmApi.portfolio(nextFilters);
    setProjects(rows);
  }

  async function openProject(projectId: string) {
    const [projectDetail, projectHistory, raidData] = await Promise.all([
      pgmApi.projectDetail(projectId),
      pgmApi.history(projectId),
      pgmApi.listRaid(projectId),
    ]);
    setDetail(projectDetail);
    initialFieldsRef.current = {
      start: projectDetail.project_start_date || null,
      end: projectDetail.project_end_date || null,
      engagement_type: projectDetail.engagement_type || null,
      methodology: projectDetail.methodology || null,
    };
    setHistory(projectHistory);
    setRaidLogs(raidData);
    setLocalStakeholders(projectDetail.stakeholders ?? []);
    setLocalTeamMembers(projectDetail.team_members ?? []);
    setLocalMilestones((projectDetail.milestones as MilestoneEntry[] | undefined) ?? []);
    setSelectedVersion(null);
    setOverrideDraft({ field_name: '', override_value: '', override_reason: '' });
    setDetailTab('details');
    setTeamAllocationErrors({});
    setIsSidebarOpen(true);
  }

  async function refreshRaid() {
    if (!detail) return;
    const data = await pgmApi.listRaid(detail.project_id);
    setRaidLogs(data);
  }

  useEffect(() => {
    void loadPortfolio();
    pgmApi.listPMs().then(setPmsList).catch(() => { });
    pmApi.getTeamMembers().then(setTeamMembersList).catch(() => { });
  }, []);

  const lastProcessedEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    const latestEvent = realtime.events[0];
    if (!latestEvent) return;

    if (latestEvent.id === lastProcessedEventIdRef.current) {
      return;
    }
    lastProcessedEventIdRef.current = latestEvent.id;

    if (latestEvent.type === 'project.published') {
      void loadPortfolio();
      const payload = latestEvent.payload;
      if (payload && detail && detail.project_id === payload.project_id) {
        toast.info(`The Project Manager just published a new status update (version ${payload.version}). Reloading details.`);
        void openProject(detail.project_id);
      }
    }
  }, [realtime.events, detail]);


  async function applyFilters(next: PortfolioFilters) {
    if (next.sprint_start_date && next.sprint_end_date && next.sprint_start_date > next.sprint_end_date) {
      toast.error('Start date cannot be after end date.');
      setFieldErrors((current) => ({ ...current, sprint_end_date: 'End date cannot be before start date.' }));
      return;
    }
    setFieldErrors((current) => {
      const clean = { ...current };
      delete clean.sprint_start_date;
      delete clean.sprint_end_date;
      return clean;
    });
    setFilters(next);
    await loadPortfolio(next);
  }

  function validateFilterDates(next = filters) {
    if (next.sprint_start_date && next.sprint_end_date && next.sprint_start_date > next.sprint_end_date) {
      setFieldErrors((current) => ({ ...current, sprint_end_date: 'End date cannot be before start date.' }));
      toast.error('Start date cannot be after end date.');
      return false;
    }
    setFieldErrors((current) => {
      const clean = { ...current };
      delete clean.sprint_start_date;
      delete clean.sprint_end_date;
      return clean;
    });
    return true;
  }

  function validateOverrideField(field: 'override_value' | 'override_reason') {
    const next = { ...fieldErrors };
    if (field === 'override_value') {
      if (!overrideDraft.override_value) next.override_value = 'Select a new status.';
      else delete next.override_value;
    }
    if (field === 'override_reason') {
      if (overrideDraft.override_reason.trim().length < 10) next.override_reason = 'Reason must be at least 10 characters.';
      else delete next.override_reason;
    }
    setFieldErrors(next);
    return !next[field];
  }

  async function saveOverride() {
    if (!detail?.id) {
      toast.error('Select a submitted project before overriding.');
      return;
    }
    const validStatus = validateOverrideField('override_value');
    const validReason = validateOverrideField('override_reason');
    if (!validStatus || !validReason) {
      toast.error(!validStatus ? 'Select a new status before saving.' : 'Override reason must be at least 10 characters.');
      return;
    }
    await pgmApi.overrideField(detail.id, overrideDraft);
    await openProject(detail.project_id);
    await loadPortfolio();
    setOverrideDraft({ field_name: '', override_value: '', override_reason: '' });
    toast.success('Override saved.');
  }

  async function handleAssignPm(pmId: string | null) {
    if (!detail) return;
    await pgmApi.assignPm(detail.project_id, pmId);
    toast.success(pmId ? 'PM assigned.' : 'PM unassigned.');
    await openProject(detail.project_id);
    void loadPortfolio();
  }

  async function handleToggleStatus(currentStatus: 'active' | 'archived' | undefined) {
    if (!detail) return;
    const newStatus = currentStatus === 'archived' ? 'active' : 'archived';
    await pgmApi.setStatus(detail.project_id, newStatus);
    toast.success(`Project ${newStatus === 'archived' ? 'archived' : 'unarchived'}.`);
    setIsSidebarOpen(false);
    void loadPortfolio();
  }

  async function handleProjectDateBlur() {
    if (!detail) return;
    const start = detail.project_start_date || null;
    const end = detail.project_end_date || null;

    // Check if dates have actually changed from their initial values
    if (
      (start ? start.slice(0, 10) : null) === (initialFieldsRef.current.start ? initialFieldsRef.current.start.slice(0, 10) : null) &&
      (end ? end.slice(0, 10) : null) === (initialFieldsRef.current.end ? initialFieldsRef.current.end.slice(0, 10) : null)
    ) {
      return;
    }

    if (start && end && end < start) {
      toast.error('Project end date cannot be before project start date.');
      return;
    }

    const updated = await pgmApi.patchProjectDates(detail.project_id, {
      project_start_date: start,
      project_end_date: end,
    });
    setDetail({
      ...detail,
      project_start_date: updated.project_start_date,
      project_end_date: updated.project_end_date,
    });
    initialFieldsRef.current = {
      ...initialFieldsRef.current,
      start: updated.project_start_date || null,
      end: updated.project_end_date || null,
    };
    await loadPortfolio();
    toast.success('Project dates updated.');
  }

  async function handleMetadataBlur(field: 'engagement_type' | 'methodology', value: string) {
    if (!detail) return;
    const initialVal = initialFieldsRef.current[field];
    const currentVal = value || null;
    if (currentVal === initialVal) {
      return;
    }
    const updated = await pgmApi.patchProjectMetadata(detail.project_id, { [field]: currentVal });
    setDetail({
      ...detail,
      engagement_type: updated.engagement_type,
      methodology: updated.methodology,
    });
    initialFieldsRef.current[field] = currentVal;
  }

  async function handleStakeholdersBlur() {
    if (!detail) return;

    const stringify = (list: Stakeholder[]) => JSON.stringify(list.map(s => ({ name: s.name, contact: s.contact_no, email: s.email })));
    if (stringify(localStakeholders) === stringify(detail.stakeholders || [])) {
      return;
    }

    const nameMissing = localStakeholders.some(s => !s.name || !s.name.trim());
    if (nameMissing) {
      toast.error('Each stakeholder must include a name.');
      return;
    }

    const invalidEmail = localStakeholders.some(s => s.email && s.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email.trim()));
    if (invalidEmail) {
      toast.error('Invalid email format for stakeholder.');
      return;
    }

    const invalidContact = localStakeholders.some(s => s.contact_no && s.contact_no.trim() && !/^\d{10,15}$/.test(s.contact_no.trim()));
    if (invalidContact) {
      toast.error('Contact number must be a valid 10-15 digit number.');
      return;
    }

    const updated = await pgmApi.updateStakeholders(detail.project_id, localStakeholders);
    setDetail({ ...detail, stakeholders: updated });
  }

  async function handleTeamMembersSave() {
    if (!detail) return;
    if (Object.keys(teamAllocationErrors).length > 0) {
      toast.error('Fix over-allocation errors before saving.');
      return;
    }
    setTeamSaving(true);
    try {
      await pgmApi.updateProjectTeamMembers(detail.project_id, localTeamMembers);
      toast.success('Team members saved.');
    } catch {
      toast.error('Failed to save team.');
    } finally {
      setTeamSaving(false);
    }
  }

  async function handleMilestonesSave() {
    if (!detail?.id) return;
    setMilestonesSaving(true);
    try {
      const updated = await pgmApi.updateSubmissionMilestones(detail.project_id, detail.id, localMilestones);
      setLocalMilestones(updated);
      setDetail({ ...detail, milestones: updated } as ProjectDetail);
      toast.success('Milestones saved.');
    } catch {
      toast.error('Failed to save milestones.');
    } finally {
      setMilestonesSaving(false);
    }
  }

  async function handleExportCsv() {
    try {
      const blob = await pgmApi.exportCsv(filters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfolio_export_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to export CSV. Please try again.');
    }
  }

  function addStakeholder() {
    const newOne: Stakeholder = { id: createClientId('stakeholder'), name: '', contact_no: '', email: '' };
    setLocalStakeholders([...localStakeholders, newOne]);
  }

  async function removeStakeholder(id: string) {
    const nextList = localStakeholders.filter(s => s.id !== id);
    setLocalStakeholders(nextList);
    if (!detail) return;
    try {
      const updated = await pgmApi.updateStakeholders(detail.project_id, nextList);
      setDetail({ ...detail, stakeholders: updated });
    } catch {
      toast.error('Failed to update stakeholders after deletion.');
    }
  }

  function updateStakeholder(id: string, field: keyof Stakeholder, value: string) {
    const sanitizedVal = field === 'contact_no' ? value.replace(/[^\d]/g, '').slice(0, 15) : value;
    setLocalStakeholders(localStakeholders.map(s => s.id === id ? { ...s, [field]: sanitizedVal } : s));
  }

  async function moveStakeholder(index: number, direction: 'up' | 'down') {
    const next = [...localStakeholders];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= next.length) return;
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    setLocalStakeholders(next);
    if (!detail) return;
    try {
      const updated = await pgmApi.updateStakeholders(detail.project_id, next);
      setDetail({ ...detail, stakeholders: updated });
    } catch {
      toast.error('Failed to update stakeholder order.');
    }
  }

  async function checkTeamMemberAllocation(idx: number, member: TeamMember, currentProjectTeam?: TeamMember[]) {
    if (!detail) return;
    if (!member.user_id) {
      setTeamAllocationErrors(prev => { const n = { ...prev }; delete n[idx]; return n; });
      return;
    }
    if (!member.allocation_percentage || member.allocation_percentage <= 0) {
      setTeamAllocationErrors(prev => { const n = { ...prev }; delete n[idx]; return n; });
      return;
    }
    try {
      const result = await pmApi.getMemberAllocation(member.user_id, detail.project_id);
      setMemberAllocations(prev => ({ ...prev, [member.user_id!]: result }));
      const team = currentProjectTeam || localTeamMembers;
      const teamAllocations = team.reduce((sum, m) => m.user_id === member.user_id ? sum + (m.allocation_percentage || 0) : sum, 0);
      const total = result.total_allocated + teamAllocations;

      setTeamAllocationErrors(prev => {
        const next = { ...prev };
        team.forEach((m, i) => {
          if (m.user_id === member.user_id) delete next[i];
        });

        if (total > 100) {
          const occurrences = team.filter(m => m.user_id === member.user_id).length;
          const errMsg = occurrences > 1
            ? `${member.employee_name} is allocated multiple times (totaling ${teamAllocations}% in this project). Across other projects, they have ${result.total_allocated}% allocated. Max available: ${result.available}%.`
            : `${member.employee_name} already has ${result.total_allocated}% across ${result.projects.length} project(s). Max: ${result.available}%.`;
          team.forEach((m, i) => {
            if (m.user_id === member.user_id && m.allocation_percentage && m.allocation_percentage > 0) {
              next[i] = errMsg;
            }
          });
        }
        return next;
      });
    } catch { /* ignore */ }
  }

  function removeTeamMember(index: number) {
    const next = localTeamMembers.filter((_, i) => i !== index).map((m, i) => ({ ...m, serial_number: i + 1 }));
    setLocalTeamMembers(next);
    setTeamAllocationErrors({});
    next.forEach((m, i) => { void checkTeamMemberAllocation(i, m, next); });
  }

  function getMemberAllocationStats(userId: string, teamList: TeamMember[]) {
    const alloc = memberAllocations[userId];
    if (!alloc) return { totalAllocated: 0, available: 100, projects: [] };

    const currentProjectTotal = teamList.reduce((sum, m) => {
      return m.user_id === userId ? sum + (m.allocation_percentage || 0) : sum;
    }, 0);

    const totalAllocated = alloc.total_allocated + currentProjectTotal;
    const available = 100 - totalAllocated;

    const projectsList = [...alloc.projects];
    if (currentProjectTotal > 0 && detail) {
      projectsList.push({
        project_id: detail.project_id,
        project_name: `${detail.project_name} (this project)`,
        allocation_percentage: currentProjectTotal
      });
    }

    return {
      totalAllocated,
      available,
      projects: projectsList
    };
  }

  const activeSubmission = selectedVersion ?? detail;

  return (
    <div className="min-h-screen bg-base pb-12 flex flex-col">
      <Navbar title="Project Intelligence" />

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-8 py-8">

        <header className="mb-8 flex items-start justify-between">
          <div className="flex-1">
            <h1 className="font-sora font-bold text-3xl text-pip-text mb-2 tracking-tight">Program Office - Executive View</h1>
            <p className="text-pip-secondary text-base">Real-time health tracking and risk management across all initiatives.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={() => setShowWizard(true)}>+ New Project</Button>
            <Button variant="secondary" onClick={() => void handleExportCsv()}>Export CSV</Button>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 pointer-events-none">
            <div className="text-pip-secondary font-medium mb-1">Total Projects</div>
            <div className="text-3xl font-sora font-bold text-pip-text">{projects.length}</div>
          </Card>
          <Card className="p-6 border-l-4 border-l-green-500 pointer-events-none">
            <div className="text-pip-secondary font-medium mb-1">Submitted Reports</div>
            <div className="text-3xl font-sora font-bold text-pip-text">{submittedCount}</div>
          </Card>
          <Card className="p-6 border-l-4 border-l-amber-500 pointer-events-none">
            <div className="text-pip-secondary font-medium mb-1">Pending Updates</div>
            <div className="text-3xl font-sora font-bold text-pip-text">{projects.length - submittedCount}</div>
          </Card>
        </section>

        <section className="flex flex-wrap items-start gap-3 mb-8 p-4 bg-surface-2 rounded-lg border border-pip-border">
          <div className="w-44">
            <Select
              value={filters.rag_status ?? ''}
              onChange={(e) => setFilters({ ...filters, rag_status: e.target.value })}
              className=""
            >
              <option value="">Any Health Status (RAG)</option>
              <option value="green">Only Green</option>
              <option value="amber">Only Amber</option>
              <option value="red">Only Red</option>
            </Select>
          </div>
          <div className="w-44">
            <Select
              value={filters.publish_status ?? ''}
              onChange={(e) => setFilters({ ...filters, publish_status: e.target.value })}
              className=""
            >
              <option value="">Any Publish Status</option>
              <option value="submitted">Submitted</option>
              <option value="not_submitted">Pending Updates</option>
            </Select>
          </div>
          <div className="w-44">
            <Select
              value={filters.show_archived ?? ''}
              onChange={(e) => setFilters({ ...filters, show_archived: e.target.value })}
              className=""
            >
              <option value="">Active Projects Only</option>
              <option value="true">Include Archived</option>
            </Select>
          </div>

          <div className="relative">
            <Input
              type="date"
              lang="en-GB"
              value={filters.sprint_start_date ?? ''}
              onChange={(e) => {
                const next = { ...filters, sprint_start_date: e.target.value };
                setFilters(next);
                setFieldErrors((current) => ({ ...current, sprint_start_date: '', sprint_end_date: '' }));
              }}
              onBlur={() => validateFilterDates()}
              error={fieldErrors.sprint_start_date}
              className="w-32 pr-12"
            />
            <button
              type="button"
              aria-label="Open date picker"
              onClick={(e) => {
                const wrapper = e.currentTarget.parentElement;
                const inputEl = wrapper?.querySelector('input') as HTMLInputElement | null;
                if (inputEl) {
                  inputEl.focus();
                  if ((inputEl as any).showPicker) {
                    try { (inputEl as any).showPicker(); } catch { }
                  }
                }
              }}
              className="absolute right-2 top-[3px] w-8 h-8 rounded-md bg-accent text-pip-text flex items-center justify-center hover:opacity-90"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>
          </div>

          <div className="relative">
            <Input
              type="date"
              lang="en-GB"
              value={filters.sprint_end_date ?? ''}
              onChange={(e) => {
                const next = { ...filters, sprint_end_date: e.target.value };
                setFilters(next);
                setFieldErrors((current) => ({ ...current, sprint_end_date: '' }));
              }}
              onBlur={() => validateFilterDates()}
              error={fieldErrors.sprint_end_date}
              className="w-32 pr-12"
            />
            <button
              type="button"
              aria-label="Open date picker"
              onClick={(e) => {
                const wrapper = e.currentTarget.parentElement;
                const inputEl = wrapper?.querySelector('input') as HTMLInputElement | null;
                if (inputEl) {
                  inputEl.focus();
                  if ((inputEl as any).showPicker) {
                    try { (inputEl as any).showPicker(); } catch { }
                  }
                }
              }}
              className="absolute right-2 top-[3px] w-8 h-8 rounded-md bg-accent text-pip-text flex items-center justify-center hover:opacity-90"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>
          </div>

          <div className="flex-1"></div>
          <Button variant="primary" className="whitespace-nowrap" onClick={() => void applyFilters(filters)}>Apply Filters</Button>
          <Button variant="ghost" className="whitespace-nowrap" onClick={() => { void applyFilters({}); setSearch(''); }}>Clear All</Button>
        </section>

        <PortfolioTable
          searchFiltered={sortedSearchFiltered}
          paginated={paginated}
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          totalItems={totalItems}
          setPage={setPage}
          handlePageSizeChange={handlePageSizeChange}
          openProject={openProject}
          search={search}
          onSearchChange={setSearch}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={(field) => {
            if (sortField === field) {
              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
            } else {
              setSortField(field);
              setSortOrder('asc');
            }
          }}
        />
      </main>

      {/* Slide-out Panel */}
      {detail && (
        <>
          <div className="fixed inset-0 bg-base/80 backdrop-blur-sm z-40" onClick={() => setIsSidebarOpen(false)} />
          <div
            className={`fixed inset-y-0 right-0 w-full md:w-[800px] lg:w-[900px] bg-surface-1 sidebar-popup sidebar-gradient shadow-2xl z-50 transform transition-transform duration-300 ease-in-out border-l border-pip-border flex flex-col ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}
            onTransitionEnd={() => !isSidebarOpen && setDetail(null)}
          >
            <div className="px-6 py-4 border-b border-pip-border bg-surface-2 flex items-center justify-between shrink-0">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-xs text-pip-muted font-medium tracking-wide uppercase">Projects / {detail.project_name}</div>
                  <Badge variant={detail.project_status === 'archived' ? 'inactive' : 'active'}>
                    {detail.project_status === 'archived' ? 'Archived' : 'Active'}
                  </Badge>
                </div>
                <h2 className="font-sora font-bold text-2xl text-pip-text mb-1">{detail.project_name}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 max-w-md">
                  <div className="relative">
                    <label className="text-xs text-pip-muted">
                      <span className="block mb-1 uppercase tracking-wider">
                        Project Start
                      </span>

                      <input
                        type="date"
                        lang="en-GB"
                        value={detail.project_start_date ? detail.project_start_date.slice(0, 10) : ''}
                        onChange={(e) =>
                          setDetail({
                            ...detail,
                            project_start_date: e.target.value || null,
                          })
                        }
                        onBlur={() => void handleProjectDateBlur()}
                        className="w-full bg-surface-1 border border-pip-border rounded px-3 py-1 pr-12 text-sm text-pip-text focus:outline-none focus:border-accent"
                      />
                    </label>
                    <button
                      type="button"
                      aria-label="Open date picker"
                      onClick={(e) => {
                        const wrapper = e.currentTarget.parentElement;
                        const inputEl = wrapper?.querySelector('input') as HTMLInputElement | null;

                        if (inputEl) {
                          inputEl.focus();
                          if ((inputEl as any).showPicker) {
                            try {
                              (inputEl as any).showPicker();
                            } catch {}
                          }
                        }
                      }}
                      className="absolute right-2 top-[23px] w-6 h-6 rounded-md bg-accent text-pip-text flex items-center justify-center hover:opacity-90"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4"
                      >
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </button>
                  </div>
                  <div className="relative">
                    <label className="text-xs text-pip-muted">
                      <span className="block mb-1 uppercase tracking-wider">
                        Project End
                      </span>

                      <input
                        type="date"
                        lang="en-GB"
                        value={detail.project_end_date ? detail.project_end_date.slice(0, 10) : ''}
                        onChange={(e) =>
                          setDetail({
                            ...detail,
                            project_end_date: e.target.value || null,
                          })
                        }
                        onBlur={() => void handleProjectDateBlur()}
                        className="w-full bg-surface-1 border border-pip-border rounded px-3 py-1 pr-12 text-sm text-pip-text focus:outline-none focus:border-accent"
                      />
                    </label>

                    <button
                      type="button"
                      aria-label="Open date picker"
                      onClick={(e) => {
                        const wrapper = e.currentTarget.parentElement;
                        const inputEl = wrapper?.querySelector('input') as HTMLInputElement | null;

                        if (inputEl) {
                          inputEl.focus();
                          if ((inputEl as any).showPicker) {
                            try {
                              (inputEl as any).showPicker();
                            } catch {}
                          }
                        }
                      }}
                      className="absolute right-2 top-[23px] w-6 h-6 rounded-md bg-accent text-pip-text flex items-center justify-center hover:opacity-90"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4"
                      >
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </button>
                  </div>
                </div>
                {(detail.project_start_date || detail.project_end_date) && (
                  <div className="text-xs text-pip-muted mb-2">
                    {formatDate(detail.project_start_date)}
                    {' — '}
                    {detail.project_end_date ? formatDate(detail.project_end_date) : 'Ongoing'}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  {detail.pm_name ? (
                    <div className="inline-flex items-center bg-surface-3 rounded-full pl-3 pr-1 py-1 text-sm border border-pip-border">
                      <span className="text-pip-secondary mr-2">PM: {detail.pm_name}</span>
                      <button
                        onClick={() => void handleAssignPm(null)}
                        className="w-5 h-5 rounded-full hover:bg-surface-1 flex items-center justify-center text-pip-muted hover:text-red-400 transition-colors"
                        title="Unassign PM"
                      >✕</button>
                    </div>
                  ) : (
                    <Select className="w-48 text-sm py-1" onChange={(e) => void handleAssignPm(e.target.value)} value="">
                      <option value="">Assign PM...</option>
                      {pmsList.map(pm => <option key={pm.id} value={pm.id}>{pm.name || pm.email}</option>)}
                    </Select>
                  )}
                  <Button variant="primary" size="sm" onClick={() => void handleToggleStatus(detail.project_status)}>
                    {detail.project_status === 'archived' ? 'Unarchive Project' : 'Archive Project'}
                  </Button>
                </div>
              </div>
              <Button variant="primary" onClick={() => setIsSidebarOpen(false)} className="w-6 h-6 !p-0 !text-[10px] leading-none !rounded-full">
                ✕
              </Button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-pip-border bg-surface-2 shrink-0">
              {(['details', 'raid', 'team'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDetailTab(tab)}
                  className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${detailTab === tab ? 'border-accent text-accent' : 'border-transparent text-pip-secondary hover:text-pip-text'}`}
                >
                  {tab === 'raid' ? 'RAID Log' : tab === 'team' ? 'Team' : 'Details'}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {detailTab === 'raid' ? (
                <RAIDSection
                  projectId={detail.project_id}
                  logs={raidLogs}
                  onRefresh={() => void refreshRaid()}
                />
              ) : detailTab === 'team' ? (
                /* ── Team Tab ── */
                <Card className="p-6 md:p-8">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h3 className="font-sora font-semibold text-lg text-pip-text">Project Team</h3>
                      <p className="text-xs text-pip-muted mt-1">Persistent team allocation for this project. Independent of weekly submissions.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" onClick={() => {
                        setLocalTeamMembers(prev => [...prev, { serial_number: prev.length + 1, user_id: null, employee_id: '', role: '', employee_name: '', allocation_percentage: null }]);
                      }}>+ Add Member</Button>
                      <Button
                        variant="primary"
                        disabled={teamSaving || Object.keys(teamAllocationErrors).length > 0}
                        onClick={() => void handleTeamMembersSave()}
                      >{teamSaving ? 'Saving...' : 'Save Team'}</Button>
                    </div>
                  </div>

                  {Object.keys(teamAllocationErrors).length > 0 && (
                    <div className="mb-4 p-3 bg-red-900/20 border border-red-700/30 rounded text-sm text-red-400">
                      Fix over-allocation errors before saving.
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <div className="overflow-hidden rounded-lg border border-pip-border bg-surface-1">
                      <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                          <tr className="bg-surface-2 border-b border-pip-border">
                            <th className="px-5 py-3 font-medium text-pip-secondary text-sm w-[8%]">#</th>
                            <th className="px-5 py-3 font-medium text-pip-secondary text-sm w-[35%]">Employee</th>
                            <th className="px-5 py-3 font-medium text-pip-secondary text-sm w-[25%]">Role</th>
                            <th className="px-5 py-3 font-medium text-pip-secondary text-sm w-[15%]">Alloc %</th>
                            <th className="px-5 py-3 font-medium text-pip-secondary text-sm w-[10%]"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-pip-border">
                          {localTeamMembers.length === 0 ? (
                            <tr><td colSpan={5} className="px-5 py-6 text-center text-pip-muted text-sm">No team members. Click "+ Add Member" to start.</td></tr>
                          ) : localTeamMembers.map((member, idx) => (
                            <tr key={idx} className="hover:bg-surface-2/30 transition-colors">
                              <td className="px-5 py-3 text-pip-text text-sm">{idx + 1}</td>
                              <td className="px-5 py-3">
                                <Select
                                  value={member.user_id ?? ''}
                                  onChange={e => {
                                    const emp = teamMembersList.find(t => t.id === e.target.value);
                                    if (emp) {
                                      const updated: TeamMember = { ...member, user_id: emp.id, employee_name: emp.name || emp.email, role: emp.ms_job_title || 'Unassigned' };
                                      const nextTeam = localTeamMembers.map((m, i) => i === idx ? updated : m);
                                      setLocalTeamMembers(nextTeam);
                                      void loadMemberAllocation(emp.id);
                                      clearTimeout(teamAllocationTimers.current[idx]);
                                      teamAllocationTimers.current[idx] = setTimeout(() => void checkTeamMemberAllocation(idx, updated, nextTeam), 300);
                                    }
                                  }}
                                >
                                  <option value="">— Select Employee —</option>
                                  {teamMembersList.map(emp => {
                                    const alloc = memberAllocations[emp.id];
                                    let otherAlloc = 0;
                                    if (alloc) {
                                      otherAlloc += alloc.total_allocated;
                                    }
                                    const otherRowsAlloc = localTeamMembers.reduce((sum, m, i) => {
                                      return (i !== idx && m.user_id === emp.id) ? sum + (m.allocation_percentage || 0) : sum;
                                    }, 0);
                                    const totalExcludingCurrentRow = otherAlloc + otherRowsAlloc;
                                    const isOptionDisabled = totalExcludingCurrentRow >= 100;
                                    return (
                                      <option
                                        key={emp.id}
                                        value={emp.id}
                                        disabled={isOptionDisabled}
                                      >
                                        {emp.name || emp.email}
                                        {emp.ms_job_title ? ` (${emp.ms_job_title})` : ''}
                                        {isOptionDisabled ? ' (Fully Allocated)' : ''}
                                      </option>
                                    );
                                  })}
                                </Select>
                              </td>
                              <td className="px-5 py-3 text-pip-text text-sm">{member.role || '—'}</td>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number" min={1} max={100}
                                    className={`w-20 bg-surface-1 border rounded px-2 py-1 text-sm text-pip-text focus:outline-none focus:border-accent ${teamAllocationErrors[idx] ? 'border-red-500' : 'border-pip-border'}`}
                                    value={member.allocation_percentage ?? ''}
                                    onChange={e => {
                                      const updated: TeamMember = { ...member, allocation_percentage: e.target.value ? Number(e.target.value) : null };
                                      const nextTeam = localTeamMembers.map((m, i) => i === idx ? updated : m);
                                      setLocalTeamMembers(nextTeam);
                                      clearTimeout(teamAllocationTimers.current[idx]);
                                      teamAllocationTimers.current[idx] = setTimeout(() => void checkTeamMemberAllocation(idx, updated, nextTeam), 300);
                                    }}
                                    onBlur={() => void checkTeamMemberAllocation(idx, member)}
                                    placeholder="%"
                                  />
                                  {member.user_id && memberAllocations[member.user_id] && (() => {
                                    const stats = getMemberAllocationStats(member.user_id, localTeamMembers);
                                    const isOverAllocated = stats.totalAllocated > 100;
                                    return (
                                      <button
                                        type="button"
                                        className={`p-1.5 rounded-md hover:bg-surface-2 transition-colors shrink-0 ${isOverAllocated ? 'text-red-400' : 'text-green-400'}`}
                                        onClick={e => toggleTooltip(e, idx, member, stats, teamAllocationErrors[idx])}
                                        title="Click to toggle allocation breakdown"
                                      >
                                        {isOverAllocated ? (
                                          <AlertTriangle className="w-4 h-4" />
                                        ) : (
                                          <Info className="w-4 h-4" />
                                        )}
                                      </button>
                                    );
                                  })()}
                                </div>
                              </td>
                              <td className="px-5 py-3 text-right">
                                <Button variant="ghost" onClick={() => removeTeamMember(idx)} className="text-err-text hover:bg-red-900/20 px-2 py-1 h-auto text-xs">Remove</Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Card>
              ) : (
                /* ── Details Tab ── */
                <ProjectDetailPanel
                  activeSubmission={activeSubmission}
                  detail={detail}
                  setDetail={setDetail}
                  overrideDraft={overrideDraft}
                  setOverrideDraft={setOverrideDraft}
                  fieldErrors={fieldErrors}
                  setFieldErrors={setFieldErrors}
                  selectedVersion={selectedVersion}
                  validateOverrideField={validateOverrideField}
                  saveOverride={saveOverride}
                  localStakeholders={localStakeholders}
                  addStakeholder={addStakeholder}
                  removeStakeholder={removeStakeholder}
                  updateStakeholder={updateStakeholder}
                  moveStakeholder={moveStakeholder}
                  handleStakeholdersBlur={handleStakeholdersBlur}
                  handleMetadataBlur={handleMetadataBlur}
                  localMilestones={localMilestones}
                  setLocalMilestones={setLocalMilestones}
                  milestonesSaving={milestonesSaving}
                  handleMilestonesSave={handleMilestonesSave}
                  history={history}
                  setSelectedVersion={setSelectedVersion}
                  formatDateRange={formatDateRange}
                />
              )}
            </div>
          </div>
        </>
      )}

      <ProjectCreationWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onSuccess={() => { setShowWizard(false); void loadPortfolio(); }}
      />

      <RealtimeActivity connected={realtime.connected} events={realtime.events} />

      {tooltipState && (
        <div
          className="fixed z-[9999] bg-surface-2 border border-pip-border rounded-lg p-3 w-64 shadow-xl transition-all duration-150 transform -translate-y-full"
          style={{ top: `${tooltipState.coords.top}px`, left: `${tooltipState.coords.left}px` }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-1.5 font-semibold mb-2.5 text-pip-secondary text-[11px]">
            {tooltipState.totalAllocated > 100 ? (
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            ) : (
              <Info className="w-3.5 h-3.5 text-green-400 shrink-0" />
            )}
            <span>Allocation Breakdown</span>
          </div>

          {/* Projects List */}
          <div className="space-y-2 mb-3">
            {tooltipState.projects.length > 0 ? (
              tooltipState.projects.map((p, i) => {
                const isCurrent = p.project_name.includes('(this project)');
                const displayName = isCurrent ? p.project_name.replace(' (this project)', '') : p.project_name;
                return (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] items-center gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`truncate ${isCurrent ? 'text-accent font-semibold' : 'text-pip-muted font-medium'}`} title={displayName}>
                          {displayName}
                        </span>
                        {isCurrent && (
                          <span className="text-[8px] bg-accent/25 text-accent font-bold px-1 py-0.5 rounded shrink-0 uppercase tracking-wide">
                            Current
                          </span>
                        )}
                      </div>
                      <span className={`font-semibold shrink-0 ${isCurrent ? 'text-accent' : 'text-pip-secondary'}`}>{p.allocation_percentage}%</span>
                    </div>
                    <div className="h-1 w-full bg-pip-border/40 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isCurrent ? 'bg-accent' : 'bg-pip-secondary/60'}`}
                        style={{ width: `${Math.min(100, p.allocation_percentage)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-pip-muted italic text-[10px]">No active project allocations.</div>
            )}
          </div>

          {/* Total Capacity Progress Bar */}
          <div className="border-t border-pip-border/60 pt-2.5 mt-2.5">
            <div className="flex justify-between items-center mb-1 font-semibold text-[10px]">
              <span className="text-pip-secondary">Total Committed</span>
              <span className={tooltipState.totalAllocated > 100 ? 'text-red-400' : 'text-green-400'}>{tooltipState.totalAllocated}%</span>
            </div>
            <div className="h-1.5 w-full bg-pip-border/60 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${tooltipState.totalAllocated > 100 ? 'bg-red-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min(100, tooltipState.totalAllocated)}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-pip-muted mt-1 font-medium">
              <span>Available: {Math.max(0, tooltipState.available)}%</span>
              {tooltipState.totalAllocated > 100 && <span className="text-red-400 font-semibold">Over by {tooltipState.totalAllocated - 100}%</span>}
            </div>
          </div>

          {/* Error Alert Banner */}
          {tooltipState.errorMsg && (
            <div className="text-red-400 font-semibold mt-3 border-t border-red-700/20 pt-2 flex gap-1.5 items-start">
              <AlertTriangle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
              <span className="leading-tight text-[10px]">{tooltipState.errorMsg}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
