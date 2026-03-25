interface TelemetrySectionProps {
  focusedChannelLabel: string;
  systemLogSummary: string;
  systemLogDetail: string;
  totalObjectCount: number;
  latestSourceLabel: string;
  latestFrameLabel: string;
}

export function TelemetrySection({
  focusedChannelLabel,
  systemLogSummary,
  systemLogDetail,
  totalObjectCount,
  latestSourceLabel,
  latestFrameLabel,
}: TelemetrySectionProps) {
  return (
    <aside className="ghost-border grid gap-2 rounded-[22px] bg-surface p-2 shadow-sm sm:grid-cols-3 sm:p-2.5">
      <section className="ghost-border relative overflow-hidden rounded-[18px] bg-surface-high p-3">
        <span aria-hidden="true" className="status-pillar bg-primary/80" />
        <div className="pl-3">
          <p className="text-xs text-secondary">시스템 로그 요약</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">{focusedChannelLabel}</p>
          <p className="mt-1.5 text-xs leading-5 text-on-surface">{systemLogSummary}</p>
          <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-on-surface-variant">{systemLogDetail}</p>
        </div>
      </section>

      <section className="ghost-border relative overflow-hidden rounded-[18px] bg-surface-high p-3">
        <span aria-hidden="true" className="status-pillar bg-tertiary/80" />
        <div className="pl-3">
          <p className="text-xs text-secondary">총 감지 객체 수</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-on-surface">
            {totalObjectCount}
          </p>
          <p className="mt-1.5 text-xs leading-5 text-on-surface-variant">
            현재 화면에 집계된 사람 및 장비 추적 객체 수입니다.
          </p>
        </div>
      </section>

      <section className="ghost-border relative overflow-hidden rounded-[18px] bg-surface-high p-3">
        <span aria-hidden="true" className="status-pillar bg-primary-dark/80" />
        <div className="pl-3">
          <p className="text-xs text-secondary">최신 소스 / 프레임</p>
          <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-on-surface">
            {latestSourceLabel}
          </p>
          <p className="mt-1.5 font-mono text-xs tabular-nums text-on-surface-variant">
            {latestFrameLabel}
          </p>
        </div>
      </section>
    </aside>
  );
}
