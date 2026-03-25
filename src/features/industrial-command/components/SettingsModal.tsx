import { useEffect, useId, useState } from 'react';

function parseDurationDraft(value: string) {
  const parsedValue = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) return null;
  return parsedValue;
}

interface SettingsModalProps {
  open: boolean;
  wsDraft: string;
  sensorBridgeDraft: string;
  rtspUrlDraft: string;
  rtspStreamStatus: 'idle' | 'starting' | 'running' | 'stopped' | 'failed';
  rtspStreamMessage: string | null;
  bboxVisible: boolean;
  overlayDisplayMode: 'always' | 'alert' | 'risk';
  popupDurationMs: number;
  sensorPopupDurationMs: number;
  configMessage: string | null;
  sensorSettingsMessage: string | null;
  onClose: () => void;
  updateWsDraft: (value: string) => void;
  updateSensorBridgeDraft: (value: string) => void;
  updateRtspUrlDraft: (value: string) => void;
  updateBboxVisible: (value: boolean) => void;
  updateOverlayDisplayMode: (value: 'always' | 'alert' | 'risk') => void;
  setPopupDurationMs: (value: number) => void;
  setSensorPopupDurationMs: (value: number) => void;
  applyWsUrl: () => void;
  applySensorBridgeUrl: () => void;
  applyRtspUrl: () => void;
  startRtspStream: () => Promise<void>;
  stopRtspStream: () => Promise<void>;
}

export function SettingsModal({
  open,
  wsDraft,
  sensorBridgeDraft,
  rtspUrlDraft,
  rtspStreamStatus,
  rtspStreamMessage,
  bboxVisible,
  overlayDisplayMode,
  popupDurationMs,
  sensorPopupDurationMs,
  configMessage,
  sensorSettingsMessage,
  onClose,
  updateWsDraft,
  updateSensorBridgeDraft,
  updateRtspUrlDraft,
  updateBboxVisible,
  updateOverlayDisplayMode,
  setPopupDurationMs,
  setSensorPopupDurationMs,
  applyWsUrl,
  applySensorBridgeUrl,
  applyRtspUrl,
  startRtspStream,
  stopRtspStream,
}: SettingsModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [hazardDurationDraft, setHazardDurationDraft] = useState(String(popupDurationMs));
  const [fieldStateDurationDraft, setFieldStateDurationDraft] = useState(String(sensorPopupDurationMs));
  const [durationError, setDurationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setHazardDurationDraft(String(popupDurationMs));
    setFieldStateDurationDraft(String(sensorPopupDurationMs));
    setDurationError(null);
  }, [open, popupDurationMs, sensorPopupDurationMs]);

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
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 px-4 py-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="ghost-border w-full max-w-3xl rounded-[32px] bg-surface p-5 shadow-xl sm:p-6"
        role="dialog"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm text-secondary">SYSTEM SETTINGS</p>
            <h2 className="text-balance text-2xl font-semibold text-on-surface" id={titleId}>
              설정
            </h2>
            <p className="max-w-2xl text-pretty text-sm leading-6 text-on-surface-variant" id={descriptionId}>
              저장된 CCTV 및 센서 브리지 주소를 관리하고, 위험 팝업과 현장 상태 팝업 유지 시간을 조정합니다.
            </p>
          </div>
          <button
            aria-label="설정 닫기"
            className="rounded-2xl border border-outline/40 bg-surface-high px-4 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={onClose}
            type="button"
          >
            닫기
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-on-surface">CCTV WebSocket URL</span>
            <input
              className="w-full rounded-2xl border border-outline/40 bg-background px-4 py-3 text-sm text-on-surface outline-none transition-colors placeholder:text-secondary focus:border-primary focus:ring-2 focus:ring-primary/30"
              onChange={(event) => updateWsDraft(event.target.value)}
              placeholder="ws://host:port/path"
              spellCheck={false}
              type="text"
              value={wsDraft}
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-on-surface">Sensor Bridge WebSocket URL</span>
            <input
              className="w-full rounded-2xl border border-outline/40 bg-background px-4 py-3 text-sm text-on-surface outline-none transition-colors placeholder:text-secondary focus:border-primary focus:ring-2 focus:ring-primary/30"
              onChange={(event) => updateSensorBridgeDraft(event.target.value)}
              placeholder="ws://localhost:8787"
              spellCheck={false}
              type="text"
              value={sensorBridgeDraft}
            />
          </label>

          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-medium text-on-surface">RTSP URL</span>
            <input
              className="w-full rounded-2xl border border-outline/40 bg-background px-4 py-3 text-sm text-on-surface outline-none transition-colors placeholder:text-secondary focus:border-primary focus:ring-2 focus:ring-primary/30"
              onChange={(event) => updateRtspUrlDraft(event.target.value)}
              placeholder="rtsp://user:pass@host:554/stream"
              spellCheck={false}
              type="text"
              value={rtspUrlDraft}
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-on-surface">BBOX 표시 여부</span>
            <select
              className="w-full rounded-2xl border border-outline/40 bg-background px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
              onChange={(event) => updateBboxVisible(event.target.value === 'true')}
              value={String(bboxVisible)}
            >
              <option value="true">표시</option>
              <option value="false">숨김</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-on-surface">박스 표시 조건</span>
            <select
              className="w-full rounded-2xl border border-outline/40 bg-background px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
              onChange={(event) => updateOverlayDisplayMode(event.target.value as 'always' | 'alert' | 'risk')}
              value={overlayDisplayMode}
            >
              <option value="always">항상</option>
              <option value="alert">경고/위험일 때</option>
              <option value="risk">위험일 때만</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-on-surface">위험 팝업 시간(ms)</span>
            <input
              className="w-full rounded-2xl border border-outline/40 bg-background px-4 py-3 text-sm text-on-surface outline-none transition-colors placeholder:text-secondary focus:border-primary focus:ring-2 focus:ring-primary/30"
              min={0}
              onChange={(event) => setHazardDurationDraft(event.target.value)}
              step={100}
              type="number"
              value={hazardDurationDraft}
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-on-surface">현장 상태 팝업 시간(ms)</span>
            <input
              className="w-full rounded-2xl border border-outline/40 bg-background px-4 py-3 text-sm text-on-surface outline-none transition-colors placeholder:text-secondary focus:border-primary focus:ring-2 focus:ring-primary/30"
              min={0}
              onChange={(event) => setFieldStateDurationDraft(event.target.value)}
              step={100}
              type="number"
              value={fieldStateDurationDraft}
            />
          </label>
        </div>

        <div className="mt-4 grid gap-3">
          {configMessage ? (
            <p aria-live="polite" className="rounded-2xl border border-outline/40 bg-surface-high px-4 py-3 text-sm text-on-surface">
              {configMessage}
            </p>
          ) : null}
          {sensorSettingsMessage ? (
            <p aria-live="polite" className="rounded-2xl border border-outline/40 bg-surface-high px-4 py-3 text-sm text-on-surface">
              {sensorSettingsMessage}
            </p>
          ) : null}
          {rtspStreamMessage ? (
            <p aria-live="polite" className="rounded-2xl border border-outline/40 bg-surface-high px-4 py-3 text-sm text-on-surface">
              {rtspStreamMessage}
            </p>
          ) : null}
          {durationError ? (
            <p aria-live="polite" className="rounded-2xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
              {durationError}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <span className="rounded-full border border-outline/40 bg-surface-high px-3 py-2 font-mono text-xs tabular-nums text-on-surface-variant">
            RTSP {rtspStreamStatus.toUpperCase()}
          </span>
          <button
            className="rounded-2xl border border-outline/40 bg-surface-high px-5 py-3 text-sm font-medium text-on-surface transition-colors hover:bg-surface-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => {
              applyRtspUrl();
              void startRtspStream();
            }}
            type="button"
          >
            RTSP 시작
          </button>
          <button
            className="rounded-2xl border border-outline/40 bg-surface-high px-5 py-3 text-sm font-medium text-on-surface transition-colors hover:bg-surface-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => {
              void stopRtspStream();
            }}
            type="button"
          >
            RTSP 중지
          </button>
          <button
            className="rounded-2xl border border-outline/40 bg-surface-high px-5 py-3 text-sm font-medium text-on-surface transition-colors hover:bg-surface-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={onClose}
            type="button"
          >
            취소
          </button>
          <button
            className="machined-btn rounded-2xl border border-primary px-5 py-3 text-sm font-medium text-on-primary transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => {
              const nextHazardDuration = parseDurationDraft(hazardDurationDraft);
              const nextFieldStateDuration = parseDurationDraft(fieldStateDurationDraft);

              if (nextHazardDuration == null || nextFieldStateDuration == null) {
                setDurationError('팝업 시간은 0 이상의 정수(ms)로 입력해주세요.');
                return;
              }

              setDurationError(null);
              setPopupDurationMs(nextHazardDuration);
              setSensorPopupDurationMs(nextFieldStateDuration);
              applyWsUrl();
              applySensorBridgeUrl();
              applyRtspUrl();
            }}
            type="button"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}
