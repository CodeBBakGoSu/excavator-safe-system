import { useEffect, useId } from 'react';
import type { LogStreamType, StreamLogEntry } from '../runtime/useIndustrialMonitorRuntime';

interface LogsModalProps {
  open: boolean;
  cctvLogs: StreamLogEntry[];
  sensorLogs: StreamLogEntry[];
  logActionMessage: string | null;
  savingLogType: LogStreamType | null;
  onClose: () => void;
  saveLogsToServer: (type: LogStreamType) => Promise<void>;
}

export function LogsModal({
  open,
  cctvLogs,
  sensorLogs,
  logActionMessage,
  savingLogType,
  onClose,
  saveLogsToServer,
}: LogsModalProps) {
  const titleId = useId();
  const descriptionId = useId();

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
        className="ghost-border flex h-[min(90vh,920px)] w-full max-w-6xl flex-col rounded-[32px] bg-surface p-5 shadow-xl sm:p-6"
        role="dialog"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm text-secondary">LOG VIEWER</p>
            <h2 className="text-balance text-2xl font-semibold text-on-surface" id={titleId}>
              로그 뷰어
            </h2>
            <p className="max-w-3xl text-pretty text-sm leading-6 text-on-surface-variant" id={descriptionId}>
              CCTV 프레임 수신 로그와 센서 스냅샷 로그를 함께 확인하고 저장합니다.
            </p>
          </div>
          <button
            aria-label="로그 닫기"
            className="rounded-2xl border border-outline/40 bg-surface-high px-4 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={onClose}
            type="button"
          >
            닫기
          </button>
        </div>

        {logActionMessage ? (
          <p className="mt-4 rounded-2xl border border-outline/40 bg-surface-high px-4 py-3 text-sm text-on-surface">
            {logActionMessage}
          </p>
        ) : null}

        <div className="mt-6 grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
          <LogSection
            entries={cctvLogs}
            onSave={() => saveLogsToServer('cctv')}
            saveLabel={savingLogType === 'cctv' ? 'CCTV 로그 저장 중...' : 'CCTV 로그 저장'}
            saving={savingLogType === 'cctv'}
            title="CCTV 로그"
          />
          <LogSection
            entries={sensorLogs}
            onSave={() => saveLogsToServer('sensor')}
            saveLabel={savingLogType === 'sensor' ? '센서 로그 저장 중...' : '센서 로그 저장'}
            saving={savingLogType === 'sensor'}
            title="센서 로그"
          />
        </div>
      </div>
    </div>
  );
}

function LogSection({
  title,
  entries,
  saveLabel,
  saving,
  onSave,
}: {
  title: string;
  entries: StreamLogEntry[];
  saveLabel: string;
  saving: boolean;
  onSave: () => Promise<void>;
}) {
  return (
    <section className="flex min-h-0 flex-col rounded-[28px] border border-outline/30 bg-surface-high px-4 py-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-3 bg-surface-high pb-3" data-testid={title === 'CCTV 로그' ? 'cctv-log-header' : 'sensor-log-header'}>
        <div>
          <h3 className="text-lg font-semibold text-on-surface">{title}</h3>
          <p className="mt-1 text-sm text-on-surface-variant">{entries.length}개의 로그 항목</p>
        </div>
        <button
          className="rounded-2xl border border-outline/40 bg-surface px-4 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={entries.length === 0 || saving}
          onClick={() => {
            void onSave();
          }}
          type="button"
        >
          {saveLabel}
        </button>
      </div>

      {entries.length > 0 ? (
        <ul
          className="mt-1 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
          data-testid={title === 'CCTV 로그' ? 'cctv-log-list' : 'sensor-log-list'}
        >
          {entries.map((entry) => (
            <li className="rounded-[22px] border border-outline/30 bg-background px-4 py-4" key={entry.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-on-surface">{entry.summary}</p>
                <span className="font-mono text-xs tabular-nums text-on-surface-variant">{entry.timestamp}</span>
              </div>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-sm leading-6 text-on-surface-variant">
                {entry.detail}
              </pre>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 rounded-[22px] border border-dashed border-outline/40 bg-background px-4 py-6 text-sm leading-6 text-on-surface-variant">
          아직 표시할 로그가 없습니다.
        </div>
      )}
    </section>
  );
}
