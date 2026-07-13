import { Badge, EmptyState, Pagination, RAGBadge } from '../ui/index.js';
import type { PortfolioProject } from '../../api/pgm.js';
import type { RAGValue } from '../ui/index.js';

interface PortfolioTableProps {
  searchFiltered: PortfolioProject[];
  paginated: PortfolioProject[];

  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;

  setPage: (page: number) => void;
  handlePageSizeChange: (size: number) => void;

  openProject: (projectId: string) => Promise<void>;

  search: string;
  onSearchChange: (search: string) => void;

  sortField: string | null;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
}


const ragFields = [
  ['rag_schedule', 'Schedule'],
  ['rag_budget', 'Budget'],
  ['rag_scope', 'Scope'],
  ['rag_resources', 'Resources'],
  ['rag_timeline', 'Timeline'],
] as const;

function ragDirection(current: string | null, prev: string | null): 'up' | 'down' | null {
  if (!current || !prev || current === prev) return null;
  const score = (v: string) => v === 'green' ? 3 : v === 'amber' ? 2 : 1;
  return score(current) > score(prev) ? 'up' : 'down';
}


export function PortfolioTable({
  searchFiltered,
  paginated,

  page,
  pageSize,
  totalPages,
  totalItems,

  setPage,
  handlePageSizeChange,

  openProject,

  search,
  onSearchChange,

  sortField,
  sortOrder,
  onSort,
}: PortfolioTableProps) {
  const renderSortIcon = (field: string) => {
    if (sortField !== field) return <span className="ml-1 text-pip-muted/40 select-none">↕</span>;
    return sortOrder === 'asc' ? <span className="ml-1 text-accent select-none">↑</span> : <span className="ml-1 text-accent select-none">↓</span>;
  };

  return (
        <section className="overflow-hidden rounded-lg border border-pip-border bg-surface-1">
                    <div className="p-5 border-b border-pip-border bg-surface-2">
                    <div className="flex items-center relative">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-pip-secondary absolute ml-3 pointer-events-none"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                      <input
                        type="text"
                        placeholder="Search project, client, or PM..."
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="w-80 bg-surface-1 border border-pip-border rounded-lg px-3 py-2 pl-10 text-sm text-pip-text placeholder:text-pip-muted focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                    </div>
                    <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[900px]">
                        <thead>
                        <tr className="bg-surface-2 border-b border-pip-border">
                            <th
                              onClick={() => onSort('project_name')}
                              className="px-5 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider cursor-pointer hover:bg-surface-3 transition-colors select-none"
                            >
                              <div className="flex items-center gap-1">
                                Project Details {renderSortIcon('project_name')}
                              </div>
                            </th>
                            <th
                              onClick={() => onSort('publish_status')}
                              className="px-5 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-surface-3 transition-colors select-none"
                            >
                              <div className="flex items-center gap-1">
                                Current Active Phase {renderSortIcon('publish_status')}
                              </div>
                            </th>
                            {ragFields.map(([field, label]) => (
                            <th
                              key={label}
                              onClick={() => onSort(field)}
                              className="px-3 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider text-center cursor-pointer hover:bg-surface-3 transition-colors select-none"
                            >
                              <div className="flex items-center justify-center gap-1">
                                {label} {renderSortIcon(field)}
                              </div>
                            </th>
                            ))}
                            <th
                              onClick={() => onSort('rag_project_health')}
                              className="px-3 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider text-center cursor-pointer hover:bg-surface-3 transition-colors select-none"
                            >
                              <div className="flex items-center justify-center gap-1">
                                Health {renderSortIcon('rag_project_health')}
                              </div>
                            </th>
                            <th
                              onClick={() => onSort('milestones_count')}
                              className="px-3 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider text-center cursor-pointer hover:bg-surface-3 transition-colors select-none"
                            >
                              <div className="flex items-center justify-center gap-1">
                                Milestones {renderSortIcon('milestones_count')}
                              </div>
                            </th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-pip-border">
                        {searchFiltered.length === 0 ? (
                            <tr>
                            <td colSpan={9} className="px-6 py-12">
                                <EmptyState message={search.trim() ? 'No projects match your search.' : 'No projects match your criteria.'} />
                            </td>
                            </tr>
                        ) : paginated.map((project) => (
                            <tr key={project.project_id} className="hover:bg-surface-3 transition-colors">
                            <td className="px-5 py-4">
                                <button
                                className="font-sora font-semibold text-accent hover:underline text-left block w-full mb-1"
                                onClick={() => void openProject(project.project_id)}
                                >
                                {project.project_name}
                                </button>
                                <span className="text-xs text-pip-secondary">{project.client_name} • {project.pm_name ?? 'Unassigned PM'}</span>
                            </td>
                            <td className="px-5 py-4 whitespace-nowrap text-sm">
                                <Badge variant={project.publish_status === 'submitted' ? 'active' : 'inactive'}>
                                {project.publish_status === 'submitted' ? `Sprint: ${project.sprint_name}` : 'Pending Update'}
                                </Badge>
                            </td>
                            {ragFields.map(([field]) => {
                                const prevField = `prev_${field}` as keyof PortfolioProject;
                                const dir = ragDirection(
                                project[field as keyof PortfolioProject] as string | null,
                                project[prevField] as string | null
                                );
                                return (
                                <td key={field} className="px-3 py-4 text-center cursor-pointer" onClick={() => void openProject(project.project_id)}>
                                    <div className="flex justify-center items-center gap-1">
                                    <RAGBadge value={(project[field as keyof PortfolioProject] as RAGValue) || null} />
                                    {dir === 'up' && <span className="text-xs font-bold text-green-600">↑</span>}
                                    {dir === 'down' && <span className="text-xs font-bold text-red-600">↓</span>}
                                    </div>
                                </td>
                                );
                            })}
                            <td className="px-3 py-4 text-center cursor-pointer" onClick={() => void openProject(project.project_id)}>
                                <div className="flex justify-center items-center gap-1">
                                <RAGBadge value={(project.rag_project_health as RAGValue) || null} />
                                {ragDirection(project.rag_project_health, project.prev_rag_project_health) === 'up' && <span className="text-xs font-bold text-green-600">↑</span>}
                                {ragDirection(project.rag_project_health, project.prev_rag_project_health) === 'down' && <span className="text-xs font-bold text-red-600">↓</span>}
                                </div>
                            </td>
                            <td className="px-3 py-4 text-center cursor-pointer" onClick={() => void openProject(project.project_id)}>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rag-amber-bg text-rag-amber-text border border-rag-amber-bg/60">
                                    {project.milestones_count ?? 0}
                                </span>
                            </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    </div>
                    <Pagination
                    page={page}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    totalItems={totalItems}
                    onPageChange={setPage}
                    onPageSizeChange={handlePageSizeChange}
                    />
        </section>
  );
}

