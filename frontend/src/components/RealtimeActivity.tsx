import type { DashboardEvent } from '../realtime/dashboardSocket.js';

interface RealtimeActivityProps {
  connected: boolean;
  events: DashboardEvent[];
}

export function RealtimeActivity({ connected, events }: RealtimeActivityProps) {
  return (
    <section className="max-w-[1120px] mx-auto px-6 mt-8">
      <div className="bg-surface-1 border border-pip-border rounded-card p-5">
        <div className="flex justify-between items-center gap-4">
          <h2 className="text-pip-text font-sora font-semibold text-lg">Realtime Updates</h2>
          <span
            aria-label={connected ? 'Socket connected' : 'Socket disconnected'}
            className={`font-bold text-sm ${connected ? 'text-rag-green-text' : 'text-rag-red-text'}`}
          >
            {connected ? (
              <>
                <span className="mr-1">●</span>
                <span>Live</span>
              </>
            ) : (
              <>
                <span className="mr-1">○</span>
                <span>Connecting</span>
              </>
            )}
          </span>
        </div>

        {events.length === 0 ? (
          <p className="text-pip-secondary text-sm mt-4">Waiting for published projects and overrides.</p>
        ) : (
          <ul className="list-none mt-4 p-0 grid gap-3">
            {events.map((event, index) => (
              <li
                key={`${event.type}-${event.receivedAt}-${index}`}
                className="border border-pip-border rounded-md p-4 bg-surface-2"
              >
                <div className="font-bold text-pip-text">{event.title}</div>
                <div className="text-pip-secondary text-sm mt-1">{event.detail}</div>
                <div className="text-pip-muted text-xs mt-2">{event.receivedAt}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
