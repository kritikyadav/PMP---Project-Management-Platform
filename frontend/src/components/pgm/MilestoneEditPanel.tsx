import { Button, Select } from '../ui/index.js';
import type React from 'react';
import { createClientId } from '../../utils/id.js';

interface MilestoneEditPanelProps {
  localMilestones: any[];
  setLocalMilestones: React.Dispatch<React.SetStateAction<any[]>>;

  milestonesSaving: boolean;

  detail: any;

  handleMilestonesSave: () => Promise<void>;

}

export function MilestoneEditPanel({
  localMilestones,
  setLocalMilestones,
  milestonesSaving,
  detail,
  handleMilestonesSave,
}: MilestoneEditPanelProps) {
  return (
    <section>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="font-sora font-semibold text-lg text-pip-text">Milestones</h3>
                            <div className="flex items-center gap-2">
                              <Button variant="secondary" size="sm" onClick={() => setLocalMilestones(prev => [...prev, { id: createClientId('milestone'), name: '', target_date: null, status: 'Not Started', comment: null }])}>
                                + Add
                              </Button>
                              <Button variant="primary" size="sm" disabled={milestonesSaving || !detail?.id} onClick={() => void handleMilestonesSave()}>
                                {milestonesSaving ? 'Saving...' : 'Save Milestones'}
                              </Button>
                            </div>
                          </div>
                          {localMilestones.length === 0 ? (
                            <div className="text-sm text-pip-muted italic bg-surface-2 border border-dashed border-pip-border rounded-lg p-4">No milestones.</div>
                          ) : (
                            <div className="overflow-x-auto rounded-lg border border-pip-border">
                              <table className="w-full text-left text-sm">
                                <thead className="bg-surface-2 border-b border-pip-border">
                                  <tr>
                                    <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider w-[35%]">Name</th>
                                    <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider w-[20%]">Target Date</th>
                                    <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider w-[20%]">Status</th>
                                    <th className="px-3 py-2 text-xs text-pip-secondary uppercase tracking-wider w-[20%]">Comment</th>
                                    <th className="px-3 py-2 w-[5%]"></th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-pip-border">
                                  {localMilestones.map((m, idx) => (
                                    <tr key={m.id}>
                                      <td className="px-3 py-2">
                                        <input className="w-full h-8 bg-surface-1 border border-pip-border rounded px-2 py-0 text-sm text-pip-text focus:outline-none focus:border-accent" value={m.name} onChange={e => setLocalMilestones(prev => prev.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} placeholder="Milestone name" />
                                      </td>
                                      <td className="px-3 py-2">
                                        <input type="date" lang="en-GB" className="w-full h-8 bg-surface-1 border border-pip-border rounded px-2 py-0 text-sm text-pip-text focus:outline-none focus:border-accent" value={m.target_date ?? ''} onChange={e => setLocalMilestones(prev => prev.map((x, i) => i === idx ? { ...x, target_date: e.target.value || null } : x))} />
                                      </td>
                                      <td className="px-3 py-2">
                                        <Select className="h-8 py-0 min-w-[120px]" value={m.status ?? ''} onChange={e => setLocalMilestones(prev => prev.map((x, i) => i === idx ? { ...x, status: e.target.value } : x))}>
                                          {['Not Started','On Track','At Risk','Delayed','Completed'].map(s => <option key={s} value={s}>{s}</option>)}
                                        </Select>
                                      </td>
                                      <td className="px-3 py-2">
                                        <input className="w-full h-8 bg-surface-1 border border-pip-border rounded px-2 py-0 text-sm text-pip-text focus:outline-none focus:border-accent" value={m.comment ?? ''} onChange={e => setLocalMilestones(prev => prev.map((x, i) => i === idx ? { ...x, comment: e.target.value || null } : x))} placeholder="Optional" />
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <button className="text-err-text hover:opacity-70 text-xs" onClick={() => setLocalMilestones(prev => prev.filter((_, i) => i !== idx))}>✕</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
    </section>
    );
}