import { Button, Select, RAGBadge, type RAGValue } from '../ui/index.js';

const ragFields = [
  ['rag_schedule', 'Schedule'],
  ['rag_budget', 'Budget'],
  ['rag_scope', 'Scope'],
  ['rag_resources', 'Resources'],
  ['rag_timeline', 'Timeline'],
] as const;

interface OverridePanelProps {
  activeSubmission: any;
  detail: any;

  overrideDraft: any;
  setOverrideDraft: React.Dispatch<React.SetStateAction<any>>;

  fieldErrors: Record<string, string>;
  setFieldErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;

  selectedVersion: any;

  validateOverrideField: any;

  saveOverride: () => Promise<void>;
}

export function OverridePanel({
  activeSubmission,
  detail,

  overrideDraft,
  setOverrideDraft,

  fieldErrors,
  setFieldErrors,

  selectedVersion,

  validateOverrideField,

  saveOverride,
}: OverridePanelProps) {
  return (
    <section>
                          <h3 className="font-sora font-semibold text-lg text-pip-text mb-4">Health Dimensions</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                            {ragFields.map(([field, label]) => {
                              const isSelected = overrideDraft.field_name === field;
                              const val = (activeSubmission as any)[field] as RAGValue | undefined;
                              return (
                                <div
                                  key={field}
                                  className={`p-4 rounded-lg border transition-all ${isSelected ? 'bg-accent/5 border-accent' : 'bg-surface-2 border-pip-border hover:bg-surface-3'}`}
                                >
                                  <div
                                    className="flex items-center justify-between cursor-pointer h-10"
                                    onClick={() => {
                                      if (isSelected) {
                                        setOverrideDraft({ ...overrideDraft, field_name: '' });
                                      } else {
                                        setOverrideDraft({ ...overrideDraft, field_name: field, override_value: '', override_reason: '' });
                                      }
                                    }}
                                  >
                                    <span className="block text-sm font-medium text-pip-secondary">{label}</span>
                                    <div className="flex items-center gap-2">
                                      <RAGBadge value={val || null} />
                                      {isSelected ? (
                                        <span className="text-xs text-pip-muted hover:text-pip-accent transition-colors select-none">▼</span>
                                      ) : (
                                        <span className="text-xs text-pip-muted hover:text-pip-accent transition-colors select-none">▶ Edit</span>
                                      )}
                                    </div>
                                  </div>
                                  {isSelected && selectedVersion === null && (
                                    <div className="mt-4 pt-4 border-t border-pip-border/50 flex flex-col gap-3">
                                      <Select
                                        className="w-full"
                                        value={overrideDraft.override_value}
                                        onChange={(e) => {
                                          setOverrideDraft({ ...overrideDraft, override_value: e.target.value });
                                          setFieldErrors((current) => ({ ...current, override_value: '' }));
                                        }}
                                        onBlur={() => validateOverrideField('override_value')}
                                        error={fieldErrors.override_value}
                                      >
                                        <option value="">Select New Status</option>
                                        <option value="green">Green</option>
                                        <option value="amber">Amber</option>
                                        <option value="red">Red</option>
                                      </Select>
                                      <textarea
                                        className="w-full bg-surface-1 border border-pip-border rounded-md px-3 py-2 text-sm text-pip-text focus:outline-none focus:border-accent min-h-[60px]"
                                        placeholder="Override reason / comment..."
                                        value={overrideDraft.override_reason}
                                        onChange={(e) => {
                                          setOverrideDraft({ ...overrideDraft, override_reason: e.target.value });
                                          setFieldErrors((current) => ({ ...current, override_reason: '' }));
                                        }}
                                        onBlur={() => validateOverrideField('override_reason')}
                                      />
                                      {fieldErrors.override_reason && <div className="text-xs text-err-text">{fieldErrors.override_reason}</div>}
                                      <div className="flex justify-end gap-2 mt-1">
                                        <Button variant="ghost" size="sm" onClick={() => setOverrideDraft({ ...overrideDraft, field_name: '' })}>Cancel</Button>
                                        <Button variant="primary" size="sm" onClick={() => void saveOverride()} disabled={!overrideDraft.override_value || overrideDraft.override_value === val}>Update Status</Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {/* Project Health — read-only, auto-calculated */}
                            <div className="p-4 rounded-lg border bg-surface-2 border-pip-border">
                              <div className="flex items-center justify-between h-10">
                                <div>
                                  <span className="block text-sm font-medium text-pip-secondary">Project Health</span>
                                  <span className="block text-xs text-pip-muted mt-0.5">Auto-calculated</span>
                                </div>
                                <RAGBadge value={(detail.rag_project_health as RAGValue) || null} />
                              </div>
                            </div>
                          </div>
                        </section>
  );
}