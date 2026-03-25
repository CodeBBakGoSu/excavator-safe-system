import { useEffect, useId } from 'react';
import { projectWorkerPoint, projectZoneRadius, sortWorkersForDisplay } from '../../../../frontend-state/frontendStateParsing';
import type { FrontendStateSnapshot, FrontendStateWorker } from '../../../../frontend-state/frontendStateTypes';

function getWorkerTone(worker: FrontendStateWorker) {
  if (!worker.connected) return 'border-outline/40 bg-surface text-secondary';
  if (worker.zoneStatus === 'danger') return 'border-error/40 bg-error/10 text-error';
  if (worker.zoneStatus === 'caution') return 'border-tertiary/40 bg-tertiary/10 text-tertiary';
  return 'border-primary/40 bg-primary/10 text-primary';
}

interface FieldStateModalProps {
  open: boolean;
  snapshot: FrontendStateSnapshot | null;
  message: string | null;
  onClose: () => void;
}

export function FieldStateModal({ open, snapshot, message, onClose }: FieldStateModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const workers = sortWorkersForDisplay(snapshot?.workers ?? []);
  const dangerCount = workers.filter((worker) => worker.zoneStatus === 'danger').length;
  const cautionCount = workers.filter((worker) => worker.zoneStatus === 'caution').length;

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 px-4 py-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="ghost-border w-full max-w-6xl rounded-[32px] bg-surface p-5 shadow-xl sm:p-6"
        role="dialog"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm text-secondary">FRONTEND STATE SNAPSHOT</p>
            <h2 className="text-balance text-2xl font-semibold text-on-surface" id={titleId}>
              현장 상태 스냅샷
            </h2>
            <p className="max-w-3xl text-pretty text-sm leading-6 text-on-surface-variant" id={descriptionId}>
              현장 작업자 위치, 경고 반경, 센서 서버 상태를 단일 화면에서 확인합니다.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-outline/40 bg-surface-high px-3 py-2 font-mono text-xs tabular-nums text-on-surface-variant">
              {snapshot?.timestamp ?? '실시간 스냅샷 대기 중'}
            </span>
            <button
              aria-label="현장 상태 닫기"
              className="rounded-2xl border border-outline/40 bg-surface-high px-4 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={onClose}
              type="button"
            >
              닫기
            </button>
          </div>
        </div>

        {message ? (
          <p className="mt-4 rounded-2xl border border-outline/40 bg-surface-high px-4 py-3 text-sm text-on-surface">
            {message}
          </p>
        ) : null}

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <SummaryCard label="센서 서버" value={snapshot ? (snapshot.system.sensorServerOnline ? 'ONLINE' : 'OFFLINE') : 'UNKNOWN'} />
          <SummaryCard label="위험 작업자" value={`위험 작업자 ${dangerCount}명`} />
          <SummaryCard label="주의 작업자" value={`주의 작업자 ${cautionCount}명`} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
          <div className="relative min-h-[360px] overflow-hidden rounded-[28px] border border-outline/30 bg-background">
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
                backgroundSize: '48px 48px',
              }}
            />
            <div aria-hidden="true" className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-tertiary/30" />
            <div aria-hidden="true" className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-tertiary/30" />
            <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
              <div className="size-4 rounded-full border-2 border-tertiary bg-background" />
              <span className="rounded-full border border-outline/40 bg-surface px-3 py-1 text-xs font-medium text-on-surface">
                굴착기 (0, 0)
              </span>
            </div>
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-tertiary/40 bg-tertiary/10"
              style={{
                width: projectZoneRadius(snapshot?.system.zoneRule.cautionDistanceM ?? 5),
                height: projectZoneRadius(snapshot?.system.zoneRule.cautionDistanceM ?? 5),
              }}
            />
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-error/50 bg-error/10"
              style={{
                width: projectZoneRadius(snapshot?.system.zoneRule.dangerDistanceM ?? 3),
                height: projectZoneRadius(snapshot?.system.zoneRule.dangerDistanceM ?? 3),
              }}
            />

            {workers.map((worker) => (
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2"
                key={worker.tagId}
                style={projectWorkerPoint(worker)}
              >
                <div className="flex flex-col items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getWorkerTone(worker)}`}>
                    {worker.name}
                  </span>
                  <span className="size-4 rounded-full border-2 border-background bg-primary" />
                </div>
              </div>
            ))}

            {workers.length === 0 ? (
              <div className="absolute inset-x-6 bottom-6 rounded-2xl border border-outline/40 bg-surface px-4 py-3 text-center text-sm text-on-surface-variant">
                아직 수신된 작업자 위치 데이터가 없습니다.
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            {workers.length > 0 ? (
              workers.map((worker) => (
                <div
                  className={`rounded-[24px] border px-4 py-4 ${getWorkerTone(worker)}`}
                  key={worker.tagId}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-on-surface">{worker.name}</p>
                      <p className="mt-1 text-sm text-on-surface-variant">
                        {worker.connected ? '센서 연결 유지' : '연결 신호 없음'}
                      </p>
                    </div>
                    <span className="font-mono text-xs font-medium tabular-nums text-on-surface-variant">
                      TAG {worker.tagId}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium">
                    <span className="rounded-full border border-outline/40 bg-surface px-3 py-1 font-mono tabular-nums text-on-surface-variant">
                      {worker.zoneStatus.toUpperCase()}
                    </span>
                    <span className="rounded-full border border-outline/40 bg-surface px-3 py-1 font-mono tabular-nums text-on-surface-variant">
                      {worker.distanceM.toFixed(2)}m
                    </span>
                    <span className="rounded-full border border-outline/40 bg-surface px-3 py-1 text-on-surface-variant">
                      마지막 갱신 {worker.lastUpdate}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-outline/40 bg-surface-high px-4 py-5 text-sm leading-6 text-on-surface-variant">
                브릿지 WebSocket이 아직 연결되지 않았거나 스냅샷이 오지 않았습니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-outline/30 bg-surface-high px-4 py-4">
      <p className="text-sm text-secondary">{label}</p>
      <p className="mt-2 text-lg font-semibold text-on-surface">{value}</p>
    </div>
  );
}
