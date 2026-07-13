import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Info, AlertTriangle } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Navbar } from '../components/Navbar.js';
import { useAuth } from '../App.js';
import {
  pmApi,
  type PMProject, type Submission, type SubmissionFields,
  type SubmissionOverride, type TeamMemberUser, type AllocationResult,
} from '../api/pm.js';
import type {
  TeamMember,
  Stakeholder,
  MilestoneEntry,
  MilestoneStatus,
  RaidLog,
  RaidType,
  RaidImpact,
  RaidUrgency,
  RaidProbability,
  RaidPriority,
  RaidStatus,
} from '../../../shared/src/types.js';
import { computeProjectHealth } from '../../../shared/src/projectHealth.js';
import { Card, Button, Badge, Input, Select, Spinner, ErrorBanner, EmptyState, Modal, RAGBadge, Pagination, Tooltip, useConfirm } from '../components/ui/index.js';
import type { RAGValue } from '../components/ui/index.js';
import { toast } from 'sonner';
import { formatDate } from '../utils/date.js';
import { createClientId } from '../utils/id.js';
import { usePagination } from '../hooks/usePagination.js';
import { connectDashboardSocket } from '../realtime/dashboardSocket.js';

type FormState = Partial<SubmissionFields>;

const RAG_OPTIONS = ['green', 'amber', 'red'] as const;
const RAG_LABELS: Record<string, string> = { green: 'Green', amber: 'Amber', red: 'Red' };

const RAG_DIMENSIONS = [
  { key: 'rag_schedule', commentKey: 'rag_schedule_comment', label: 'Schedule' },
  { key: 'rag_budget', commentKey: 'rag_budget_comment', label: 'Budget' },
  { key: 'rag_scope', commentKey: 'rag_scope_comment', label: 'Scope' },
  { key: 'rag_resources', commentKey: 'rag_resources_comment', label: 'Resources' },
  { key: 'rag_timeline', commentKey: 'rag_timeline_comment', label: 'Timeline' },
] as const;

const SECTION_C_FIELDS = [
  { key: 'overview', label: 'Overview' },
  { key: 'business_coordination', label: 'Business & Coordination' },
  { key: 'feature_releases', label: 'Feature Releases & Enhancements' },
  { key: 'development_uat', label: 'Development & UAT' },
  { key: 'ongoing_work', label: 'Ongoing Work' },
  { key: 'upcoming_deliverables', label: 'Upcoming Priority Deliverables' },
] as const;

const RAID_TYPES = ['Risk', 'Assumption', 'Issue', 'Dependency'] as const;
const RAID_IMPACT_OPTIONS = ['Low', 'Medium', 'High'] as const;
const RAID_PRIORITY_OPTIONS = ['P1 - Critical', 'P2 - High', 'P3 - Medium', 'P4 - Low'] as const;
const RAID_STATUS_OPTIONS = ['Pending', 'In Progress', 'Resolved'] as const;

function today() { return new Date().toISOString().slice(0, 10); }

function normalizeDates<T extends Record<string, any>>(form: T): T {
  const f: Record<string, any> = { ...form };
  for (const key of ['sprint_start_date', 'sprint_end_date']) {
    if (typeof f[key] === 'string' && f[key]) f[key] = (f[key] as string).slice(0, 10);
  }
  return f as T;
}

// ─── Rich Text Editor ─────────────────────────────────────────────────────────

function RichTextEditor({ value, onChange, editable = true }: { value: string; onChange: (v: string) => void; editable?: boolean }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || '',
    editable,
    editorProps: {
      attributes: {
        style: 'min-height: 156px; width: 100%; outline: none; cursor: text;',
      },
    },
    onUpdate: ({ editor }) => { if (editable) onChange(editor.getHTML()); },
  });
  useEffect(() => {
    if (editor && editor.getHTML() !== value) editor.commands.setContent(value || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);
  return (
    <div className={`p-3 rounded border border-pip-border ${editable ? 'bg-surface-1' : 'bg-surface-2 opacity-80'}`}>
      <EditorContent editor={editor} />
    </div>
  );
}

// ─── Milestone Status Combobox ─────────────────────────────────────────────────

function MilestoneStatusCombobox({ value, onChange, statuses, onCreateStatus, disabled }: {
  value: string;
  onChange: (v: string) => void;
  statuses: MilestoneStatus[];
  onCreateStatus: (label: string) => Promise<void>;
  disabled?: boolean;
}) {
  const listId = useRef(`ms-${Math.random().toString(36).slice(2)}`).current;
  async function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    const val = e.target.value.trim();
    if (!val) return;
    const exists = statuses.some(s => s.label.toLowerCase() === val.toLowerCase());
    if (!exists) await onCreateStatus(val);
  }
  return (
    <>
      <input
        className="w-full bg-surface-1 border border-pip-border rounded px-3 py-2 text-sm text-pip-text focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
        list={listId}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder="Status..."
      />
      <datalist id={listId}>
        {statuses.map(s => <option key={s.id} value={s.label} />)}
      </datalist>
    </>
  );
}

// ─── PPT Preview ─────────────────────────────────────────────────────────────

function PPTPreview({ form, project, pmName, onClose }: { form: FormState; project: PMProject; pmName: string; onClose: () => void }) {
  const projectDates = project.project_start_date || project.project_end_date
    ? `${project.project_start_date || '-'} -> ${project.project_end_date || '-'}`
    : '-';
  return (
    <Modal open={true} onClose={onClose} title="Project Update Preview" maxWidth="max-w-4xl">
      <div className="flex flex-col gap-6">
        <Card className="bg-surface-3 border-none p-6 text-pip-text">
          <div className="text-2xl font-sora font-bold mb-1">{project.name}</div>
          <div className="text-pip-secondary text-sm mb-4">{project.client_name}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-pip-muted">
            <span>Sprint: {(form.sprint_name as string) || '—'}</span>
            <span>|</span>
            <span>PM: {pmName}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-pip-muted mt-2">
            <span>{formatDate(form.sprint_start_date as string)} → {formatDate(form.sprint_end_date as string)}</span>
            <span>|</span>
            <span>Team size: {(form.tech_team_size as number) ?? '—'}</span>
            <span>|</span>
            <span>Project dates: {projectDates}</span>
          </div>
        </Card>

        <Card className="p-6">
          <div className="font-semibold text-pip-text mb-4">RAG Status Summary</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {RAG_DIMENSIONS.map(({ key, commentKey, label }) => {
              const val = form[key as keyof FormState] as RAGValue | undefined;
              const comment = form[commentKey as keyof FormState] as string | undefined;
              return (
                <div key={key} className="bg-surface-2 p-3 rounded flex flex-col items-center justify-center gap-2 border border-pip-border text-center">
                  <div className="font-semibold text-pip-text text-sm">{label}</div>
                  <RAGBadge value={val || null} />
                  {comment && <div className="text-xs text-pip-secondary mt-1">{comment}</div>}
                </div>
              );
            })}
          </div>
        </Card>

        {((form.milestones as MilestoneEntry[]) || []).length > 0 && (
          <Card className="p-6">
            <div className="font-semibold text-pip-text mb-4">Milestones</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-pip-border text-pip-secondary text-xs">
                  <th className="py-2 text-left">Name</th>
                  <th className="py-2 text-left">Target Date</th>
                  <th className="py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pip-border">
                {((form.milestones as MilestoneEntry[]) || []).map(m => (
                  <tr key={m.id}>
                    <td className="py-2 text-pip-text">{m.name}</td>
                    <td className="py-2 text-pip-secondary">{formatDate(m.target_date)}</td>
                    <td className="py-2 text-pip-secondary">{m.status || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SECTION_C_FIELDS.map(({ key, label }) => {
            const content = form[key as keyof FormState] as string | undefined;
            if (!content) return null;
            return (
              <Card key={key} className="p-5">
                <div className="font-semibold text-pip-text mb-3">{label}</div>
                <div className="text-sm text-pip-secondary prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: content }} />
              </Card>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

// ─── Override Indicator ───────────────────────────────────────────────────────

function OverridePanel({ overrides }: { overrides: SubmissionOverride[] }) {
  if (overrides.length === 0) return null;
  return (
    <div className="mb-6 p-4 bg-amber-900/20 border border-amber-700/30 rounded-lg">
      <div className="font-semibold text-amber-500 mb-3">⚠ Program Manager Overrides ({overrides.length})</div>
      <div className="flex flex-col gap-3">
        {overrides.map(o => (
          <div key={o.id} className="text-sm text-pip-secondary bg-surface-1/50 p-3 rounded">
            <span className="font-medium text-pip-text block mb-1">{o.field_name}</span>
            <div className="mb-1">
              Original: <span className="line-through opacity-70">{o.original_value ?? '—'}</span>
              <span className="mx-2">→</span>
              Override: <span className="text-amber-400 font-medium">{o.override_value}</span>
            </div>
            <div className="text-xs text-pip-muted italic">Reason: {o.override_reason}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── RAID Log Section ─────────────────────────────────────────────────────────

type RaidFormState = {
  type: RaidType | ''; date_raised: string; raised_by: string; title: string;
  description: string; impact: RaidImpact | ''; urgency: RaidUrgency | ''; probability: RaidProbability | '';
  priority: RaidPriority | ''; owner: string; status: RaidStatus | ''; mitigation: string;
};

const blankRaidForm = (): RaidFormState => ({
  type: '', date_raised: today(), raised_by: '', title: '',
  description: '', impact: '', urgency: '', probability: '',
  priority: '', owner: '', status: 'Pending', mitigation: '',
});

function raidPayload(form: RaidFormState): Partial<RaidLog> {
  return {
    ...form,
    type: form.type || undefined,
    impact: form.impact || undefined,
    urgency: form.urgency || undefined,
    probability: form.probability || undefined,
    priority: form.priority || undefined,
    status: form.status || undefined,
  };
}

function RaidLogSection({ projectId, readOnly = false }: { projectId: string; readOnly?: boolean }) {
  const confirm = useConfirm();
  const [entries, setEntries] = useState<RaidLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<RaidFormState>(blankRaidForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RaidFormState>(blankRaidForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try { setEntries(await pmApi.listRaid(projectId)); } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [projectId]);

  function validateRaidForm(f: RaidFormState) {
    const errs: Record<string, string> = {};
    if (!f.type) errs.type = 'Required';
    if (!f.title.trim()) errs.title = 'Required';
    if (!f.status) errs.status = 'Required';
    return errs;
  }

  async function handleAdd() {
    const errs = validateRaidForm(addForm);
    if (Object.keys(errs).length > 0) { setAddErrors(errs); return; }
    setSaving(true);
    try {
      await pmApi.createRaidEntry(projectId, raidPayload(addForm));
      await load();
      setAdding(false);
      setAddForm(blankRaidForm());
      setAddErrors({});
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  async function handleEditSave(id: string) {
    const errs = validateRaidForm(editForm);
    if (Object.keys(errs).length > 0) { setAddErrors(errs); return; }
    setSaving(true);
    try {
      await pmApi.updateRaidEntry(projectId, id, raidPayload(editForm));
      await load();
      setEditId(null);
      setAddErrors({});
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: 'Delete this RAID entry?',
      message: 'This action cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await pmApi.deleteRaidEntry(projectId, id);
    await load();
  }

  function startEdit(entry: RaidLog) {
    setEditId(entry.id);
    setEditForm({
      type: entry.type ?? '', date_raised: entry.date_raised ?? today(),
      raised_by: entry.raised_by ?? '', title: entry.title ?? '',
      description: entry.description ?? '', impact: entry.impact ?? '',
      urgency: entry.urgency ?? '', probability: entry.probability ?? '',
      priority: entry.priority ?? '', owner: entry.owner ?? '',
      status: entry.status ?? 'Pending', mitigation: entry.mitigation ?? '',
    });
    setAddErrors({});
  }

  const renderFormRow = (form: RaidFormState, setForm: (f: RaidFormState) => void, onSave: () => void, onCancel: () => void) => (
    <tr className="bg-accent/5">
      <td className="py-2 px-2 text-pip-muted text-xs">new</td>
      <td className="py-2 px-2">
        <Select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as RaidFormState['type'] })} className="text-xs h-8 py-0">
          <option value="">— Type —</option>
          {RAID_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </Select>
        {addErrors.type && <div className="text-red-400 text-xs mt-1">{addErrors.type}</div>}
      </td>

      <td className="py-2 px-2">
        <div className="relative">
          <input
            type="date"
            className="w-full h-8 bg-surface-1 border border-pip-border rounded-lg px-2 py-0 pr-10 text-xs text-pip-text"
            value={form.date_raised}
            onChange={e => setForm({ ...form, date_raised: e.target.value })}
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
            className="absolute right-1 top-[2px] w-7 h-7 rounded-md bg-accent text-pip-text flex items-center justify-center hover:opacity-90"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>
        </div>
      </td>
      <td className="py-2 px-2">
        <input className="w-full h-8 bg-surface-1 border border-pip-border rounded-lg px-2 py-0 text-xs text-pip-text" value={form.raised_by} onChange={e => setForm({ ...form, raised_by: e.target.value })} placeholder="Name" />
      </td>
      <td className="py-2 px-2">
        <input className="w-full h-8 bg-surface-1 border border-pip-border rounded-lg px-2 py-0 text-xs text-pip-text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Title *" />
        {addErrors.title && <div className="text-red-400 text-xs mt-1">{addErrors.title}</div>}
      </td>
      <td className="py-2 px-2">
        <Select value={form.impact} onChange={e => setForm({ ...form, impact: e.target.value as RaidFormState['impact'] })} className="text-xs h-8 py-0">
          <option value="">—</option>
          {RAID_IMPACT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
      </td>
      <td className="py-2 px-2">
        <Select value={form.urgency} onChange={e => setForm({ ...form, urgency: e.target.value as RaidFormState['urgency'] })} className="text-xs h-8 py-0">
          <option value="">—</option>
          {RAID_IMPACT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
      </td>
      <td className="py-2 px-2">
        <Select value={form.probability} onChange={e => setForm({ ...form, probability: e.target.value as RaidFormState['probability'] })} className="text-xs h-8 py-0">
          <option value="">—</option>
          {RAID_IMPACT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
      </td>
      <td className="py-2 px-2">
        <Select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as RaidFormState['priority'] })} className="text-xs h-8 py-0">
          <option value="">—</option>
          {RAID_PRIORITY_OPTIONS.map(o => <option key={o} value={o}>{o.split(' - ')[0]}</option>)}
        </Select>
      </td>
      <td className="py-2 px-2">
        <input className="w-full h-8 bg-surface-1 border border-pip-border rounded-lg px-2 py-0 text-xs text-pip-text" value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })} placeholder="Owner" />
      </td>
      <td className="py-2 px-2">
        <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as RaidFormState['status'] })} className="text-xs h-8 py-0">
          {RAID_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
        {addErrors.status && <div className="text-red-400 text-xs mt-1">{addErrors.status}</div>}
      </td>
      <td className="py-2 px-2">
        <div className="flex justify-center gap-1 flex-nowrap">
          <Button variant="primary" size="sm" onClick={onSave} disabled={saving}>Save</Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      </td>
    </tr>
  );

  if (loading) return <div className="flex justify-center py-8"><Spinner size="lg" /></div>;

  return (
    <div>
      {!readOnly && (
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-sora font-semibold text-lg text-pip-text">RAID Log</h3>
          <Button variant="secondary" onClick={() => { setAdding(true); setAddForm(blankRaidForm()); }}>+ Add Entry</Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-pip-border">
        <table className="w-full text-center border-collapse min-w-[1100px]">
          <thead>
            <tr className="bg-surface-2 border-b border-pip-border text-xs text-pip-secondary uppercase tracking-wider">
              <th className="px-2 py-3 w-10">#</th>
              <th className="px-2 py-3 w-32">Type</th>
              <th className="px-2 py-3 w-32">Date</th>
              <th className="px-2 py-3 w-32">Raised By</th>
              <th className="px-2 py-3 w-32">Title</th>
              <th className="px-2 py-3 w-32">Impact</th>
              <th className="px-2 py-3 w-32">Urgency</th>
              <th className="px-2 py-3 w-32">Prob.</th>
              <th className="px-2 py-3 w-32">Priority</th>
              <th className="px-2 py-3 w-32">Owner</th>
              <th className="px-2 py-3 w-32">Status</th>
              <th className="px-2 py-3 w-24">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pip-border">
            {!readOnly && adding && renderFormRow(
              addForm, setAddForm, handleAdd, () => { setAdding(false); setAddErrors({}); }
            )}
            {entries.length === 0 && !adding ? (
              <tr><td colSpan={12} className="py-8 text-center text-pip-muted text-sm">No RAID entries yet.{!readOnly && " Click 'Add Entry' to log your first item."}</td></tr>
            ) : entries.map(entry => (
              <>
                {editId === entry.id ? renderFormRow(
                  editForm, setEditForm, () => void handleEditSave(entry.id), () => { setEditId(null); setAddErrors({}); }
                ) : (
                  <tr key={entry.id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-2 py-3 text-pip-muted text-xs">{entry.raid_seq_id}</td>
                    <td className="px-2 py-3 text-xs">
                      <Badge variant="inactive">{entry.type}</Badge>
                    </td>
                    <td className="px-2 py-3 text-xs text-pip-secondary">{entry.date_raised}</td>
                    <td className="px-2 py-3 text-xs text-pip-secondary">{entry.raised_by}</td>
                    <td className="px-2 py-3 text-sm text-pip-text">
                      <button className="hover:underline text-accent text-xs" onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}>
                        {entry.title}
                        {(entry.description || entry.mitigation) && <span className="ml-1 text-pip-muted">{expandedId === entry.id ? '▲' : '▼'}</span>}
                      </button>
                    </td>
                    <td className="px-2 py-3 text-xs text-pip-secondary">{entry.impact || '—'}</td>
                    <td className="px-2 py-3 text-xs text-pip-secondary">{entry.urgency || '—'}</td>
                    <td className="px-2 py-3 text-xs text-pip-secondary">{entry.probability || '—'}</td>
                    <td className="px-2 py-3 text-xs text-pip-secondary">{entry.priority ? entry.priority.split(' - ')[0] : '—'}</td>
                    <td className="px-2 py-3 text-xs text-pip-secondary">{entry.owner || '—'}</td>
                    <td className="px-2 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded ${entry.status === 'Resolved' ? 'bg-rag-green-bg text-rag-green-text' :
                        entry.status === 'In Progress' ? 'bg-rag-amber-bg text-rag-amber-text' :
                          'bg-surface-3 text-pip-muted'
                        }`}>{entry.status}</span>
                    </td>
                    <td className="px-2 py-3">
                      {!readOnly && (
                        <div className="flex justify-center gap-1">
                          <Button variant="ghost" size="sm" className="text-xs px-2 py-1 h-auto" onClick={() => startEdit(entry)}>Edit</Button>
                          <Button variant="ghost" size="sm" className="text-xs px-2 py-1 h-auto text-err-text" onClick={() => void handleDelete(entry.id)}>Del</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                {expandedId === entry.id && editId !== entry.id && (
                  <tr key={`${entry.id}-exp`} className="bg-surface-2">
                    <td colSpan={12} className="px-4 py-3 text-left">
                      {entry.description && (
                        <div className="mb-2">
                          <span className="text-xs font-semibold text-pip-secondary uppercase tracking-wider">Description: </span>
                          <span className="text-xs text-pip-text">{entry.description}</span>
                        </div>
                      )}
                      {entry.mitigation && (
                        <div>
                          <span className="text-xs font-semibold text-pip-secondary uppercase tracking-wider">Mitigation / Action / Resolution: </span>
                          <span className="text-xs text-pip-text">{entry.mitigation}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Project Editor ───────────────────────────────────────────────────────────

interface EditorProps {
  project: PMProject;
  pmName: string;
  pmEmail: string;
  onBack: () => void;
}

function ProjectEditor({ project, pmName, pmEmail, onBack }: EditorProps) {
  const [activeTab, setActiveTab] = useState<'submission' | 'raid' | 'team'>('submission');
  const [form, setForm] = useState<FormState>({});
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [overrides, setOverrides] = useState<SubmissionOverride[]>([]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [teamMembersList, setTeamMembersList] = useState<TeamMemberUser[]>([]);
  const [milestoneStatuses, setMilestoneStatuses] = useState<MilestoneStatus[]>([]);
  const [allocationErrors, setAllocationErrors] = useState<Record<number, string>>({});
  const [projectStartDate, setProjectStartDate] = useState(project.project_start_date ? project.project_start_date.slice(0, 10) : '');
  const [projectEndDate, setProjectEndDate] = useState(project.project_end_date ? project.project_end_date.slice(0, 10) : '');
  const [engagementType, setEngagementType] = useState(project.engagement_type ?? '');
  const [methodology, setMethodology] = useState(project.methodology ?? '');
  const [localStakeholders, setLocalStakeholders] = useState<Stakeholder[]>([]);
  const [projectTeam, setProjectTeam] = useState<TeamMember[]>([]);
  const [teamSaving, setTeamSaving] = useState(false);
  const [teamAllocationErrors, setTeamAllocationErrors] = useState<Record<number, string>>({});
  const [stakeholderErrors, setStakeholderErrors] = useState<Record<string, string>>({});
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
    if (!userId) return;
    try {
      const res = await pmApi.getMemberAllocation(userId, project.id);
      setMemberAllocations(prev => ({
        ...prev,
        [userId]: res
      }));
    } catch (err) {
      console.error(err);
    }
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
    if (currentProjectTotal > 0 && project) {
      projectsList.push({
        project_id: project.id,
        project_name: `${project.name} (this project)`,
        allocation_percentage: currentProjectTotal
      });
    }

    return {
      totalAllocated,
      available,
      projects: projectsList
    };
  }

  useEffect(() => {
    if (form.team_structure) {
      const ts = (form.team_structure as TeamMember[]) || [];
      ts.forEach(m => {
        if (m.user_id && !memberAllocations[m.user_id]) {
          void loadMemberAllocation(m.user_id);
        }
      });
    }
  }, [form.team_structure]);

  useEffect(() => {
    if (projectTeam) {
      projectTeam.forEach(m => {
        if (m.user_id && !memberAllocations[m.user_id]) {
          void loadMemberAllocation(m.user_id);
        }
      });
    }
  }, [projectTeam]);

  const allocationTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const teamAllocationTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const stakeholdersRef = useRef<Stakeholder[]>(localStakeholders);
  useEffect(() => { stakeholdersRef.current = localStakeholders; }, [localStakeholders]);

  const milestonesRef = useRef<MilestoneEntry[]>([]);
  useEffect(() => { milestonesRef.current = (form.milestones as MilestoneEntry[]) || []; }, [form.milestones]);

  const mappedProjectMilestones = useMemo(() => {
    const rawMilestones = typeof project.milestones === 'string'
      ? (() => { try { return JSON.parse(project.milestones); } catch { return []; } })()
      : (project.milestones ?? []);
    return (Array.isArray(rawMilestones) ? rawMilestones : []).map((m: any) => ({
      id: m.id || m.milestone_id || createClientId('milestone'),
      name: m.name || m.title || '',
      target_date: m.target_date || m.due_date || null,
      status: m.status || 'Planned',
      comment: m.comment || m.description || null,
    }));
  }, [project.milestones]);

  const submissionToForm = useCallback((s: Submission): FormState => ({
    sprint_name: s.sprint_name ?? '',
    sprint_start_date: s.sprint_start_date ? s.sprint_start_date.slice(0, 10) : '',
    sprint_end_date: s.sprint_end_date ? s.sprint_end_date.slice(0, 10) : '',
    tech_team_size: s.tech_team_size != null ? s.tech_team_size : ('' as unknown as number),
    rag_schedule: s.rag_schedule ?? '',
    rag_schedule_comment: s.rag_schedule_comment ?? '',
    rag_budget: s.rag_budget ?? '',
    rag_budget_comment: s.rag_budget_comment ?? '',
    rag_scope: s.rag_scope ?? '',
    rag_scope_comment: s.rag_scope_comment ?? '',
    rag_resources: s.rag_resources ?? '',
    rag_resources_comment: s.rag_resources_comment ?? '',
    rag_timeline: s.rag_timeline ?? '',
    rag_timeline_comment: s.rag_timeline_comment ?? '',
    milestones: s.milestones && s.milestones.length > 0 ? s.milestones : mappedProjectMilestones,
    overview: s.overview ?? '',
    business_coordination: s.business_coordination ?? '',
    feature_releases: s.feature_releases ?? '',
    development_uat: s.development_uat ?? '',
    ongoing_work: s.ongoing_work ?? '',
    upcoming_deliverables: s.upcoming_deliverables ?? '',
    team_structure: s.team_structure ?? [],
  }), [mappedProjectMilestones]);

  useEffect(() => {
    (async () => {
      let sub: Submission | null = null;
      let ovr: SubmissionOverride[] = [];
      let team: TeamMember[] = [];
      let dbMilestones: MilestoneEntry[] = [];

      try {
        sub = await pmApi.getSubmission(project.id);
      } catch { /* no submission yet */ }

      try {
        ovr = await pmApi.getOverrides(project.id);
        setOverrides(ovr);
      } catch { /* ignore/default */ }

      try {
        team = await pmApi.getProjectTeamMembers(project.id);
        setProjectTeam(team);
      } catch { /* ignore/default */ }

      try {
        dbMilestones = await pmApi.getMilestones(project.id);
      } catch { /* ignore/default */ }

      const rawDbMilestones = typeof dbMilestones === 'string'
        ? (() => { try { return JSON.parse(dbMilestones); } catch { return []; } })()
        : (dbMilestones ?? []);

      // DB milestones (from projects.projects.milestones) are always the source of truth,
      // since they are updated immediately on every edit. Submission milestones are only
      // a snapshot from the last save/publish and may be stale.
      const normalizedMilestones = (Array.isArray(rawDbMilestones) && rawDbMilestones.length > 0)
        ? rawDbMilestones.map((m: any) => ({
          id: m.id || m.milestone_id || createClientId('milestone'),
          name: m.name || m.title || '',
          target_date: m.target_date || m.due_date || null,
          status: m.status || 'Planned',
          comment: m.comment || m.description || null,
        }))
        : mappedProjectMilestones;

      if (sub) {
        setSubmission(sub);
        // Prefer fresh DB milestones over submission snapshot milestones
        const finalMilestones = normalizedMilestones.length > 0
          ? normalizedMilestones
          : (sub.milestones && sub.milestones.length > 0 ? sub.milestones : mappedProjectMilestones);
        setForm(submissionToForm({ ...sub, milestones: finalMilestones }));
      } else {
        setForm({ milestones: normalizedMilestones, team_structure: team });
      }
    })();
    pmApi.getTeamMembers().then(setTeamMembersList).catch(() => { });
    pmApi.listMilestoneStatuses().then(setMilestoneStatuses).catch(() => { });
    pmApi.getStakeholders(project.id).then(setLocalStakeholders).catch(() => { });
  }, [project.id, submissionToForm, mappedProjectMilestones]);

  function update(field: keyof FormState, value: any) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) setFieldErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  }

  function validateField(field: string, value: any): string | null {
    const required = ['sprint_name', 'sprint_start_date', 'sprint_end_date', 'tech_team_size', 'rag_schedule', 'rag_budget', 'rag_scope', 'rag_resources', 'rag_timeline'];
    if (required.includes(field) && (value === undefined || value === null || value === '')) return 'This field is required.';
    if (field === 'sprint_end_date' && form.sprint_start_date && value) {
      if (new Date(value as string) < new Date(form.sprint_start_date as string)) return 'End date cannot be before start date.';
    }
    if (field === 'project_end_date' && projectStartDate && value) {
      if (new Date(value as string) < new Date(projectStartDate)) return 'End cannot be before start.';
    }
    return null;
  }

  function handleBlur(field: string, value: any) {
    const err = validateField(field, value);
    if (err) setFieldErrors(prev => ({ ...prev, [field]: err }));
    else setFieldErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  }

  async function patchProjectDates(start: string, end: string) {
    try {
      await pmApi.patchProjectDates(project.id, {
        project_start_date: start || null,
        project_end_date: end || null,
      });
    } catch { /* ignore */ }
  }

  async function handleProjectEndDateBlur(value: string) {
    handleBlur('project_end_date', value);
    await patchProjectDates(projectStartDate, value);
  }

  async function checkAllocationForMember(idx: number, member: TeamMember, currentTs?: TeamMember[]) {
    if (!member.user_id) {
      setAllocationErrors(prev => { const n = { ...prev }; delete n[idx]; return n; });
      return;
    }
    if (!member.allocation_percentage || member.allocation_percentage <= 0) {
      setAllocationErrors(prev => { const n = { ...prev }; delete n[idx]; return n; });
      return;
    }
    try {
      const result = await pmApi.getMemberAllocation(member.user_id, project.id);
      setMemberAllocations(prev => ({ ...prev, [member.user_id!]: result }));
      const ts = currentTs || (form.team_structure as TeamMember[]) || [];
      const formAllocations = ts.reduce((sum, m) => m.user_id === member.user_id ? sum + (m.allocation_percentage || 0) : sum, 0);
      const total = result.total_allocated + formAllocations;

      setAllocationErrors(prev => {
        const next = { ...prev };
        ts.forEach((m, i) => {
          if (m.user_id === member.user_id) {
            delete next[i];
          }
        });

        if (total > 100) {
          const occurrences = ts.filter(m => m.user_id === member.user_id).length;
          let errMsg = '';
          if (occurrences > 1) {
            errMsg = `${member.employee_name} is allocated multiple times (totaling ${formAllocations}% in this project). Across other projects, they have ${result.total_allocated}% allocated. Max available: ${result.available}%.`;
          } else {
            errMsg = `${member.employee_name} already has ${result.total_allocated}% across ${result.projects.length} project(s). Max: ${result.available}%.`;
          }

          ts.forEach((m, i) => {
            if (m.user_id === member.user_id && m.allocation_percentage && m.allocation_percentage > 0) {
              next[i] = errMsg;
            }
          });
        }
        return next;
      });
    } catch { /* ignore */ }
  }

  async function checkTeamMemberAllocation(idx: number, member: TeamMember, currentProjectTeam?: TeamMember[]) {
    if (!member.user_id) {
      setTeamAllocationErrors(prev => { const n = { ...prev }; delete n[idx]; return n; });
      return;
    }
    if (!member.allocation_percentage || member.allocation_percentage <= 0) {
      setTeamAllocationErrors(prev => { const n = { ...prev }; delete n[idx]; return n; });
      return;
    }
    try {
      const result = await pmApi.getMemberAllocation(member.user_id, project.id);
      setMemberAllocations(prev => ({ ...prev, [member.user_id!]: result }));
      const team = currentProjectTeam || projectTeam;
      const teamAllocations = team.reduce((sum, m) => m.user_id === member.user_id ? sum + (m.allocation_percentage || 0) : sum, 0);
      const total = result.total_allocated + teamAllocations;

      setTeamAllocationErrors(prev => {
        const next = { ...prev };
        team.forEach((m, i) => {
          if (m.user_id === member.user_id) {
            delete next[i];
          }
        });

        if (total > 100) {
          const occurrences = team.filter(m => m.user_id === member.user_id).length;
          let errMsg = '';
          if (occurrences > 1) {
            errMsg = `${member.employee_name} is allocated multiple times (totaling ${teamAllocations}% in this project). Across other projects, they have ${result.total_allocated}% allocated. Max available: ${result.available}%.`;
          } else {
            errMsg = `${member.employee_name} already has ${result.total_allocated}% across ${result.projects.length} project(s). Max: ${result.available}%.`;
          }

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

  function handleAllocationChange(idx: number, value: string) {
    const ts = [...((form.team_structure as TeamMember[]) || [])];
    ts[idx] = { ...ts[idx], allocation_percentage: value === '' ? null : Number(value) };
    update('team_structure', ts);

    clearTimeout(allocationTimers.current[idx]);
    allocationTimers.current[idx] = setTimeout(() => {
      void checkAllocationForMember(idx, ts[idx], ts);
    }, 300);
  }

  async function createMilestoneStatus(label: string) {
    try {
      const newStatus = await pmApi.createMilestoneStatus(label);
      setMilestoneStatuses(prev => [...prev, newStatus].sort((a, b) => a.label.localeCompare(b.label)));
    } catch { /* 409 duplicate is fine */ }
  }

  function updateMilestone(idx: number, field: keyof MilestoneEntry, value: any) {
    const ms = [...((form.milestones as MilestoneEntry[]) || [])];
    ms[idx] = { ...ms[idx], [field]: value };
    update('milestones', ms);
  }

  function saveMilestones() {
    void pmApi.updateMilestones(project.id, milestonesRef.current);
  }

  function addMilestone() {
    const ms = [...((form.milestones as MilestoneEntry[]) || [])];
    ms.push({ id: createClientId('milestone'), name: '', target_date: null, status: 'Not Started', comment: null });
    update('milestones', ms);
    void pmApi.updateMilestones(project.id, ms);
  }

  function removeMilestone(idx: number) {
    const ms = [...((form.milestones as MilestoneEntry[]) || [])];
    ms.splice(idx, 1);
    update('milestones', ms);
    void pmApi.updateMilestones(project.id, ms);
  }

  // Auto-derive tech_team_size from team_structure count; field remains manually overridable
  useEffect(() => {
    const count = ((form.team_structure as TeamMember[]) || []).length;
    setForm(prev => ({ ...prev, tech_team_size: count }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.team_structure]);

  function validateAllStakeholders() {
    const errors: Record<string, string> = {};
    let isValid = true;
    for (const s of localStakeholders) {
      const nameKey = `${s.id}_name`;
      if (!s.name || !s.name.trim()) {
        errors[nameKey] = 'Required';
        isValid = false;
      }

      const contactKey = `${s.id}_contact_no`;
      if (s.contact_no && s.contact_no.trim()) {
        const isValidPhone = /^\d{10,15}$/.test(s.contact_no.trim());
        if (!isValidPhone) {
          errors[contactKey] = 'Must be 10-15 digits';
          isValid = false;
        }
      }

      const emailKey = `${s.id}_email`;
      if (s.email && s.email.trim()) {
        const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email.trim());
        if (!isValidEmail) {
          errors[emailKey] = 'Invalid email format';
          isValid = false;
        }
      }
    }
    setStakeholderErrors(errors);
    return isValid;
  }

  function validateStakeholderField(sId: string, field: 'name' | 'contact_no' | 'email', value: string) {
    setStakeholderErrors(prev => {
      const copy = { ...prev };
      const key = `${sId}_${field}`;

      if (field === 'name') {
        if (!value || !value.trim()) {
          copy[key] = 'Required';
        } else {
          delete copy[key];
        }
      } else if (field === 'contact_no') {
        if (value && value.trim()) {
          const isValidPhone = /^\d{10,15}$/.test(value.trim());
          if (!isValidPhone) {
            copy[key] = 'Must be 10-15 digits';
          } else {
            delete copy[key];
          }
        } else {
          delete copy[key];
        }
      } else if (field === 'email') {
        if (value && value.trim()) {
          const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
          if (!isValidEmail) {
            copy[key] = 'Invalid email format';
          } else {
            delete copy[key];
          }
        } else {
          delete copy[key];
        }
      }

      return copy;
    });
  }

  const isSubmissionLocked = submission?.status === 'published' && !project.draft_id;
  const hasAllocationErrors = Object.keys(allocationErrors).length > 0;

  function handleStartNewReport() {
    setSubmission(null);
    setForm({ milestones: [], team_structure: projectTeam });
    setOverrides([]);
    setFieldErrors({});
    setError('');
  }

  async function handleSaveDraft() {
    if (isSubmissionLocked) return;
    setError('');
    if (hasAllocationErrors) { toast.error('Fix allocation errors before saving.'); return; }
    if (!validateAllStakeholders()) { toast.error('Fix stakeholder errors before saving.'); return; }
    setSaving(true);
    try {
      await patchProjectDates(projectStartDate, projectEndDate);
      const ts = (form.team_structure as TeamMember[]) || [];
      const [saved] = await Promise.all([
        pmApi.saveDraft(project.id, normalizeDates(form)),
        pmApi.updateProjectTeamMembers(project.id, ts),
      ]);
      setProjectTeam(ts);
      setSubmission(saved);
      setForm(submissionToForm(saved));
      toast.success('Draft saved.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save draft';
      setError(msg);
      toast.error(msg);
    } finally { setSaving(false); }
  }

  async function handlePublish() {
    if (isSubmissionLocked) return;
    setError('');
    setFieldErrors({});
    if (hasAllocationErrors) { toast.error('Fix allocation errors before publishing.'); return; }
    if (!validateAllStakeholders()) { toast.error('Fix stakeholder errors before publishing.'); return; }

    const errors: Record<string, string> = {};
    const required = ['sprint_name', 'sprint_start_date', 'sprint_end_date', 'tech_team_size', 'rag_schedule', 'rag_budget', 'rag_scope', 'rag_resources', 'rag_timeline'];
    for (const f of required) {
      const v = form[f as keyof FormState];
      if (v === undefined || v === null || v === '') errors[f] = 'This field is required.';
    }
    if (form.sprint_start_date && form.sprint_end_date) {
      if (new Date(form.sprint_end_date as string) < new Date(form.sprint_start_date as string))
        errors.sprint_end_date = 'End date cannot be before start date.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.error('Please correct the validation errors before publishing.');
      return;
    }

    setPublishing(true);
    try {
      await patchProjectDates(projectStartDate, projectEndDate);
      const normalizedForm = normalizeDates(form);
      const ts = (normalizedForm.team_structure as TeamMember[]) || [];
      if (!project.draft_id) {
        await pmApi.saveDraft(project.id, normalizedForm);
      }
      const [pub] = await Promise.all([
        pmApi.publish(project.id, normalizedForm),
        pmApi.updateProjectTeamMembers(project.id, ts),
      ]);
      setProjectTeam(ts);
      setSubmission(pub);
      setForm(submissionToForm(pub));
      toast.success('Report published successfully.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to publish';
      setError(msg);
      toast.error(msg);
    } finally { setPublishing(false); }
  }

  return (
    <div className="pb-12">
      {/* Sticky Header Bar */}
      <div
        style={{
          backgroundColor: 'var(--base)',
          marginLeft: 'calc((100% - 100vw) / 2)',
          marginRight: 'calc((100% - 100vw) / 2)',
          paddingLeft: 'calc((100vw - 100%) / 2)',
          paddingRight: 'calc((100vw - 100%) / 2)',
        }}
        className="sticky top-16 z-30 py-4 mb-8"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={onBack} className="text-pip-secondary hover:text-pip-text px-0">← Back</Button>
            <span className="text-pip-border">|</span>
            <span className="font-sora font-semibold text-pip-text">{project.name}</span>
            {submission && (
              <Badge variant={submission.status === 'draft' ? 'draft' : 'published'}>
                {submission.status === 'draft' ? `Draft v${submission.version}` : `Published v${submission.version}`}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 self-end sm:self-auto">
            <Button variant="secondary" onClick={() => setShowPreview(true)}>Preview PPT</Button>
            {isSubmissionLocked ? (
              <Button variant="primary" onClick={handleStartNewReport}>Start New Report</Button>
            ) : (
              <>
                <Button variant="secondary" onClick={handleSaveDraft} disabled={saving || hasAllocationErrors}>
                  {saving ? 'Saving...' : 'Save Draft'}
                </Button>
                <Button variant="primary" onClick={handlePublish} disabled={publishing || hasAllocationErrors}>
                  {publishing ? 'Publishing...' : 'Publish Update'}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mt-4 border-b border-pip-border">
          {(['submission', 'raid', 'team'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`pb-2 text-sm font-medium capitalize border-b-2 transition-colors ${activeTab === tab ? 'border-accent text-accent' : 'border-transparent text-pip-secondary hover:text-pip-text'}`}>
              {tab === 'raid' ? 'RAID Log' : tab === 'team' ? 'Team' : 'Submission'}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorBanner message={error} className="mb-6" />}

      {isSubmissionLocked && activeTab === 'submission' && (
        <div className="mb-6 p-4 bg-surface-2 border border-pip-border rounded-lg">
          <p className="text-sm font-semibold text-pip-text">Report Published — Read Only</p>
          <p className="text-xs text-pip-muted mt-1">
            This report has been published and is locked. Only your Program Manager can make changes to this submission.
            Use "Start New Report" to begin the next sprint's report.
          </p>
        </div>
      )}

      {activeTab === 'submission' && (
        <>
          <OverridePanel overrides={overrides} />

          {/* Section A */}
          <Card className="p-6 md:p-8 mb-6">
            <h3 className="font-sora font-semibold text-lg text-pip-text mb-6">Section A — Project Charter</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Input label="Project Name" value={project.name} readOnly className="bg-surface-2 opacity-70" />
              <Input label="Client Name" value={project.client_name} readOnly className="bg-surface-2 opacity-70" />
              <Input label="PM Name" value={pmName || pmEmail} readOnly className="bg-surface-2 opacity-70" />

              <div>
                <Input
                  label="Sprint Name *"
                  value={(form.sprint_name as string) ?? ''}
                  onChange={e => update('sprint_name', e.target.value)}
                  onBlur={e => handleBlur('sprint_name', e.target.value)}
                  placeholder="e.g. Sprint 24"
                  error={fieldErrors.sprint_name}
                  disabled={isSubmissionLocked}
                />
                <p className="text-xs text-pip-muted mt-1">One report per sprint week. Published reports are locked — start a new report for the next sprint.</p>
              </div>
              <div className="relative">
                <Input
                  label="Sprint Start Date *"
                  type="date"
                  lang="en-GB"
                  value={(form.sprint_start_date as string) ?? ''}
                  onChange={e => update('sprint_start_date', e.target.value)}
                  onBlur={e => handleBlur('sprint_start_date', e.target.value)}
                  error={fieldErrors.sprint_start_date}
                  disabled={isSubmissionLocked}
                  className="pr-12"
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
                        try {
                          (inputEl as any).showPicker();
                        } catch { }
                      }
                    }
                  }}
                  className="absolute right-2 top-[24px] w-8 h-8 rounded-md bg-accent text-pip-text flex items-center justify-center hover:opacity-90"
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
                  label="Sprint End Date *"
                  type="date"
                  lang="en-GB"
                  value={(form.sprint_end_date as string) ?? ''}
                  onChange={e => update('sprint_end_date', e.target.value)}
                  onBlur={e => handleBlur('sprint_end_date', e.target.value)}
                  error={fieldErrors.sprint_end_date}
                  disabled={isSubmissionLocked}
                  className="pr-12"
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
                        try {
                          (inputEl as any).showPicker();
                        } catch { }
                      }
                    }
                  }}
                  className="absolute right-2 top-[24px] w-8 h-8 rounded-md bg-accent text-pip-text flex items-center justify-center hover:opacity-90"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </button>
              </div>
              <div>
                <Input
                  label="Tech Team Size *"
                  type="number"
                  min={1}
                  value={(form.tech_team_size as string | number) ?? ''}
                  onChange={e => update('tech_team_size', e.target.value)}
                  onBlur={e => handleBlur('tech_team_size', e.target.value)}
                  placeholder="e.g. 8"
                  error={fieldErrors.tech_team_size}
                  disabled={isSubmissionLocked}
                />
                <p className="text-xs text-pip-muted mt-1">Auto-calculated from team structure. Override manually if needed.</p>
              </div>

              {/* Project dates (optional, stored on projects table) */}
              <div className="relative">
                <Input
                  label="Project Start Date"
                  type="date"
                  lang="en-GB"
                  value={projectStartDate}
                  onChange={e => setProjectStartDate(e.target.value)}
                  onBlur={async () => {
                    handleBlur('project_start_date', projectStartDate);
                    await patchProjectDates(projectStartDate, projectEndDate);
                  }}
                  className="pr-12"
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
                        try {
                          (inputEl as any).showPicker();
                        } catch { }
                      }
                    }
                  }}
                  className="absolute right-2 top-[24px] w-8 h-8 rounded-md bg-accent text-pip-text flex items-center justify-center hover:opacity-90"
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
                  label="Project End Date"
                  type="date"
                  lang="en-GB"
                  value={projectEndDate}
                  onChange={e => setProjectEndDate(e.target.value)}
                  onBlur={async () => handleProjectEndDateBlur(projectEndDate)}
                  error={fieldErrors.project_end_date}
                  className="pr-12"
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
                        try {
                          (inputEl as any).showPicker();
                        } catch { }
                      }
                    }
                  }}
                  className="absolute right-2 top-[24px] w-8 h-8 rounded-md bg-accent text-pip-text flex items-center justify-center hover:opacity-90"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-pip-secondary mb-1 uppercase tracking-wider">Engagement Type</label>
                <Select
                  value={engagementType}
                  onChange={e => setEngagementType(e.target.value)}
                  onBlur={async (e) => {
                    if (e.target.value) {
                      try { await pmApi.patchProjectMetadata(project.id, { engagement_type: e.target.value }); } catch { /* ignore */ }
                    }
                  }}
                >
                  <option value="">— Select —</option>
                  <option value="Fixed Cost">Fixed Cost</option>
                  <option value="T&M">T&M</option>
                  <option value="Hybrid">Hybrid</option>
                </Select>
              </div>

              <div>
                <label className="block text-xs font-medium text-pip-secondary mb-1 uppercase tracking-wider">Methodology</label>
                <Select
                  value={methodology}
                  onChange={e => setMethodology(e.target.value)}
                  onBlur={async (e) => {
                    if (e.target.value) {
                      try { await pmApi.patchProjectMetadata(project.id, { methodology: e.target.value }); } catch { /* ignore */ }
                    }
                  }}
                >
                  <option value="">— Select —</option>
                  <option value="Agile">Agile</option>
                  <option value="Waterfall">Waterfall</option>
                </Select>
              </div>
            </div>
          </Card>

          {/* Stakeholders */}
          <Card className="p-6 md:p-8 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-sora font-semibold text-lg text-pip-text">Stakeholders</h3>
              <Button variant="secondary" onClick={() => {
                const newS: Stakeholder = { id: createClientId('stakeholder'), name: '', contact_no: '', email: '' };
                setLocalStakeholders(prev => [...prev, newS]);
              }}>+ Add Stakeholder</Button>
            </div>
            {localStakeholders.length === 0 ? (
              <p className="text-pip-muted text-sm italic">No stakeholders added yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {localStakeholders.map((s, index) => {
                  const nameErr = stakeholderErrors[`${s.id}_name`];
                  const contactErr = stakeholderErrors[`${s.id}_contact_no`];
                  const emailErr = stakeholderErrors[`${s.id}_email`];

                  const checkAndSave = () => {
                    const allValid = stakeholdersRef.current.every(x => {
                      const hasName = !!x.name && !!x.name.trim();
                      const isContactValid = !x.contact_no || /^\d{10,15}$/.test(x.contact_no.trim());
                      const isEmailValid = !x.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email.trim());
                      return hasName && isContactValid && isEmailValid;
                    });
                    if (allValid) {
                      void pmApi.updateStakeholders(project.id, stakeholdersRef.current);
                    }
                  };

                  return (
                    <div key={s.id} className="grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-3 items-start bg-surface-2 p-3 rounded border border-pip-border">
                      <div className="w-full">
                        <input
                          className={`w-full bg-surface-1 border rounded px-3 py-2 text-sm text-pip-text focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed ${nameErr ? 'border-red-500' : 'border-pip-border'}`}
                          placeholder="Name *"
                          value={s.name}
                          onChange={e => {
                            const val = e.target.value;
                            setLocalStakeholders(prev => prev.map((x, i) => i === index ? { ...x, name: val } : x));
                            validateStakeholderField(s.id, 'name', val);
                          }}
                          onBlur={() => {
                            validateStakeholderField(s.id, 'name', s.name);
                            checkAndSave();
                          }}
                        />
                        {nameErr && <div className="text-red-400 text-xs mt-1">{nameErr}</div>}
                      </div>

                      <div className="w-full">
                        <input
                          className={`w-full bg-surface-1 border rounded px-3 py-2 text-sm text-pip-text focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed ${contactErr ? 'border-red-500' : 'border-pip-border'}`}
                          placeholder="Contact No."
                          value={s.contact_no}
                          onChange={e => {
                            const val = e.target.value.replace(/[^\d]/g, '').slice(0, 15);
                            setLocalStakeholders(prev => prev.map((x, i) => i === index ? { ...x, contact_no: val } : x));
                            validateStakeholderField(s.id, 'contact_no', val);
                          }}
                          onBlur={() => {
                            validateStakeholderField(s.id, 'contact_no', s.contact_no);
                            checkAndSave();
                          }}
                        />
                        {contactErr && <div className="text-red-400 text-xs mt-1">{contactErr}</div>}
                      </div>

                      <div className="w-full">
                        <input
                          className={`w-full bg-surface-1 border rounded px-3 py-2 text-sm text-pip-text focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed ${emailErr ? 'border-red-500' : 'border-pip-border'}`}
                          placeholder="Email"
                          value={s.email}
                          onChange={e => {
                            const val = e.target.value;
                            setLocalStakeholders(prev => prev.map((x, i) => i === index ? { ...x, email: val } : x));
                            validateStakeholderField(s.id, 'email', val);
                          }}
                          onBlur={() => {
                            validateStakeholderField(s.id, 'email', s.email);
                            checkAndSave();
                          }}
                        />
                        {emailErr && <div className="text-red-400 text-xs mt-1">{emailErr}</div>}
                      </div>

                      <div className="flex gap-1 mt-1.5">
                        <button
                          disabled={index === 0}
                          onClick={() => {
                            const next = [...localStakeholders];
                            [next[index - 1], next[index]] = [next[index], next[index - 1]];
                            setLocalStakeholders(next);
                            const allValid = next.every(x => {
                              const hasName = !!x.name && !!x.name.trim();
                              const isContactValid = !x.contact_no || /^\d{10,15}$/.test(x.contact_no.trim());
                              const isEmailValid = !x.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email.trim());
                              return hasName && isContactValid && isEmailValid;
                            });
                            if (allValid) {
                              void pmApi.updateStakeholders(project.id, next);
                            }
                          }}
                          className="text-pip-muted hover:text-pip-text disabled:opacity-30 px-1 text-xs"
                          title="Move up"
                        >↑</button>
                        <button
                          disabled={index === localStakeholders.length - 1}
                          onClick={() => {
                            const next = [...localStakeholders];
                            [next[index], next[index + 1]] = [next[index + 1], next[index]];
                            setLocalStakeholders(next);
                            const allValid = next.every(x => {
                              const hasName = !!x.name && !!x.name.trim();
                              const isContactValid = !x.contact_no || /^\d{10,15}$/.test(x.contact_no.trim());
                              const isEmailValid = !x.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email.trim());
                              return hasName && isContactValid && isEmailValid;
                            });
                            if (allValid) {
                              void pmApi.updateStakeholders(project.id, next);
                            }
                          }}
                          className="text-pip-muted hover:text-pip-text disabled:opacity-30 px-1 text-xs"
                          title="Move down"
                        >↓</button>
                      </div>

                      <Button variant="ghost" onClick={() => {
                        const targetId = s.id;
                        const next = localStakeholders.filter((_, i) => i !== index);
                        setLocalStakeholders(next);
                        setStakeholderErrors(prev => {
                          const copy = { ...prev };
                          delete copy[`${targetId}_name`];
                          delete copy[`${targetId}_contact_no`];
                          delete copy[`${targetId}_email`];
                          return copy;
                        });
                        const allValid = next.every(x => {
                          const hasName = !!x.name && !!x.name.trim();
                          const isContactValid = !x.contact_no || /^\d{10,15}$/.test(x.contact_no.trim());
                          const isEmailValid = !x.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email.trim());
                          return hasName && isContactValid && isEmailValid;
                        });
                        if (allValid) {
                          void pmApi.updateStakeholders(project.id, next);
                        }
                      }} className="text-err-text hover:bg-red-900/20 px-2 py-1 h-auto text-xs mt-1">×</Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Section B — RAG Status + Milestones */}
          <Card className="p-6 md:p-8 mb-6 overflow-hidden">
            <h3 className="font-sora font-semibold text-lg text-pip-text mb-6">Section B — RAG Status</h3>
            <div className="overflow-x-auto -mx-6 md:mx-0 px-6 md:px-0">
              <div className="overflow-hidden rounded-lg border border-pip-border bg-surface-1">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-surface-2 border-b border-pip-border">
                      <th className="px-5 py-3 font-medium text-pip-secondary text-sm w-[20%]">Dimension</th>
                      <th className="px-5 py-3 font-medium text-pip-secondary text-sm w-[30%]">Status *</th>
                      <th className="px-5 py-3 font-medium text-pip-secondary text-sm w-[50%]">Comment (optional)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pip-border">
                    {RAG_DIMENSIONS.map(({ key, commentKey, label }) => {
                      const val = (form[key as keyof FormState] as string) ?? '';
                      return (
                        <tr key={key} className="hover:bg-surface-2/30 transition-colors">
                          <td className="px-5 py-4 text-pip-text font-medium text-sm">{label}</td>
                          <td className="px-5 py-4">
                            <Select
                              value={val}
                              onChange={e => update(key as keyof FormState, e.target.value)}
                              onBlur={e => handleBlur(key, e.target.value)}
                              error={fieldErrors[key]}
                              disabled={isSubmissionLocked}
                            >
                              <option value="">— Select —</option>
                              {RAG_OPTIONS.map(o => <option key={o} value={o}>{RAG_LABELS[o]}</option>)}
                            </Select>
                          </td>
                          <td className="px-5 py-4">
                            <Input
                              value={(form[commentKey as keyof FormState] as string) ?? ''}
                              onChange={e => update(commentKey as keyof FormState, e.target.value)}
                              placeholder="Optional note..."
                              disabled={isSubmissionLocked}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Project Health — auto-calculated */}
            <div className="mt-6 pt-4 border-t border-pip-border flex items-center gap-4">
              <div>
                <span className="block text-sm font-medium text-pip-text">Project Health</span>
                <span className="block text-xs text-pip-muted mt-0.5">Auto-calculated from 5 RAG dimensions</span>
              </div>
              <RAGBadge value={(computeProjectHealth(
                form.rag_schedule as string,
                form.rag_budget as string,
                form.rag_scope as string,
                form.rag_resources as string,
                form.rag_timeline as string,
              ) ?? null) as RAGValue | null} />
            </div>

            {/* Milestones */}
            <div className="mt-8 pt-6 border-t border-pip-border">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-semibold text-pip-text">Milestones</h4>
                <Button variant="secondary" onClick={addMilestone} disabled={isSubmissionLocked}>+ Add Milestone</Button>
              </div>
              {((form.milestones as MilestoneEntry[]) || []).length === 0 ? (
                <p className="text-pip-muted text-sm italic">No milestones added yet.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {((form.milestones as MilestoneEntry[]) || []).map((m, idx) => (
                    <div key={m.id} className="grid grid-cols-[1fr_auto_1fr_1fr_auto] gap-3 items-start bg-surface-2 p-3 rounded border border-pip-border">
                      <div>
                        <input
                          className={`w-full bg-surface-1 border rounded px-3 py-2 text-sm text-pip-text focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed ${fieldErrors[`milestone_name_${idx}`] ? 'border-red-500' : 'border-pip-border'}`}
                          placeholder="Milestone Name *"
                          value={m.name}
                          onChange={e => updateMilestone(idx, 'name', e.target.value)}
                          onBlur={e => {
                            if (!e.target.value.trim()) {
                              setFieldErrors(prev => ({ ...prev, [`milestone_name_${idx}`]: 'Required' }));
                            } else {
                              setFieldErrors(prev => { const n = { ...prev }; delete n[`milestone_name_${idx}`]; return n; });
                              saveMilestones();
                            }
                          }}
                          disabled={isSubmissionLocked}
                        />
                        {fieldErrors[`milestone_name_${idx}`] && <div className="text-red-400 text-xs mt-1">Required</div>}
                      </div>
                      <div className="relative">
                        <input
                          type="date"
                          lang="en-GB"
                          className="w-full bg-surface-1 border border-pip-border rounded px-3 py-2 pr-10 text-sm text-pip-text focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
                          value={m.target_date ?? ''}
                          onChange={e => updateMilestone(idx, 'target_date', e.target.value || null)}
                          onBlur={saveMilestones}
                          disabled={isSubmissionLocked}
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
                          className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-md bg-accent text-pip-text flex items-center justify-center hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={isSubmissionLocked}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                        </button>
                      </div>
                      <MilestoneStatusCombobox
                        value={m.status}
                        onChange={v => {
                          const ms = [...((form.milestones as MilestoneEntry[]) || [])];
                          ms[idx] = { ...ms[idx], status: v };
                          update('milestones', ms);
                          void pmApi.updateMilestones(project.id, ms);
                        }}
                        statuses={milestoneStatuses}
                        onCreateStatus={createMilestoneStatus}
                        disabled={isSubmissionLocked}
                      />
                      <input
                        className="w-full bg-surface-1 border border-pip-border rounded px-3 py-2 text-sm text-pip-text focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
                        placeholder="Comment (optional)"
                        value={m.comment ?? ''}
                        onChange={e => updateMilestone(idx, 'comment', e.target.value || null)}
                        onBlur={saveMilestones}
                        disabled={isSubmissionLocked}
                      />
                      <Button variant="ghost" onClick={() => removeMilestone(idx)} disabled={isSubmissionLocked} className="text-err-text hover:bg-red-900/20 px-2 py-1 h-auto text-xs mt-1">Remove</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Section C */}
          <Card className="p-6 md:p-8 mb-6">
            <h3 className="font-sora font-semibold text-lg text-pip-text mb-6">Section C — Project Updates</h3>
            <div className="flex flex-col gap-8">
              {SECTION_C_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-pip-text mb-2">{label}</label>
                  <RichTextEditor
                    value={(form[key as keyof FormState] as string) ?? ''}
                    onChange={html => update(key as keyof FormState, html)}
                    editable={!isSubmissionLocked}
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* Section D — Team Structure */}
          <Card className="p-6 md:p-8 overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-sora font-semibold text-lg text-pip-text">Section D — Team Structure</h3>
              <Button variant="secondary" disabled={isSubmissionLocked} onClick={() => {
                const ts = ((form.team_structure as TeamMember[]) || []);
                update('team_structure', [...ts, { serial_number: ts.length + 1, user_id: null, employee_id: '', role: '', employee_name: '', allocation_percentage: null }]);
              }}>+ Add Member</Button>
            </div>
            <div className="overflow-x-auto -mx-6 md:mx-0 px-6 md:px-0">
              <div className="overflow-hidden rounded-lg border border-pip-border bg-surface-1">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-surface-2 border-b border-pip-border">
                      <th className="px-5 py-3 font-medium text-pip-secondary text-sm w-[8%]">S.No</th>
                      <th className="px-5 py-3 font-medium text-pip-secondary text-sm w-[35%]">Employee</th>
                      <th className="px-5 py-3 font-medium text-pip-secondary text-sm w-[25%]">Role</th>
                      <th className="px-5 py-3 font-medium text-pip-secondary text-sm w-[15%]">Alloc %</th>
                      <th className="px-5 py-3 font-medium text-pip-secondary text-sm w-[10%]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pip-border">
                    {((form.team_structure as TeamMember[]) || []).length === 0 ? (
                      <tr><td colSpan={5} className="px-5 py-6 text-center text-pip-muted text-sm">No team members added yet.</td></tr>
                    ) : ((form.team_structure as TeamMember[]) || []).map((member, idx) => (
                      <tr key={idx} className="group hover:bg-surface-2/30 transition-colors">
                        <td className="px-5 py-4 text-pip-text font-medium text-sm">{idx + 1}</td>
                        <td className="px-5 py-4">
                          <Select
                            value={member.user_id ?? ''}
                            disabled={isSubmissionLocked}
                            onChange={e => {
                              const emp = teamMembersList.find(t => t.id === e.target.value);
                              if (emp) {
                                const newTs = [...((form.team_structure as TeamMember[]) || [])];
                                newTs[idx] = {
                                  ...newTs[idx],
                                  user_id: emp.id,
                                  employee_id: '',
                                  role: emp.ms_job_title || 'Unassigned',
                                  employee_name: emp.name || emp.email,
                                };
                                update('team_structure', newTs);
                                void loadMemberAllocation(emp.id);
                                clearTimeout(allocationTimers.current[idx]);
                                allocationTimers.current[idx] = setTimeout(() => void checkAllocationForMember(idx, newTs[idx], newTs), 300);
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
                              const wizardTeam = ((form.team_structure as TeamMember[]) || []);
                              const otherRowsAlloc = wizardTeam.reduce((sum, m, i) => {
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
                        <td className="px-5 py-4 text-pip-text text-sm">{member.role || '—'}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1} max={100}
                              className={`w-20 bg-surface-1 border rounded px-2 py-1 text-sm text-pip-text focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed ${allocationErrors[idx] ? 'border-red-500' : 'border-pip-border'}`}
                              value={member.allocation_percentage ?? ''}
                              onChange={e => handleAllocationChange(idx, e.target.value)}
                              onBlur={() => void checkAllocationForMember(idx, member)}
                              disabled={isSubmissionLocked}
                              placeholder="%"
                            />
                            {member.user_id && memberAllocations[member.user_id] && (() => {
                              const wizardTeam = ((form.team_structure as TeamMember[]) || []);
                              const stats = getMemberAllocationStats(member.user_id, wizardTeam);
                              const isOverAllocated = stats.totalAllocated > 100;
                              return (
                                <button
                                  type="button"
                                  className={`p-1.5 rounded-md hover:bg-surface-2 transition-colors shrink-0 ${isOverAllocated ? 'text-red-400' : 'text-green-400'}`}
                                  onClick={e => toggleTooltip(e, idx, member, stats, allocationErrors[idx])}
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
                        <td className="px-5 py-4 text-right">
                          <Button variant="ghost" disabled={isSubmissionLocked} onClick={() => {
                            const newTs = [...((form.team_structure as TeamMember[]) || [])];
                            newTs.splice(idx, 1);
                            newTs.forEach((m, i) => { m.serial_number = i + 1; });
                            update('team_structure', newTs);
                            setAllocationErrors({});
                            newTs.forEach((m, i) => {
                              void checkAllocationForMember(i, m, newTs);
                            });
                          }} className="text-err-text hover:bg-red-900/20 px-2 py-1 h-auto text-xs">Remove</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </>
      )}

      {activeTab === 'raid' && (
        <Card className="p-6 md:p-8">
          <RaidLogSection projectId={project.id} />
        </Card>
      )}

      {activeTab === 'team' && (
        <Card className="p-6 md:p-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-sora font-semibold text-lg text-pip-text">Project Team</h3>
              <p className="text-xs text-pip-muted mt-1">Persistent team allocation for this project. Independent of weekly submissions.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => {
                setProjectTeam(prev => [...prev, { serial_number: prev.length + 1, user_id: null, employee_id: '', role: '', employee_name: '', allocation_percentage: null }]);
              }}>+ Add Member</Button>
              <Button
                variant="primary"
                disabled={teamSaving || Object.keys(teamAllocationErrors).length > 0}
                onClick={async () => {
                  setTeamSaving(true);
                  try {
                    await pmApi.updateProjectTeamMembers(project.id, projectTeam);
                    update('team_structure', projectTeam);
                    toast.success('Team saved.');
                  } catch { toast.error('Failed to save team.'); } finally { setTeamSaving(false); }
                }}
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
                  {projectTeam.length === 0 ? (
                    <tr><td colSpan={5} className="px-5 py-6 text-center text-pip-muted text-sm">No team members. Click "+ Add Member" to start.</td></tr>
                  ) : projectTeam.map((member, idx) => (
                    <tr key={idx} className="hover:bg-surface-2/30 transition-colors">
                      <td className="px-5 py-3 text-pip-text text-sm">{idx + 1}</td>
                      <td className="px-5 py-3">
                        <Select
                          value={member.user_id ?? ''}
                          onChange={e => {
                            const emp = teamMembersList.find(t => t.id === e.target.value);
                            if (emp) {
                              const updated: TeamMember = { ...member, user_id: emp.id, employee_name: emp.name || emp.email, role: emp.ms_job_title || 'Unassigned' };
                              const nextTeam = projectTeam.map((m, i) => i === idx ? updated : m);
                              setProjectTeam(nextTeam);
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
                            const otherRowsAlloc = projectTeam.reduce((sum, m, i) => {
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
                              const nextTeam = projectTeam.map((m, i) => i === idx ? updated : m);
                              setProjectTeam(nextTeam);
                              clearTimeout(teamAllocationTimers.current[idx]);
                              teamAllocationTimers.current[idx] = setTimeout(() => void checkTeamMemberAllocation(idx, updated, nextTeam), 300);
                            }}
                            onBlur={() => void checkTeamMemberAllocation(idx, member)}
                            placeholder="%"
                          />
                          {member.user_id && memberAllocations[member.user_id] && (() => {
                            const stats = getMemberAllocationStats(member.user_id, projectTeam);
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
                        <Button variant="ghost" onClick={() => {
                          const updatedTeam = projectTeam.filter((_, i) => i !== idx).map((m, i) => ({ ...m, serial_number: i + 1 }));
                          setProjectTeam(updatedTeam);
                          setTeamAllocationErrors({});
                          updatedTeam.forEach((m, i) => {
                            void checkTeamMemberAllocation(i, m, updatedTeam);
                          });
                        }} className="text-err-text hover:bg-red-900/20 px-2 py-1 h-auto text-xs">Remove</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {showPreview && (
        <PPTPreview form={form} project={project} pmName={pmName || pmEmail} onClose={() => setShowPreview(false)} />
      )}

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
              tooltipState.projects.map((p: { project_name: string; allocation_percentage: number }, i: number) => {
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

// ─── Project Card ─────────────────────────────────────────────────────────────

function getISOWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getReportingStatus(project: PMProject): 'published' | 'pending' | 'overdue' {
  if (project.published_sprint_start_date) {
    const thisWeekStart = getISOWeekStart(new Date());
    const pubWeekStart = getISOWeekStart(new Date(project.published_sprint_start_date));
    if (pubWeekStart.getTime() === thisWeekStart.getTime()) return 'published';
  }
  if (project.draft_id) return 'pending';
  return 'overdue';
}

const HEALTH_CONFIG = {
  green: { label: 'On Track', dot: 'bg-green-400', badge: 'bg-green-900/20 text-green-400 border border-green-700/30' },
  amber: { label: 'Needs Attention', dot: 'bg-amber-400', badge: 'bg-amber-900/20 text-amber-400 border border-amber-700/30' },
  red: { label: 'Critical', dot: 'bg-red-400', badge: 'bg-red-900/20 text-red-400 border border-red-700/30' },
} as const;

const RAG_DIM_LABELS: Record<string, string> = {
  rag_schedule: 'Schedule', rag_budget: 'Budget', rag_scope: 'Scope',
  rag_resources: 'Resources', rag_timeline: 'Timeline',
};

const RAG_DIMS = ['rag_schedule', 'rag_budget', 'rag_scope', 'rag_resources', 'rag_timeline'] as const;

function buildHealthMessage(project: PMProject): string {
  const health = project.rag_project_health;
  if (!health) return 'No submission yet for this project.';
  if (health === 'green') return 'All dimensions are on track.';
  const critical = RAG_DIMS.filter(d => project[d] === 'red');
  const atRisk = RAG_DIMS.filter(d => project[d] === 'amber' || project[d] === 'red');
  if (health === 'red' && critical.length > 0)
    return `Critical issues in: ${critical.map(d => RAG_DIM_LABELS[d]).join(', ')}.`;
  if (atRisk.length > 0)
    return `Attention needed: ${atRisk.map(d => RAG_DIM_LABELS[d]).join(', ')}.`;
  return 'Review required.';
}

const REPORTING_CONFIG = {
  published: { label: 'PUBLISHED', icon: '✓', cls: 'bg-green-900/20 text-green-400 border border-green-700/30' },
  pending: { label: 'PENDING', icon: '⏳', cls: 'bg-amber-900/20 text-amber-400 border border-amber-700/30' },
  overdue: { label: 'OVERDUE', icon: '!', cls: 'bg-red-900/20 text-red-400 border border-red-700/30' },
} as const;

function ProjectCard({ project, pmName, onSelect }: { project: PMProject; pmName: string; onSelect: () => void }) {
  const health = project.rag_project_health as 'green' | 'amber' | 'red' | null;
  const healthCfg = health ? HEALTH_CONFIG[health] : null;
  const healthMessage = buildHealthMessage(project);
  const reportingStatus = getReportingStatus(project);
  const reportingCfg = REPORTING_CONFIG[reportingStatus];

  const startLabel = formatDate(project.project_start_date);
  const publishLabel = project.published_updated_at ? formatDate(project.published_updated_at) : null;

  const reportingSubtext =
    reportingStatus === 'published' && publishLabel ? `Published ${publishLabel}` :
      reportingStatus === 'pending' ? 'Draft saved' :
        'No update this week';

  return (
    <div
      onClick={onSelect}
      className="project-card bg-surface-1 border border-pip-border rounded-xl p-5 cursor-pointer hover:border-accent/50 hover:bg-surface-2 transition-all flex flex-col gap-4"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="project-initial w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 text-accent text-sm font-bold">
          {project.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-sora font-semibold text-pip-text text-sm leading-snug line-clamp-2">{project.name}</h3>
          <Tooltip content={project.client_name} className="text-pip-muted text-xs mt-0.5 block">
            {project.client_name}
          </Tooltip>
        </div>
      </div>

      {/* Health badge + PM name */}
      <div className="flex items-center justify-between gap-2">
        {healthCfg ? (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${healthCfg.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${healthCfg.dot}`} />
            {healthCfg.label}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-surface-3 text-pip-muted border border-pip-border">
            <span className="w-1.5 h-1.5 rounded-full bg-pip-muted/50" />
            No Report
          </span>
        )}
        {pmName && (
          <Tooltip content={`PM: ${pmName}`} className="text-xs text-pip-muted max-w-[50%]">
            PM: {pmName}
          </Tooltip>
        )}
      </div>

      {/* Dynamic health message */}
      <p className="text-xs text-pip-secondary leading-relaxed -mt-1">{healthMessage}</p>

      {/* Reporting status banner */}
      <div className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs ${reportingCfg.cls}`}>
        <span className="font-bold tracking-wide">{reportingCfg.icon} {reportingCfg.label}</span>
        <span className="opacity-80">{reportingSubtext}</span>
      </div>

      {/* Footer: Start Date | Project Type | Team Size */}
      <div className="flex items-stretch divide-x divide-pip-border pt-1 border-t border-pip-border -mx-1">
        <div className="flex-1 flex items-center gap-1.5 px-2 min-w-0">
          <span className="text-pip-muted text-xs flex-shrink-0">📅</span>
          <div className="min-w-0">
            <div className="text-[10px] text-pip-muted uppercase tracking-wider">Start</div>
            <Tooltip content={startLabel} className="text-xs text-pip-text font-medium block">
              {startLabel}
            </Tooltip>
          </div>
        </div>
        <div className="flex-1 flex items-center gap-1.5 px-2 min-w-0">
          <span className="text-pip-muted text-xs flex-shrink-0">💼</span>
          <div className="min-w-0">
            <div className="text-[10px] text-pip-muted uppercase tracking-wider">Type</div>
            <Tooltip content={project.engagement_type || '—'} className="text-xs text-pip-text font-medium block">
              {project.engagement_type || '—'}
            </Tooltip>
          </div>
        </div>
        <div className="flex-1 flex items-center gap-1.5 px-2 min-w-0">
          <span className="text-pip-muted text-xs flex-shrink-0">👥</span>
          <div className="min-w-0">
            <div className="text-[10px] text-pip-muted uppercase tracking-wider">Team</div>
            <div className="text-xs text-pip-text font-medium">{project.tech_team_size != null ? String(project.tech_team_size) : '—'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Project List ─────────────────────────────────────────────────────────────

function ProjectList({ projects, pmName, onSelect }: { projects: PMProject[]; pmName: string; onSelect: (p: PMProject) => void }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.client_name ?? '').toLowerCase().includes(q)
    );
  }, [projects, search]);

  const { page, setPage, pageSize, handlePageSizeChange, totalPages, paginated, totalItems } = usePagination(filtered);

  // Reset to page 1 when search changes
  useEffect(() => { setPage(1); }, [search, setPage]);

  if (projects.length === 0) return <EmptyState message="No projects assigned to you yet." />;

  return (
    <div>
      <div className="mb-6">
        <Input
          placeholder="Search by project or client…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          icon={
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          }
        />
      </div>

      {paginated.length === 0 ? (
        <EmptyState message="No projects match your search." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginated.map(p => (
            <ProjectCard key={p.id} project={p} pmName={pmName} onSelect={() => onSelect(p)} />
          ))}
        </div>
      )}

      <div className="border border-pip-border rounded-lg mt-4">
        <Pagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={totalItems}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>
    </div>
  );
}

// ─── PM Dashboard ─────────────────────────────────────────────────────────────

export function PMDashboard() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<PMProject[]>([]);
  const [selected, setSelected] = useState<PMProject | null>(null);
  const [loading, setLoading] = useState(true);

  const pmName = user?.name ?? '';
  const pmEmail = user?.email ?? '';

  const refreshProjects = useCallback(() => {
    pmApi.listProjects().then(setProjects).catch(() => { });
  }, []);

  useEffect(() => {
    pmApi.listProjects().then(setProjects).catch(() => { }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    console.log('[PM Dashboard Socket] Connecting to socket...');
    const socket = connectDashboardSocket();

    socket.on('connect', () => {
      console.log('[PM Dashboard Socket] Socket connected. ID:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[PM Dashboard Socket] Socket disconnected. Reason:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('[PM Dashboard Socket] Socket connection error:', error);
    });

    socket.on('project.assigned', (payload: { id: string; name: string }) => {
      console.log('[PM Dashboard Socket] project.assigned event received for project:', payload.id, payload.name);
      toast.success(`New project assigned: ${payload.name}`);
      refreshProjects();
    });

    socket.on('project.unassigned', (payload: { id: string; name: string }) => {
      console.log('[PM Dashboard Socket] project.unassigned event received for project:', payload.id, payload.name);
      toast.info(`Project unassigned: ${payload.name}`);
      refreshProjects();
    });

    socket.on('field.overridden', (payload: any) => {
      console.log('[PM Dashboard Socket] field.overridden event received:', payload);
      toast.warning('A field in your project update has been overridden by the Program Manager.');
      refreshProjects();
    });

    return () => {
      console.log('[PM Dashboard Socket] Cleaning up socket connection...');
      socket.off('project.assigned');
      socket.off('project.unassigned');
      socket.off('field.overridden');
      socket.disconnect();
    };
  }, [refreshProjects]);

  function handleBack() {
    refreshProjects();
    setSelected(null);
  }

  return (
    <div className="min-h-screen bg-base">
      <Navbar title="Project Manager Dashboard" userEmail={pmEmail} />
      <main className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
        {selected ? (
          <ProjectEditor project={selected} pmName={pmName} pmEmail={pmEmail} onBack={handleBack} />
        ) : (
          <div>
            <header className="mb-8">
              <h1 className="font-sora font-bold text-3xl text-pip-text mb-2 tracking-tight">My Projects</h1>
              <p className="text-pip-secondary text-base">Select a project to submit your weekly status update.</p>
            </header>
            {loading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div> : <ProjectList projects={projects} pmName={pmName || pmEmail} onSelect={setSelected} />}
          </div>
        )}
      </main>
    </div>
  );
}
