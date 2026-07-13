import { useEffect, useMemo, useRef, useState } from 'react';
import { Navbar } from '../components/Navbar.js';
import { RealtimeActivity } from '../components/RealtimeActivity.js';
import { useDashboardRealtime } from '../realtime/dashboardSocket.js';
import { cxoApi, type ExecutiveSummary } from '../api/cxo.js';
import type { PortfolioProject, ProjectDetail } from '../api/pgm.js';
import { Card, Badge, RAGBadge, EmptyState, Button, Input, Pagination, Tooltip } from '../components/ui/index.js';
import type { RAGValue } from '../components/ui/index.js';
import { usePagination } from '../hooks/usePagination.js';
import { useScrollLock } from '../hooks/useScrollLock.js';
import type { MilestoneEntry, RaidLog } from '../../../shared/src/types.js';

import { formatDate } from '../utils/date.js';

const ragFields = [
  ['rag_schedule', 'Schedule'],
  ['rag_budget', 'Budget'],
  ['rag_scope', 'Scope'],
  ['rag_resources', 'Resources'],
  ['rag_timeline', 'Timeline'],
] as const;

const typeColors: Record<string, string> = {
  Risk: 'bg-red-500/20 text-red-400',
  Issue: 'bg-amber-500/20 text-amber-400',
  Assumption: 'bg-blue-500/20 text-blue-400',
  Dependency: 'bg-purple-500/20 text-purple-400',
};

const statusColors: Record<string, string> = {
  Resolved: 'bg-green-500/20 text-green-400',
  'In Progress': 'bg-amber-500/20 text-amber-400',
  Pending: 'bg-surface-3 text-pip-muted',
};

function ragDirection(current: string | null, prev: string | null): 'up' | 'down' | null {
  if (!current || !prev || current === prev) return null;
  const score = (v: string) => v === 'green' ? 3 : v === 'amber' ? 2 : 1;
  return score(current) > score(prev) ? 'up' : 'down';
}

function MilestonesList({ milestones }: { milestones?: MilestoneEntry[] | null }) {
  const items = milestones ?? [];
  return (
    <section>
      <h3 className="font-sora font-semibold text-lg text-pip-text mb-4">Milestones</h3>
      {items.length === 0 ? (
        <div className="text-sm text-pip-muted italic bg-surface-2 border border-dashed border-pip-border rounded-lg p-4">
          No milestones reported.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-pip-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 border-b border-pip-border">
              <tr>
                <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider">Name</th>
                <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider">Target</th>
                <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pip-border">
              {items.map((milestone) => (
                <tr key={milestone.id}>
                  <td className="px-3 py-2 text-pip-text">{milestone.name}</td>
                  <td className="px-3 py-2 text-pip-secondary">{formatDate(milestone.target_date)}</td>
                  <td className="px-3 py-2 text-pip-secondary">{milestone.status || 'Unspecified'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}


function SummaryCard({ label, value, variant = 'default' }: { label: string; value: number, variant?: 'default' | 'green' | 'amber' | 'red' | 'blue' }) {
  const borderColors = {
    default: 'border-l-pip-border',
    green: 'border-l-green-500',
    amber: 'border-l-amber-500',
    red: 'border-l-red-500',
    blue: 'border-l-blue-500',
  };

  return (
    <Card className={`p-5 md:p-6 border-l-4 ${borderColors[variant]} pointer-events-none`}>
      <div className="text-pip-secondary font-medium mb-1 text-sm">{label}</div>
      <div className="text-3xl font-sora font-bold text-pip-text">{value}</div>
    </Card>
  );
}

const emptySummary: ExecutiveSummary = {
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
  timeline_green: 0,
  timeline_amber: 0,
  timeline_red: 0,
};

export function CXODashboard() {
  const realtime = useDashboardRealtime('cxo');
  const [summary, setSummary] = useState<ExecutiveSummary>(emptySummary);
  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useScrollLock(isSidebarOpen);

  const [detailTab, setDetailTab] = useState<'details' | 'raid'>('details');
  const [raidLogs, setRaidLogs] = useState<RaidLog[]>([]);

  const ragDistribution = useMemo(() => [
    ['Schedule', summary.schedule_green, summary.schedule_amber, summary.schedule_red],
    ['Budget', summary.budget_green, summary.budget_amber, summary.budget_red],
    ['Scope', summary.scope_green, summary.scope_amber, summary.scope_red],
    ['Resources', summary.resources_green, summary.resources_amber, summary.resources_red],
    ['Timeline', summary.timeline_green, summary.timeline_amber, summary.timeline_red],
  ], [summary]);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      (p.project_name ?? '').toLowerCase().includes(q) ||
      (p.client_name ?? '').toLowerCase().includes(q) ||
      (p.pm_name ?? '').toLowerCase().includes(q)
    );
  }, [projects, search]);

  const { page, setPage, pageSize, handlePageSizeChange, totalPages, paginated, totalItems } =
    usePagination(filteredProjects);

  async function loadDashboard() {
    const [nextSummary, nextProjects] = await Promise.all([
      cxoApi.summary(),
      cxoApi.projects(),
    ]);
    setSummary(nextSummary);
    setProjects(nextProjects);
  }

  async function openProject(projectId: string) {
    const [projectDetail, raidData] = await Promise.all([
      cxoApi.projectDetail(projectId),
      cxoApi.listRaid(projectId),
    ]);
    setDetail(projectDetail);
    setRaidLogs(raidData);
    setDetailTab('details');
    setIsSidebarOpen(true);
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  const lastProcessedEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    const latestEvent = realtime.events[0];
    if (!latestEvent) return;

    if (latestEvent.id === lastProcessedEventIdRef.current) {
      return;
    }
    lastProcessedEventIdRef.current = latestEvent.id;

    if (latestEvent.type === 'project.published' || latestEvent.type === 'field.overridden') {
      void loadDashboard();
      
      const payload = latestEvent.payload;
      if (payload && detail && latestEvent.type === 'field.overridden') {
        if (detail.id === payload.submission_id) {
          void openProject(detail.project_id);
        }
      }
    }
  }, [realtime.events, detail]);

  useEffect(() => {
    setPage(1);
  }, [search, setPage]);

  return (
    <div className="min-h-screen bg-base pb-12 flex flex-col">
      <Navbar title="Project Intelligence" />

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-8 py-8">
        <header className="mb-8">
          <h1 className="font-sora font-bold text-3xl text-pip-text mb-2 tracking-tight">Executive Dashboard</h1>
          <p className="text-pip-secondary text-base">High-level portfolio overview and organizational health metrics.</p>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <SummaryCard label="Active Projects" value={summary.total_active_projects} variant="blue" />
          <SummaryCard label="Green Health" value={summary.health_green} variant="green" />
          <SummaryCard label="Amber Health" value={summary.health_amber} variant="amber" />
          <SummaryCard label="Red Health" value={summary.health_red} variant="red" />
          <SummaryCard label="Not Submitted" value={summary.not_submitted} variant="default" />
        </section>

        <section className="mb-8">
          <Card className="overflow-hidden">
            <div className="p-5 border-b border-pip-border bg-surface-2 flex items-center justify-between">
              <h2 className="font-sora font-semibold text-pip-text">RAG Distribution Heatmap</h2>
            </div>
            <div className="p-6 overflow-x-auto">
              <div className="grid gap-3 min-w-[600px]">
                <div className="grid grid-cols-4 gap-4 items-center mb-2 px-4">
                  <div className="font-medium text-pip-secondary text-sm">Dimension</div>
                  <div className="font-medium text-green-500 text-sm">Green (On Track)</div>
                  <div className="font-medium text-amber-500 text-sm">Amber (At Risk)</div>
                  <div className="font-medium text-red-500 text-sm">Red (Critical)</div>
                </div>
                {ragDistribution.map(([label, green, amber, red]) => {
                  const total = (green as number) + (amber as number) + (red as number);
                  const pGreen = total ? ((green as number) / total) * 100 : 0;
                  const pAmber = total ? ((amber as number) / total) * 100 : 0;
                  const pRed = total ? ((red as number) / total) * 100 : 0;

                  return (
                    <div key={label as string} className="grid grid-cols-4 gap-4 items-center p-4 bg-surface-2 rounded-lg border border-pip-border">
                      <div className="font-semibold text-pip-text">{label}</div>

                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center font-bold text-lg border border-green-500/30">
                          {green}
                        </div>
                        <div className="flex-1 h-2 bg-surface-3 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500" style={{ width: `${pGreen}%` }}></div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-lg border border-amber-500/30">
                          {amber}
                        </div>
                        <div className="flex-1 h-2 bg-surface-3 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500" style={{ width: `${pAmber}%` }}></div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center font-bold text-lg border border-red-500/30">
                          {red}
                        </div>
                        <div className="flex-1 h-2 bg-surface-3 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500" style={{ width: `${pRed}%` }}></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </section>

        <section>
          <Card className="overflow-hidden">
            <div className="p-5 border-b border-pip-border bg-surface-2 flex items-center justify-between">
              <h2 className="font-sora font-semibold text-pip-text">Project Portfolio Details</h2>
            </div>
            <div className="p-4 border-b border-pip-border">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by project, client or PM…"
                className="max-w-sm"
                icon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                }
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-surface-2 border-b border-pip-border">
                    <th className="px-5 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider">Project</th>
                    <th className="px-5 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider">Client</th>
                    <th className="px-5 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider">PM</th>
                    <th className="px-5 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider">Current Active Phase</th>
                    {ragFields.map(([, label]) => (
                      <th key={label} className="px-3 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider text-center">{label}</th>
                    ))}
                    <th className="px-3 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider text-center">Health</th>
                    <th className="px-3 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider text-center">Milestones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pip-border">
                  {filteredProjects.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-6 py-12">
                        <EmptyState message={search.trim() ? 'No projects match your search.' : 'No projects match your criteria.'} />
                      </td>
                    </tr>
                  ) : paginated.map((project) => (
                    <tr key={project.project_id} className="hover:bg-surface-3 transition-colors">
                      <td className="px-5 py-4">
                        <button
                          className="font-sora font-semibold text-accent hover:underline text-left block w-full"
                          onClick={() => void openProject(project.project_id)}
                        >
                          {project.project_name}
                        </button>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-pip-secondary">{project.client_name}</td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-pip-secondary">{project.pm_name ?? 'Unassigned'}</td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm">
                        <Badge variant={project.publish_status === 'submitted' ? 'active' : 'inactive'}>
                          {project.sprint_name ?? 'Not Yet Submitted'}
                        </Badge>
                      </td>
                      {ragFields.map(([field]) => {
                        const prevField = `prev_${field}` as keyof PortfolioProject;
                        const dir = ragDirection(
                          project[field as keyof PortfolioProject] as string | null,
                          project[prevField] as string | null
                        );
                        return (
                          <td key={field} className="px-3 py-4 text-center">
                            <div className="flex justify-center items-center gap-1">
                              <RAGBadge value={(project[field as keyof PortfolioProject] as RAGValue) || null} />
                              {dir === 'up' && <span className="text-xs font-bold text-green-600">↑</span>}
                              {dir === 'down' && <span className="text-xs font-bold text-red-600">↓</span>}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-3 py-4 text-center">
                        <div className="flex justify-center items-center gap-1">
                          <RAGBadge value={(project.rag_project_health as RAGValue) || null} />
                          {ragDirection(project.rag_project_health, project.prev_rag_project_health) === 'up' && <span className="text-xs font-bold text-green-600">↑</span>}
                          {ragDirection(project.rag_project_health, project.prev_rag_project_health) === 'down' && <span className="text-xs font-bold text-red-600">↓</span>}
                        </div>
                      </td>
                      <td className="px-3 py-4 text-center">
                        <Badge variant="draft">{project.milestones_count ?? 0}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredProjects.length > 0 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={totalItems}
                onPageChange={setPage}
                onPageSizeChange={handlePageSizeChange}
              />
            )}
          </Card>
        </section>
      </main>

      {/* Slide-out Panel */}
      {detail && (
        <>
          <div className="fixed inset-0 bg-base/80 backdrop-blur-sm z-40" onClick={() => setIsSidebarOpen(false)} />
          <div
            className={`fixed inset-y-0 right-0 w-full md:w-[640px] bg-surface-1 sidebar-popup sidebar-gradient shadow-2xl z-50 transform transition-transform duration-300 ease-in-out border-l border-pip-border flex flex-col ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}
            onTransitionEnd={() => !isSidebarOpen && setDetail(null)}
          >
            <div className="px-6 py-4 border-b border-pip-border bg-surface-2 flex items-center justify-between shrink-0">
              <div>
                <div className="text-xs text-pip-muted mb-1 font-medium tracking-wide uppercase">Projects / {detail.project_name}</div>
                <h2 className="font-sora font-bold text-2xl text-pip-text mb-1">{detail.project_name}</h2>
                {(detail.project_start_date || detail.project_end_date) && (
                  <div className="text-xs text-pip-muted">
                    {formatDate(detail.project_start_date)}
                    {' — '}
                    {detail.project_end_date ? formatDate(detail.project_end_date) : 'Ongoing'}
                  </div>
                )}
              </div>
              <Button variant="ghost" onClick={() => setIsSidebarOpen(false)} className="text-pip-secondary hover:text-pip-text">
                ✕
              </Button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-pip-border bg-surface-2 shrink-0">
              {(['details', 'raid'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDetailTab(tab)}
                  className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${detailTab === tab ? 'border-accent text-accent' : 'border-transparent text-pip-secondary hover:text-pip-text'}`}
                >
                  {tab === 'raid' ? 'RAID Log' : 'Details'}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {detailTab === 'raid' ? (
                <div className="flex flex-col gap-4">
                  <h3 className="font-sora font-semibold text-lg text-pip-text">RAID Log</h3>
                  {raidLogs.length === 0 ? (
                    <div className="text-center py-8 text-pip-muted text-sm italic bg-surface-2 rounded-lg border border-dashed border-pip-border">
                      No RAID entries for this project.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-pip-border">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="bg-surface-2 border-b border-pip-border">
                            <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider">#</th>
                            <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider">Type</th>
                            <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider">Title</th>
                            <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider">Owner</th>
                            <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider">Impact</th>
                            <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-pip-border">
                          {raidLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-surface-2 transition-colors">
                              <td className="px-3 py-2 text-pip-muted text-xs">{log.raid_seq_id}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeColors[log.type] ?? ''}`}>{log.type}</span>
                              </td>
                              <td className="px-3 py-2 text-pip-text max-w-[200px]">
                                <Tooltip content={log.title}>
                                  {log.title}
                                </Tooltip>
                              </td>
                              <td className="px-3 py-2 text-pip-secondary text-xs">{log.owner ?? '—'}</td>
                              <td className="px-3 py-2 text-pip-secondary text-xs">{log.impact ?? '—'}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColors[log.status] ?? ''}`}>{log.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  <section className="bg-surface-2 p-5 rounded-lg border border-pip-border">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-pip-muted mb-1 uppercase tracking-wider">Client</div>
                        <div className="font-medium text-pip-text">{detail.client_name}</div>
                      </div>
                      <div>
                        <div className="text-xs text-pip-muted mb-1 uppercase tracking-wider">Project Manager</div>
                        <div className="font-medium text-pip-text">{detail.pm_name ?? 'Unassigned'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-pip-muted mb-1 uppercase tracking-wider">Sprint</div>
                        <div className="font-medium text-pip-text">{detail.sprint_name || 'N/A'}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-xs text-pip-muted mb-1 uppercase tracking-wider">Version</div>
                        <Badge variant="active">v{detail.version ?? 'None'}</Badge>
                      </div>
                    </div>
                  </section>

                  {detail.id ? (
                    <>
                      <section>
                        <h3 className="font-sora font-semibold text-lg text-pip-text mb-4">Health Dimensions</h3>
                        <div className="grid grid-cols-2 gap-3">
                          {ragFields.map(([field, label]) => {
                            const val = detail[field as keyof ProjectDetail] as RAGValue | undefined;
                            return (
                              <div key={field} className="p-3 rounded-lg border bg-surface-2 border-pip-border">
                                <span className="block text-xs font-medium text-pip-secondary mb-2">{label}</span>
                                <RAGBadge value={val || null} />
                              </div>
                            );
                          })}
                          {/* Project Health — read-only, auto-calculated */}
                          <div className="p-3 rounded-lg border bg-surface-2 border-pip-border">
                            <div>
                              <span className="block text-xs font-medium text-pip-secondary mb-1">Project Health</span>
                              <span className="block text-xs text-pip-muted mb-2">Auto-calculated</span>
                            </div>
                            <RAGBadge value={(detail.rag_project_health as RAGValue) || null} />
                          </div>
                        </div>
                      </section>

                      {/* Metadata — read-only for CXO */}
                      {(detail.engagement_type || detail.methodology) && (
                        <section className="bg-surface-2 p-5 rounded-lg border border-pip-border">
                          <h3 className="font-sora font-semibold text-base text-pip-text mb-3">Project Metadata</h3>
                          <div className="grid grid-cols-2 gap-4">
                            {detail.engagement_type && (
                              <div>
                                <div className="text-xs text-pip-muted mb-1 uppercase tracking-wider">Engagement Type</div>
                                <div className="font-medium text-pip-text text-sm">{detail.engagement_type}</div>
                              </div>
                            )}
                            {detail.methodology && (
                              <div>
                                <div className="text-xs text-pip-muted mb-1 uppercase tracking-wider">Methodology</div>
                                <div className="font-medium text-pip-text text-sm">{detail.methodology}</div>
                              </div>
                            )}
                          </div>
                        </section>
                      )}

                      {/* Stakeholders — read-only for CXO */}
                      {detail.stakeholders && detail.stakeholders.length > 0 && (
                        <section>
                          <h3 className="font-sora font-semibold text-base text-pip-text mb-3">Stakeholders</h3>
                          <div className="overflow-x-auto rounded-lg border border-pip-border">
                            <table className="w-full text-left text-sm">
                              <thead className="bg-surface-2 border-b border-pip-border">
                                <tr>
                                  <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider">Name</th>
                                  <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider">Contact</th>
                                  <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider">Email</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-pip-border">
                                {detail.stakeholders.map((s) => (
                                  <tr key={s.id} className="hover:bg-surface-2 transition-colors">
                                    <td className="px-3 py-2 text-pip-text">{s.name || '—'}</td>
                                    <td className="px-3 py-2 text-pip-secondary text-xs">{s.contact_no || '—'}</td>
                                    <td className="px-3 py-2 text-pip-secondary text-xs">{s.email || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </section>
                      )}

                      <MilestonesList milestones={detail.milestones} />

                      <section className="flex flex-col gap-6">
                        <div className="bg-surface-2 p-5 rounded-lg border border-pip-border">
                          <h3 className="font-semibold text-pip-text mb-2 text-sm">Project Overview</h3>
                          <div className="text-sm text-pip-secondary prose prose-invert prose-sm" dangerouslySetInnerHTML={{ __html: detail.overview || 'No overview provided.' }} />
                        </div>
                        <div className="bg-surface-2 p-5 rounded-lg border border-pip-border">
                          <h3 className="font-semibold text-pip-text mb-2 text-sm">Upcoming Priorities</h3>
                          <div className="text-sm text-pip-secondary prose prose-invert prose-sm" dangerouslySetInnerHTML={{ __html: detail.upcoming_deliverables || 'No priorities listed.' }} />
                        </div>
                        <div className="bg-surface-2 p-5 rounded-lg border border-pip-border">
                          <h3 className="font-semibold text-pip-text mb-2 text-sm">Business & Coordination</h3>
                          <div className="text-sm text-pip-secondary prose prose-invert prose-sm" dangerouslySetInnerHTML={{ __html: detail.business_coordination || 'No updates.' }} />
                        </div>
                        <div className="bg-surface-2 p-5 rounded-lg border border-pip-border">
                          <h3 className="font-semibold text-pip-text mb-2 text-sm">Feature Releases & Enhancements</h3>
                          <div className="text-sm text-pip-secondary prose prose-invert prose-sm" dangerouslySetInnerHTML={{ __html: detail.feature_releases || 'No updates.' }} />
                        </div>
                        <div className="bg-surface-2 p-5 rounded-lg border border-pip-border">
                          <h3 className="font-semibold text-pip-text mb-2 text-sm">Development & UAT</h3>
                          <div className="text-sm text-pip-secondary prose prose-invert prose-sm" dangerouslySetInnerHTML={{ __html: detail.development_uat || 'No updates.' }} />
                        </div>
                        <div className="bg-surface-2 p-5 rounded-lg border border-pip-border">
                          <h3 className="font-semibold text-pip-text mb-2 text-sm">Ongoing Work</h3>
                          <div className="text-sm text-pip-secondary prose prose-invert prose-sm" dangerouslySetInnerHTML={{ __html: detail.ongoing_work || 'No updates.' }} />
                        </div>
                      </section>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center px-4 bg-surface-2 rounded-xl border border-pip-border border-dashed">
                      <div className="w-16 h-16 rounded-full bg-surface-3 flex items-center justify-center mb-4 text-pip-muted">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                      </div>
                      <h3 className="font-sora font-semibold text-lg text-pip-text mb-2">Pending Report</h3>
                      <p className="text-pip-secondary max-w-sm">The Project Manager has not published any data for this project in the current period.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <RealtimeActivity connected={realtime.connected} events={realtime.events} />
    </div>
  );
}
