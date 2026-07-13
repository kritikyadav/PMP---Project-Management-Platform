import { Button, Input, Select } from '../ui/index.js';
import { OverridePanel } from './OverridePanel.js';
import { MilestoneEditPanel } from './MilestoneEditPanel.tsx';
import { VersionHistory } from './VersionHistory.tsx';

interface ProjectDetailProps {
  activeSubmission: any;
  detail: any;
  setDetail: any;

  overrideDraft: any;
  setOverrideDraft: any;

  fieldErrors: any;
  setFieldErrors: any;

  selectedVersion: any;
  validateOverrideField: any;
  saveOverride: any;

  localStakeholders: any[];

  addStakeholder: any;
  removeStakeholder: any;
  updateStakeholder: any;
  moveStakeholder: any;
  handleStakeholdersBlur: any;

  handleMetadataBlur: any;

  localMilestones: any[];
  setLocalMilestones: any;
  milestonesSaving: boolean;
  handleMilestonesSave: any;

  history: any[];
  setSelectedVersion: any;

  formatDateRange: any;
}

export function ProjectDetailPanel({
  activeSubmission,
  detail,
  setDetail,
  overrideDraft,
  setOverrideDraft,
  fieldErrors,
  setFieldErrors,
  selectedVersion,
  validateOverrideField,
  saveOverride,
  localStakeholders,
  addStakeholder,
  removeStakeholder,
  updateStakeholder,
  moveStakeholder,
  handleStakeholdersBlur,
  handleMetadataBlur,
  localMilestones,
  setLocalMilestones,
  milestonesSaving,
  handleMilestonesSave,
  history,
  setSelectedVersion,
  formatDateRange,
}: ProjectDetailProps) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
                        {/* Left Column: Intelligence */}
                        <div className="lg:col-span-2 flex flex-col gap-8">
                          {activeSubmission?.id ? (
                            <>
                              <section className="bg-surface-2 p-5 rounded-lg border border-pip-border">
                                <h3 className="font-sora font-semibold text-lg text-pip-text mb-4">Project Charter</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <div className="text-xs text-pip-muted mb-1 uppercase tracking-wider">Sprint</div>
                                    <div className="font-medium text-pip-text">{activeSubmission.sprint_name || 'N/A'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-pip-muted mb-1 uppercase tracking-wider">Sprint Dates</div>
                                    <div className="font-medium text-pip-text">
                                      {formatDateRange(activeSubmission.sprint_start_date, activeSubmission.sprint_end_date)}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-pip-muted mb-1 uppercase tracking-wider">Team Size</div>
                                    <div className="font-medium text-pip-text">{activeSubmission.tech_team_size ?? 'N/A'}</div>
                                  </div>
                                </div>
                              </section>
      
                              <OverridePanel
                                activeSubmission={activeSubmission}
                                detail={detail}
                                overrideDraft={overrideDraft}
                                setOverrideDraft={setOverrideDraft}
                                fieldErrors={fieldErrors}
                                setFieldErrors={setFieldErrors}
                                selectedVersion={selectedVersion}
                                validateOverrideField={validateOverrideField}
                                saveOverride={saveOverride}
                              />
      
                              {/* Metadata section */}
                              <section className="bg-surface-2 p-5 rounded-lg border border-pip-border">
                                <h3 className="font-sora font-semibold text-lg text-pip-text mb-4">Project Metadata</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <label className="text-xs text-pip-muted mb-1 block uppercase tracking-wider">Engagement Type</label>
                                    <Select
                                      className="w-full"
                                      value={detail.engagement_type ?? ''}
                                      onChange={(e) => {
                                        const val = e.target.value || null;
                                        setDetail({ ...detail, engagement_type: val });
                                        void handleMetadataBlur('engagement_type', val);
                                      }}
                                    >
                                      <option value="">Not set</option>
                                      <option value="Fixed Cost">Fixed Cost</option>
                                      <option value="T&M">T&M</option>
                                      <option value="Hybrid">Hybrid</option>
                                    </Select>
                                  </div>
                                  <div>
                                    <label className="text-xs text-pip-muted mb-1 block uppercase tracking-wider">Methodology</label>
                                    <Select
                                      className="w-full"
                                      value={detail.methodology ?? ''}
                                      onChange={(e) => {
                                        const val = e.target.value || null;
                                        setDetail({ ...detail, methodology: val });
                                        void handleMetadataBlur('methodology', val);
                                      }}
                                    >
                                      <option value="">Not set</option>
                                      <option value="Agile">Agile</option>
                                      <option value="Waterfall">Waterfall</option>
                                    </Select>
                                  </div>
                                </div>
                              </section>
      
                              {/* Stakeholders section */}
                              <section>
                                <div className="flex items-center justify-between mb-4">
                                  <h3 className="font-sora font-semibold text-lg text-pip-text">Stakeholders</h3>
                                  <Button variant="secondary" size="sm" onClick={addStakeholder}>+ Add</Button>
                                </div>
                                {localStakeholders.length === 0 ? (
                                  <div className="text-sm text-pip-muted italic bg-surface-2 border border-dashed border-pip-border rounded-lg p-4">
                                    No stakeholders added yet.
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-3">
                                    {localStakeholders.map((s, index) => (
                                      <div key={s.id} className="bg-surface-2 border border-pip-border rounded-lg p-3 flex flex-col gap-2">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-xs text-pip-muted font-medium">Stakeholder {index + 1}</span>
                                          <div className="flex gap-1">
                                            <button
                                              className="text-xs text-pip-muted hover:text-pip-text px-1 py-0.5 rounded hover:bg-surface-3 transition-colors disabled:opacity-30"
                                              onClick={() => moveStakeholder(index, 'up')}
                                              disabled={index === 0}
                                              title="Move up"
                                            >↑</button>
                                            <button
                                              className="text-xs text-pip-muted hover:text-pip-text px-1 py-0.5 rounded hover:bg-surface-3 transition-colors disabled:opacity-30"
                                              onClick={() => moveStakeholder(index, 'down')}
                                              disabled={index === localStakeholders.length - 1}
                                              title="Move down"
                                            >↓</button>
                                            <button
                                              className="text-xs text-pip-muted hover:text-red-400 px-1 py-0.5 rounded hover:bg-surface-3 transition-colors"
                                              onClick={() => removeStakeholder(s.id)}
                                              title="Remove"
                                            >✕</button>
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                          <Input
                                            placeholder="Name *"
                                            value={s.name}
                                            onChange={(e) => updateStakeholder(s.id, 'name', e.target.value)}
                                            onBlur={() => void handleStakeholdersBlur()}
                                            className="w-full text-sm"
                                          />
                                          <Input
                                            placeholder="Contact No."
                                            value={s.contact_no}
                                            onChange={(e) => updateStakeholder(s.id, 'contact_no', e.target.value)}
                                            onBlur={() => void handleStakeholdersBlur()}
                                            className="w-full text-sm"
                                          />
                                          <Input
                                            placeholder="Email"
                                            value={s.email}
                                            onChange={(e) => updateStakeholder(s.id, 'email', e.target.value)}
                                            onBlur={() => void handleStakeholdersBlur()}
                                            className="w-full text-sm"
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </section>
      
                              {/* PgM editable milestones — always editable, even on published submissions */}
                              <MilestoneEditPanel
                                localMilestones={localMilestones}
                                setLocalMilestones={setLocalMilestones}
                                milestonesSaving={milestonesSaving}
                                detail={detail}
                                handleMilestonesSave={handleMilestonesSave}
                              />
      
                              <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-surface-2 p-5 rounded-lg border border-pip-border">
                                  <h3 className="font-semibold text-pip-text mb-2 text-sm">Project Overview</h3>
                                  <div className="text-sm text-pip-secondary prose prose-invert prose-sm" dangerouslySetInnerHTML={{ __html: activeSubmission.overview || 'No overview provided.' }} />
                                </div>
                                <div className="bg-surface-2 p-5 rounded-lg border border-pip-border">
                                  <h3 className="font-semibold text-pip-text mb-2 text-sm">Upcoming Priorities</h3>
                                  <div className="text-sm text-pip-secondary prose prose-invert prose-sm" dangerouslySetInnerHTML={{ __html: activeSubmission.upcoming_deliverables || 'No priorities listed.' }} />
                                </div>
                                <div className="bg-surface-2 p-5 rounded-lg border border-pip-border">
                                  <h3 className="font-semibold text-pip-text mb-2 text-sm">Business & Coordination</h3>
                                  <div className="text-sm text-pip-secondary prose prose-invert prose-sm" dangerouslySetInnerHTML={{ __html: activeSubmission.business_coordination || 'No updates.' }} />
                                </div>
                                <div className="bg-surface-2 p-5 rounded-lg border border-pip-border">
                                  <h3 className="font-semibold text-pip-text mb-2 text-sm">Development & UAT</h3>
                                  <div className="text-sm text-pip-secondary prose prose-invert prose-sm" dangerouslySetInnerHTML={{ __html: activeSubmission.development_uat || 'No updates.' }} />
                                </div>
                              </section>
                            </>
                          ) : (
                            <>
                              {/* Metadata even without submission */}
                              <section className="bg-surface-2 p-5 rounded-lg border border-pip-border">
                                <h3 className="font-sora font-semibold text-lg text-pip-text mb-4">Project Metadata</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <label className="text-xs text-pip-muted mb-1 block uppercase tracking-wider">Engagement Type</label>
                                    <Select
                                      className="w-full"
                                      value={detail.engagement_type ?? ''}
                                      onChange={(e) => {
                                        const val = e.target.value || null;
                                        setDetail({ ...detail, engagement_type: val });
                                        void handleMetadataBlur('engagement_type', val);
                                      }}
                                    >
                                      <option value="">Not set</option>
                                      <option value="Fixed Cost">Fixed Cost</option>
                                      <option value="T&M">T&M</option>
                                      <option value="Hybrid">Hybrid</option>
                                    </Select>
                                  </div>
                                  <div>
                                    <label className="text-xs text-pip-muted mb-1 block uppercase tracking-wider">Methodology</label>
                                    <Select
                                      className="w-full"
                                      value={detail.methodology ?? ''}
                                      onChange={(e) => {
                                        const val = e.target.value || null;
                                        setDetail({ ...detail, methodology: val });
                                        void handleMetadataBlur('methodology', val);
                                      }}
                                    >
                                      <option value="">Not set</option>
                                      <option value="Agile">Agile</option>
                                      <option value="Waterfall">Waterfall</option>
                                    </Select>
                                  </div>
                                </div>
                              </section>
      
                              {/* Stakeholders even without submission */}
                              <section>
                                <div className="flex items-center justify-between mb-4">
                                  <h3 className="font-sora font-semibold text-lg text-pip-text">Stakeholders</h3>
                                  <Button variant="secondary" size="sm" onClick={addStakeholder}>+ Add</Button>
                                </div>
                                {localStakeholders.length === 0 ? (
                                  <div className="text-sm text-pip-muted italic bg-surface-2 border border-dashed border-pip-border rounded-lg p-4">
                                    No stakeholders added yet.
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-3">
                                    {localStakeholders.map((s, index) => (
                                      <div key={s.id} className="bg-surface-2 border border-pip-border rounded-lg p-3 flex flex-col gap-2">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-xs text-pip-muted font-medium">Stakeholder {index + 1}</span>
                                          <div className="flex gap-1">
                                            <button
                                              className="text-xs text-pip-muted hover:text-pip-text px-1 py-0.5 rounded hover:bg-surface-3 transition-colors disabled:opacity-30"
                                              onClick={() => moveStakeholder(index, 'up')}
                                              disabled={index === 0}
                                              title="Move up"
                                            >↑</button>
                                            <button
                                              className="text-xs text-pip-muted hover:text-pip-text px-1 py-0.5 rounded hover:bg-surface-3 transition-colors disabled:opacity-30"
                                              onClick={() => moveStakeholder(index, 'down')}
                                              disabled={index === localStakeholders.length - 1}
                                              title="Move down"
                                            >↓</button>
                                            <button
                                              className="text-xs text-pip-muted hover:text-red-400 px-1 py-0.5 rounded hover:bg-surface-3 transition-colors"
                                              onClick={() => removeStakeholder(s.id)}
                                              title="Remove"
                                            >✕</button>
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                          <Input
                                            placeholder="Name *"
                                            value={s.name}
                                            onChange={(e) => updateStakeholder(s.id, 'name', e.target.value)}
                                            onBlur={() => void handleStakeholdersBlur()}
                                            className="w-full text-sm"
                                          />
                                          <Input
                                            placeholder="Contact No."
                                            value={s.contact_no}
                                            onChange={(e) => updateStakeholder(s.id, 'contact_no', e.target.value)}
                                            onBlur={() => void handleStakeholdersBlur()}
                                            className="w-full text-sm"
                                          />
                                          <Input
                                            placeholder="Email"
                                            value={s.email}
                                            onChange={(e) => updateStakeholder(s.id, 'email', e.target.value)}
                                            onBlur={() => void handleStakeholdersBlur()}
                                            className="w-full text-sm"
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </section>
      
                              <div className="flex flex-col items-center justify-center py-20 text-center px-4 bg-surface-2 rounded-xl border border-pip-border border-dashed">
                                <div className="w-16 h-16 rounded-full bg-surface-3 flex items-center justify-center mb-4 text-pip-muted">
                                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                </div>
                                <h3 className="font-sora font-semibold text-lg text-pip-text mb-2">Pending Report</h3>
                                <p className="text-pip-secondary max-w-sm">The Project Manager has not published any data for this project in the current period.</p>
                              </div>
                            </>
                          )}
                        </div>
      
                        {/* Right Column: Action Panel */}
                        <div className="flex flex-col gap-8">
                          <VersionHistory
                            history={history}
                            selectedVersion={selectedVersion}
                            setSelectedVersion={setSelectedVersion}
                        />
                        </div>
                      </div>
    </>
  );
}