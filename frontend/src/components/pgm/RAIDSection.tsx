import { useState } from 'react';
import { pgmApi } from '../../api/pgm.js';
import { Button, Input, Select, Tooltip } from '../ui/index.js';
import type { RaidLog } from '../../../../shared/src/types.js';

const RAID_TYPES = ['Risk', 'Assumption', 'Issue', 'Dependency'] as const;
const IMPACT_OPTIONS = ['', 'Low', 'Medium', 'High'] as const;
const PRIORITY_OPTIONS = ['', 'P1 - Critical', 'P2 - High', 'P3 - Medium', 'P4 - Low'] as const;
const STATUS_OPTIONS = ['Pending', 'In Progress', 'Resolved'] as const;

const emptyRaidForm = {
  type: 'Risk',
  date_raised: '',
  title: '',
  description: '',
  impact: '',
  urgency: '',
  probability: '',
  priority: '',
  owner: '',
  status: 'Pending',
  mitigation: '',
};

type RaidForm = typeof emptyRaidForm;

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


export function RAIDSection({
  projectId,
  logs,
  onRefresh,
}: {
  projectId: string;
  logs: RaidLog[];
  onRefresh: () => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<RaidForm>({ ...emptyRaidForm });

  function openAdd() {
    setEditId(null);
    setForm({ ...emptyRaidForm, date_raised: new Date().toISOString().slice(0, 10) });
    setFormOpen(true);
  }

  function openEdit(log: RaidLog) {
    setEditId(log.id);
    setForm({
      type: log.type,
      date_raised: log.date_raised,
      title: log.title,
      description: log.description ?? '',
      impact: log.impact ?? '',
      urgency: log.urgency ?? '',
      probability: log.probability ?? '',
      priority: log.priority ?? '',
      owner: log.owner ?? '',
      status: log.status,
      mitigation: log.mitigation ?? '',
    });
    setFormOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    const payload = {
      type: form.type,
      date_raised: form.date_raised,
      title: form.title.trim(),
      description: form.description || null,
      impact: (form.impact || null) as any,
      urgency: (form.urgency || null) as any,
      probability: (form.probability || null) as any,
      priority: (form.priority || null) as any,
      owner: form.owner || null,
      status: form.status as any,
      mitigation: form.mitigation || null,
    };
    if (editId) {
      await pgmApi.updateRaidEntry(projectId, editId, payload);
    } else {
      await pgmApi.createRaidEntry(projectId, payload);
    }
    setFormOpen(false);
    setEditId(null);
    onRefresh();
  }

  async function handleDelete(raidId: string) {
    await pgmApi.deleteRaidEntry(projectId, raidId);
    onRefresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-sora font-semibold text-lg text-pip-text">RAID Log</h3>
        <Button variant="primary" size="sm" onClick={openAdd}>+ Add Entry</Button>
      </div>

      {formOpen && (
        <div className="bg-surface-2 border border-pip-border rounded-lg p-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-pip-muted mb-1 block">Type *</label>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full">
                {RAID_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
            
            <div className="relative">
              <label className="text-xs text-pip-muted mb-1 block">Date Raised</label>
              <Input
                type="date"
                lang="en-GB"
                value={form.date_raised}
                onChange={(e) => setForm({ ...form, date_raised: e.target.value })}
                className="w-full pr-12"
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
                      try { (inputEl as any).showPicker(); } catch {}
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
          </div>
          <div>
            <label className="text-xs text-pip-muted mb-1 block">Title *</label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Short descriptive title..." className="w-full" />
          </div>
          <div>
            <label className="text-xs text-pip-muted mb-1 block">Description</label>
            <textarea
              className="w-full bg-surface-1 border border-pip-border rounded-md px-3 py-2 text-sm text-pip-text focus:outline-none focus:border-accent min-h-[60px]"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Details..."
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-pip-muted mb-1 block">Impact</label>
              <Select value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })} className="w-full">
                {IMPACT_OPTIONS.map(o => <option key={o} value={o}>{o || 'None'}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-xs text-pip-muted mb-1 block">Urgency</label>
              <Select value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })} className="w-full">
                {IMPACT_OPTIONS.map(o => <option key={o} value={o}>{o || 'None'}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-xs text-pip-muted mb-1 block">Probability</label>
              <Select value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })} className="w-full">
                {IMPACT_OPTIONS.map(o => <option key={o} value={o}>{o || 'None'}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-pip-muted mb-1 block">Priority</label>
              <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full">
                {PRIORITY_OPTIONS.map(o => <option key={o} value={o}>{o || 'None'}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-xs text-pip-muted mb-1 block">Owner</label>
              <Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="Owner name..." className="w-full" />
            </div>
          </div>
          <div>
            <label className="text-xs text-pip-muted mb-1 block">Status</label>
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-48">
              {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-pip-muted mb-1 block">Mitigation</label>
            <textarea
              className="w-full bg-surface-1 border border-pip-border rounded-md px-3 py-2 text-sm text-pip-text focus:outline-none focus:border-accent min-h-[60px]"
              value={form.mitigation}
              onChange={(e) => setForm({ ...form, mitigation: e.target.value })}
              placeholder="Mitigation plan..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setFormOpen(false); setEditId(null); }}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={() => void handleSave()}>{editId ? 'Update' : 'Add'}</Button>
          </div>
        </div>
      )}

      {logs.length === 0 && !formOpen ? (
        <div className="text-center py-8 text-pip-muted text-sm italic bg-surface-2 rounded-lg border border-dashed border-pip-border">
          No RAID entries yet.
        </div>
      ) : logs.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-pip-border">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-surface-2 border-b border-pip-border">
                <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider">#</th>
                <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider">Type</th>
                <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider">Title</th>
                <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider">Owner</th>
                <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider">Impact</th>
                <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider">Priority</th>
                <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pip-border">
              {logs.map((log) => (
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
                  <td className="px-3 py-2 text-pip-secondary text-xs">{log.priority ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColors[log.status] ?? ''}`}>{log.status}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button className="text-xs text-pip-muted hover:text-pip-text px-1 py-0.5 rounded hover:bg-surface-3 transition-colors" onClick={() => openEdit(log)}>Edit</button>
                      <button className="text-xs text-pip-muted hover:text-red-400 px-1 py-0.5 rounded hover:bg-surface-3 transition-colors" onClick={() => void handleDelete(log.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}