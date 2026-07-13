import { Badge, Button } from '../ui/index.js';
import type { HistorySubmission } from '../../api/pgm.js';
import { formatDate } from '../../utils/date.js';

interface VersionHistoryProps {
  history: HistorySubmission[];
  selectedVersion: HistorySubmission | null;
  setSelectedVersion: (
    version: HistorySubmission | null
  ) => void;
}
export function VersionHistory({
  history,
  selectedVersion,
  setSelectedVersion,
}: VersionHistoryProps) {
  return (
    <section>
                      <h3 className="font-sora font-semibold text-pip-text mb-4 text-sm uppercase tracking-wider">Recent Submissions</h3>
                      <div className="flex flex-col gap-2">
                        {history.length > 0 ? history.map((item) => (
                          <div
                            key={item.id}
                            className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${selectedVersion?.id === item.id ? 'bg-accent/10 border-accent/50' : 'bg-surface-2 border-pip-border hover:bg-surface-3'}`}
                            onClick={() => setSelectedVersion(item)}
                          >
                            <div>
                              <div className="font-medium text-sm text-pip-text flex items-center gap-2">
                                Version {item.version}
                                {selectedVersion?.id === item.id && <Badge variant="active">Viewing</Badge>}
                              </div>
                              <div className="text-xs text-pip-secondary mt-1">By {(item as HistorySubmission).submitted_by_name}</div>
                            </div>
                            <div className="text-xs text-pip-muted">
                              {formatDate(item.created_at)}
                            </div>
                          </div>
                        )) : (
                          <p className="text-pip-muted text-sm italic">No history available.</p>
                        )}
                      </div>
                      {selectedVersion && (
                        <Button variant="secondary" className="w-full mt-4" onClick={() => setSelectedVersion(null)}>
                          Return to Latest
                        </Button>
                      )}
    </section>
  );
}
