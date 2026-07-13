import { useEffect, useState } from 'react';
import { projectsApi, type AvailablePM } from '../api/projects.js';
import type { Stakeholder } from '../api/pm.js';
import { Modal, Button, Input, Select, ErrorBanner } from './ui/index.js';
import type { MilestoneEntry } from '../../../shared/src/types.js';
import { createClientId } from '../utils/id.js';

interface ProjectCreationWizardProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 1 | 2 | 3;

interface FormState {
  name: string;
  client_name: string;
  assigned_pm_id: string;
  engagement_type: string;
  methodology: string;
}

const MILESTONE_STATUS_OPTIONS = [
  'On Track',
  'At Risk',
  'Delayed',
  'Completed',
  'Not Started',
];

export function ProjectCreationWizard({ open, onClose, onSuccess }: ProjectCreationWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>({ name: '', client_name: '', assigned_pm_id: '', engagement_type: '', methodology: '' });
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [milestones, setMilestones] = useState<MilestoneEntry[]>([]);
  const [pms, setPMs] = useState<AvailablePM[]>([]);
  const [pmsLoading, setPMsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'name' | 'client_name' | 'engagement_type' | 'methodology', string>>>({});
  const [stakeholderErrors, setStakeholderErrors] = useState<Record<string, Partial<Record<'name' | 'contact_no' | 'email', string>>>>({});

  useEffect(() => {
    if (!open || step !== 3 || pms.length > 0) return;

    setPMsLoading(true);
    projectsApi.availablePMs()
      .then(setPMs)
      .catch(() => setError('Could not load project managers.'))
      .finally(() => setPMsLoading(false));
  }, [open, pms.length, step]);

  function reset() {
    setStep(1);
    setForm({ name: '', client_name: '', assigned_pm_id: '', engagement_type: '', methodology: '' });
    setStakeholders([]);
    setMilestones([]);
    setPMs([]);
    setError('');
    setFieldErrors({});
  }

  function handleClose() {
    reset();
    onClose();
  }

  function goToStep2() {
    const nextErrors: typeof fieldErrors = {};
    if (!form.name.trim()) nextErrors.name = 'Project name is required.';
    if (!form.client_name.trim()) nextErrors.client_name = 'Client name is required.';
    if (!form.engagement_type) nextErrors.engagement_type = 'Engagement type is required.';
    if (!form.methodology) nextErrors.methodology = 'Methodology is required.';

    const nextStakeholderErrors: typeof stakeholderErrors = {};
    stakeholders.forEach((stakeholder) => {
      const name = stakeholder.name.trim();
      const contact_no = stakeholder.contact_no.trim();
      const email = stakeholder.email.trim();
      if (!name || !contact_no || !email) {
        nextStakeholderErrors[stakeholder.id] = {
          ...(nextStakeholderErrors[stakeholder.id] ?? {}),
          ...( !name ? { name: 'Name is required.' } : {} ),
          ...( !contact_no ? { contact_no: 'Contact number is required.' } : {} ),
          ...( !email ? { email: 'Email is required.' } : {} ),
        };
      }
      if (contact_no && !isValidContactNo(contact_no)) {
        nextStakeholderErrors[stakeholder.id] = {
          ...(nextStakeholderErrors[stakeholder.id] ?? {}),
          contact_no: 'Please enter a valid 10-15 digit contact number.',
        };
      }
      if (email && !isValidEmail(email)) {
        nextStakeholderErrors[stakeholder.id] = {
          ...(nextStakeholderErrors[stakeholder.id] ?? {}),
          email: 'Please enter a valid email address.',
        };
      }
    });

    if (Object.keys(nextErrors).length > 0 || Object.keys(nextStakeholderErrors).length > 0) {
      setFieldErrors(nextErrors);
      setStakeholderErrors(nextStakeholderErrors);
      return;
    }

    setFieldErrors({});
    setStakeholderErrors({});
    setStep(2);
  }

  function validateField(field: 'name' | 'client_name' | 'engagement_type' | 'methodology') {
    setFieldErrors((current) => {
      const next = { ...current };
      if (field === 'name') {
        if (!form.name.trim()) next.name = 'Project name is required.';
        else delete next.name;
      }
      if (field === 'client_name') {
        if (!form.client_name.trim()) next.client_name = 'Client name is required.';
        else delete next.client_name;
      }
      if (field === 'engagement_type') {
        if (!form.engagement_type) next.engagement_type = 'Engagement type is required.';
        else delete next.engagement_type;
      }
      if (field === 'methodology') {
        if (!form.methodology) next.methodology = 'Methodology is required.';
        else delete next.methodology;
      }
      return next;
    });
  }

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const isValidContactNo = (value: string) => /^\d{10,15}$/.test(value);

  function clearStakeholderError(id: string, field: 'name' | 'contact_no' | 'email') {
    setStakeholderErrors((current) => {
      const entry = current[id];
      if (!entry || !entry[field]) return current;
      const next = { ...current, [id]: { ...entry } };
      delete next[id][field];
      if (Object.keys(next[id]).length === 0) {
        delete next[id];
      }
      return next;
    });
  }

  function validateStakeholderField(id: string, field: 'name' | 'contact_no' | 'email', value: string) {
    const trimmed = value.trim();
    let message: string | undefined;

    if (field === 'name') {
      if (!trimmed) message = 'Name is required.';
    }
    if (field === 'contact_no') {
      if (!trimmed) message = 'Contact number is required.';
      else if (!isValidContactNo(trimmed)) message = 'Please enter a valid 10-15 digit contact number.';
    }
    if (field === 'email') {
      if (!trimmed) message = 'Email is required.';
      else if (!isValidEmail(trimmed)) message = 'Please enter a valid email address.';
    }

    setStakeholderErrors((current) => {
      const next = { ...current, [id]: { ...(current[id] ?? {}) } };

      if (message) {
        next[id][field] = message;
      } else {
        delete next[id][field];
      }

      if (Object.keys(next[id]).length === 0) {
        delete next[id];
      }

      return next;
    });
  }

  function addMilestone() {
    setMilestones((prev) => [
      ...prev,
      { id: createClientId('milestone'), name: '', target_date: '', status: 'Not Started', comment: null },
    ]);
  }

  function updateMilestone(index: number, patch: Partial<MilestoneEntry>) {
    setMilestones((prev) => prev.map((m, i) => i === index ? { ...m, ...patch } : m));
  }

  function removeMilestone(index: number) {
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreate() {
    setError('');
    setSubmitting(true);
    try {
      await projectsApi.createProject({
        name: form.name.trim(),
        client_name: form.client_name.trim(),
        engagement_type: form.engagement_type,
        methodology: form.methodology,
        stakeholders: stakeholders.filter((s) => s.name.trim()).map((s) => ({
          ...s,
          name: s.name.trim(),
          contact_no: s.contact_no.trim(),
          email: s.email.trim(),
        })),
        milestones: milestones.filter((m) => m.name.trim()).map((m) => ({
          ...m,
          name: m.name.trim(),
          target_date: m.target_date || null,
        })),
        ...(form.assigned_pm_id ? { assigned_pm_id: form.assigned_pm_id } : {}),
      });
      reset();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project.');
    } finally {
      setSubmitting(false);
    }
  }

  const steps: { label: string }[] = [
    { label: 'Details' },
    { label: 'Milestones' },
    { label: 'Assignment' },
  ];

  return (
    <Modal open={open} onClose={handleClose} title="New Project Wizard">
      {/* Step indicators */}
      <div className="flex items-center justify-end gap-3 mt-4 border-t border-pip-border pt-4 pb-4" style={{ padding: '2%' }}>
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1 z-10">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step > i + 1 ? 'bg-pip-accent text-white' : step === i + 1 ? 'bg-pip-accent text-white' : 'bg-surface-3 text-pip-muted'}`}>
                {i + 1}
              </div>
              <span className={`text-xs font-semibold ${step >= i + 1 ? 'text-pip-accent' : 'text-pip-muted'}`}>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-3 mt-[-0.75rem] ${step > i + 1 ? 'bg-pip-accent' : 'bg-surface-3'}`} />
            )}
          </div>
        ))}
      </div>

      <div className="mb-6" style={{ padding: '2%' }}>
        {error && <ErrorBanner message={error} className="mb-4" />}

        {/* Step 1: Details + Stakeholders */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div className="w-[90%] mx-auto">
              <Input
                label="Project Name *"
                value={form.name}
                onChange={(e) => { setForm((c) => ({ ...c, name: e.target.value })); setFieldErrors((c) => ({ ...c, name: undefined })); }}
                onBlur={() => validateField('name')}
                placeholder="e.g. Client Portal v2"
                error={fieldErrors.name}
                autoFocus
              />
            </div>
            <div className="w-[90%] mx-auto">
              <Input
                label="Client Name *"
                value={form.client_name}
                onChange={(e) => { setForm((c) => ({ ...c, client_name: e.target.value })); setFieldErrors((c) => ({ ...c, client_name: undefined })); }}
                onBlur={() => validateField('client_name')}
                placeholder="e.g. Acme Corp"
                error={fieldErrors.client_name}
              />
            </div>
            <div className="grid grid-cols-2 gap-4 w-[90%] mx-auto">
              <div>
                <label className="block text-sm font-medium text-pip-text mb-1">Engagement Type *</label>
                <Select
                  value={form.engagement_type}
                  onChange={(e) => { setForm((c) => ({ ...c, engagement_type: e.target.value })); setFieldErrors((c) => ({ ...c, engagement_type: undefined })); }}
                  onBlur={() => validateField('engagement_type')}
                  className="w-full rounded-lg border border-pip-border bg-surface-2 px-3 py-2 text-sm text-pip-text appearance-none focus:outline-none focus:ring-1 focus:ring-accent hover:border-accent"
                >
                  <option value="">Select engagement type...</option>
                  <option value="Fixed Cost">Fixed Cost</option>
                  <option value="T&M">Time & Material (T&M)</option>
                  <option value="Hybrid">Hybrid</option>
                </Select>
                {fieldErrors.engagement_type && <p className="text-xs text-err-text mt-1">{fieldErrors.engagement_type}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-pip-text mb-1">Methodology *</label>
                <Select
                  value={form.methodology}
                  onChange={(e) => { setForm((c) => ({ ...c, methodology: e.target.value })); setFieldErrors((c) => ({ ...c, methodology: undefined })); }}
                  onBlur={() => validateField('methodology')}
                  className="w-full rounded-lg border border-pip-border bg-surface-2 px-3 py-2 text-sm text-pip-text appearance-none focus:outline-none focus:ring-1 focus:ring-accent hover:border-accent"
                >
                  <option value="">Select methodology...</option>
                  <option value="Agile">Agile</option>
                  <option value="Waterfall">Waterfall</option>
                </Select>
                {fieldErrors.methodology && <p className="text-xs text-err-text mt-1">{fieldErrors.methodology}</p>}
              </div>
            </div>

            <div className="border-t border-pip-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-pip-text">Stakeholders</label>
                <Button variant="secondary" size="sm" onClick={() => {
                  const id = createClientId('stakeholder');
                  setStakeholders((c) => [...c, { id, name: '', contact_no: '', email: '' }]);
                }}>
                  Add Stakeholder
                </Button>
              </div>
              {stakeholders.length > 0 && (
                <div className="flex flex-col gap-3">
                  {stakeholders.map((stakeholder, index) => (
                    <div key={stakeholder.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2">
                      <Input
                        value={stakeholder.name}
                        onChange={(e) => {
                          const value = e.target.value;
                          setStakeholders((c) => c.map((s, i) => i === index ? { ...s, name: value } : s));
                          clearStakeholderError(stakeholder.id, 'name');
                        }}
                        onBlur={(e) => validateStakeholderField(stakeholder.id, 'name', e.target.value)}
                        placeholder="Name"
                        error={stakeholderErrors[stakeholder.id]?.name}
                      />
                      <Input
                        value={stakeholder.contact_no}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^\d]/g, '').slice(0, 15);
                          setStakeholders((c) => c.map((s, i) => i === index ? { ...s, contact_no: value } : s));
                          clearStakeholderError(stakeholder.id, 'contact_no');
                        }}
                        onBlur={(e) => validateStakeholderField(stakeholder.id, 'contact_no', e.target.value)}
                        placeholder="Contact no"
                        error={stakeholderErrors[stakeholder.id]?.contact_no}
                      />
                      <Input
                        type="email"
                        value={stakeholder.email}
                        onChange={(e) => {
                          const value = e.target.value;
                          setStakeholders((c) => c.map((s, i) => i === index ? { ...s, email: value } : s));
                          clearStakeholderError(stakeholder.id, 'email');
                        }}
                        onBlur={(e) => validateStakeholderField(stakeholder.id, 'email', e.target.value)}
                        placeholder="Email"
                        error={stakeholderErrors[stakeholder.id]?.email}
                      />
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setStakeholders((c) => c.filter((_, i) => i !== index));
                          setStakeholderErrors((current) => {
                            const next = { ...current };
                            delete next[stakeholder.id];
                            return next;
                          });
                        }}
                        className="text-err-text hover:bg-red-900/20"
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Milestones */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-pip-text">Project Milestones</p>
                <p className="text-xs text-pip-muted mt-0.5">Optional. Add key milestones for this project.</p>
              </div>
              <Button variant="secondary" size="sm" onClick={addMilestone}>+ Add Milestone</Button>
            </div>

            {milestones.length === 0 ? (
              <div className="text-sm text-pip-muted italic bg-surface-2 border border-dashed border-pip-border rounded-lg p-4 text-center">
                No milestones added. Click "+ Add Milestone" to begin.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {milestones.map((milestone, index) => (
                  <div key={milestone.id} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end">
                    <Input
                      label={index === 0 ? 'Milestone Name' : undefined}
                      value={milestone.name}
                      onChange={(e) => updateMilestone(index, { name: e.target.value })}
                      placeholder="e.g. UAT Sign-off"
                    />
                    <div>
                      {index === 0 && <label className="block text-sm font-medium text-pip-text mb-1">Target Date</label>}
                      <div className="relative">
                        <input
                          type="date"
                          lang="en-GB"
                          value={milestone.target_date ?? ''}
                          onChange={(e) => updateMilestone(index, { target_date: e.target.value })}
                          className="w-full pr-10 bg-surface-2 border border-pip-border rounded-lg px-3 py-2 text-sm text-pip-text focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                        <button
                          type="button"
                          aria-label="Open date picker"
                          onClick={(e) => {
                            const btn = e.currentTarget as HTMLButtonElement;
                            const inputEl = btn.previousElementSibling as HTMLInputElement | null;
                            if (inputEl) {
                              inputEl.focus();
                              if ((inputEl as any).showPicker) try { (inputEl as any).showPicker(); } catch {}
                            }
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-md bg-transparent text-pip-muted hover:text-pip-text flex items-center justify-center"
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
                      {index === 0 && <label className="block text-sm font-medium text-pip-text mb-1">Status</label>}
                      <Select
                        value={milestone.status ?? 'Not Started'}
                        onChange={(e) => updateMilestone(index, { status: e.target.value })}
                        className="w-full rounded-lg border border-pip-border bg-surface-2 px-3 py-2 text-sm text-pip-text appearance-none focus:outline-none focus:ring-1 focus:ring-accent hover:border-accent"
                      >
                        {MILESTONE_STATUS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </Select>
                    </div>
                    <Button variant="ghost" onClick={() => removeMilestone(index)} className="text-err-text hover:bg-red-900/20 mb-0.5">Remove</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: PM Assignment */}
        {step === 3 && (
          <div className="flex flex-col gap-8">
            <div>
              <label className="block text-sm font-medium text-pip-text mb-1">Assign Project Manager</label>
              <p className="text-xs text-pip-secondary mb-3">Optional. You can assign or reassign a PM later.</p>
              {pmsLoading ? (
                <div className="p-4 text-center text-accent text-sm">Loading PMs...</div>
              ) : (
                <Select
                  value={form.assigned_pm_id}
                  onChange={(e) => setForm((c) => ({ ...c, assigned_pm_id: e.target.value }))}
                  className="w-full rounded-lg border border-pip-border bg-surface-2 px-3 py-2 text-sm text-pip-text appearance-none focus:outline-none focus:ring-1 focus:ring-accent hover:border-accent"
                >
                  <option value="">Leave Unassigned for now</option>
                  {pms.map((pm) => (
                    <option key={pm.id} value={pm.id}>
                      {pm.name ? `${pm.name} (${pm.email})` : pm.email}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <div className="bg-surface-2 border border-pip-border rounded-lg p-4 text-sm text-pip-text">
              Creating project <strong className="text-accent font-semibold">{form.name || 'Unnamed'}</strong> for client <strong className="text-accent font-semibold">{form.client_name || 'Unknown'}</strong>
              {milestones.filter((m) => m.name.trim()).length > 0 && (
                <span className="text-pip-muted"> · {milestones.filter((m) => m.name.trim()).length} milestone{milestones.filter((m) => m.name.trim()).length !== 1 ? 's' : ''}</span>
              )}
              .
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 mt-4 border-t border-pip-border pt-4 pb-4" style={{ padding: '2%' }}>
        <Button variant="secondary" onClick={step === 1 ? handleClose : () => setStep((s) => (s - 1) as Step)}>
          {step === 1 ? 'Cancel' : 'Back'}
        </Button>
        {step < 3 ? (
          <Button variant="primary" onClick={step === 1 ? goToStep2 : () => setStep(3)}>
            Continue
          </Button>
        ) : (
          <Button variant="primary" onClick={handleCreate} disabled={submitting || pmsLoading}>
            {submitting ? 'Creating Project...' : 'Finalize & Create Project'}
          </Button>
        )}
      </div>
    </Modal>
  );
}
