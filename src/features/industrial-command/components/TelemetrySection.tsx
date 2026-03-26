import type { EventFeedItem } from '../runtime/useIndustrialMonitorRuntime';

interface TelemetrySectionProps {
  eventFeed: EventFeedItem[];
}

function toneClassName(alertTier: EventFeedItem['alertTier']) {
  return alertTier === 'risk'
    ? 'border-error/40 bg-error/10 text-error'
    : 'border-tertiary/40 bg-tertiary/10 text-tertiary';
}

export function TelemetrySection({ eventFeed }: TelemetrySectionProps) {
  const pinnedEvents = eventFeed.slice(0, 3);
  const scrollableEvents = eventFeed.slice(3);

  return (
    <aside className="ghost-border min-h-0 rounded-[22px] bg-surface p-2 shadow-sm sm:p-2.5 lg:max-h-[min(36vh,28rem)]">
      <section className="ghost-border flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] bg-surface-high p-3">
        <div className="flex items-start justify-between gap-3 border-b border-outline/20 pb-3">
          <div>
            <p className="text-xs text-secondary">감지 이벤트</p>
            <h2 className="mt-1 text-base font-semibold text-on-surface">실시간 이벤트 피드</h2>
          </div>
          <span className="rounded-full border border-outline/40 bg-surface px-3 py-1 font-mono text-xs text-on-surface-variant">
            {eventFeed.length}건
          </span>
        </div>

        {eventFeed.length > 0 ? (
          <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
            <ul className="space-y-3" data-testid="event-feed-pinned">
              {pinnedEvents.map((event) => (
                <li className="rounded-[18px] border border-outline/30 bg-background px-4 py-4" key={event.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-outline/40 bg-surface-high px-3 py-1 font-mono text-xs font-semibold text-secondary">
                        {event.channelLabel}
                      </span>
                      <span className={`rounded-full border px-3 py-1 font-mono text-xs font-semibold ${toneClassName(event.alertTier)}`}>
                        {event.alertTier === 'risk' ? 'RISK' : 'CAUTION'}
                      </span>
                    </div>
                    <span className="font-mono text-xs tabular-nums text-on-surface-variant">{event.timestamp}</span>
                  </div>

                  <p className="mt-3 text-sm font-semibold text-on-surface">{event.summary}</p>

                  <div className="mt-3 grid gap-2 text-xs text-on-surface-variant sm:grid-cols-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-secondary">카메라</p>
                      <p className="mt-1 text-sm text-on-surface">{event.channelTitle}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-secondary">프레임</p>
                      <p className="mt-1 font-mono text-sm text-on-surface">FRAME {event.frameIndex ?? '--'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-secondary">객체 수</p>
                      <p className="mt-1 font-mono text-sm text-on-surface">{event.objectCount}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-secondary">소스</p>
                      <p className="mt-1 font-mono text-sm text-on-surface">{event.sourceId || '-'}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1" data-testid="event-feed-list">
              {scrollableEvents.map((event) => (
              <li className="rounded-[18px] border border-outline/30 bg-background px-4 py-4" key={event.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-outline/40 bg-surface-high px-3 py-1 font-mono text-xs font-semibold text-secondary">
                      {event.channelLabel}
                    </span>
                    <span className={`rounded-full border px-3 py-1 font-mono text-xs font-semibold ${toneClassName(event.alertTier)}`}>
                      {event.alertTier === 'risk' ? 'RISK' : 'CAUTION'}
                    </span>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-on-surface-variant">{event.timestamp}</span>
                </div>

                <p className="mt-3 text-sm font-semibold text-on-surface">{event.summary}</p>

                <div className="mt-3 grid gap-2 text-xs text-on-surface-variant sm:grid-cols-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-secondary">카메라</p>
                    <p className="mt-1 text-sm text-on-surface">{event.channelTitle}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-secondary">프레임</p>
                    <p className="mt-1 font-mono text-sm text-on-surface">FRAME {event.frameIndex ?? '--'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-secondary">객체 수</p>
                    <p className="mt-1 font-mono text-sm text-on-surface">{event.objectCount}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-secondary">소스</p>
                    <p className="mt-1 font-mono text-sm text-on-surface">{event.sourceId || '-'}</p>
                  </div>
                </div>
              </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-4 rounded-[18px] border border-dashed border-outline/40 bg-background px-4 py-6 text-sm leading-6 text-on-surface-variant">
            아직 감지된 이벤트가 없습니다.
          </div>
        )}
      </section>
    </aside>
  );
}
