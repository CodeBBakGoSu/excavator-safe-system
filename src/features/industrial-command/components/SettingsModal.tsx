import { useEffect, useId, useState } from 'react';

function toSecondsDraft(valueMs: number) {
  const seconds = valueMs / 1000;
  return Number.isInteger(seconds) ? String(seconds) : String(seconds);
}

function parseSecondsDraft(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsedValue = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) return null;
  return Math.round(parsedValue * 1000);
}

interface SettingsModalProps {
  open: boolean;
  wsDraft: string;
  sensorBridgeDraft: string;
  rtspControlDraft: string;
  rtspUrlDraft: string;
  rtspStreamStatus: 'idle' | 'starting' | 'running' | 'stopped' | 'failed';
  rtspStreamMessage: string | null;
  cameraDisplayCount: 2 | 4;
  bboxVisible: boolean;
  overlayDisplayMode: 'always' | 'alert' | 'risk';
  hazardPopupDebounceMode: 'recent_three_frames_two_risks' | 'consecutive_two_risks';
  tag3DangerPopupOnly: boolean;
  popupDurationMs: number;
  sensorPopupDurationMs: number;
  configMessage: string | null;
  sensorSettingsMessage: string | null;
  telegramSettingsMessage: string | null;
  telegramBotTokenConfigured: boolean;
  telegramBotTokenMasked: string;
  telegramBotTokenDraft: string;
  telegramKnownChats: Array<{
    id: string;
    type: string;
    title: string;
    selected: boolean;
  }>;
  telegramAutoSync: boolean;
  telegramSensorCooldownDraft: string;
  telegramSyncingChats: boolean;
  telegramSavingSettings: boolean;
  onClose: () => void;
  updateWsDraft: (value: string) => void;
  updateSensorBridgeDraft: (value: string) => void;
  updateRtspControlDraft: (value: string) => void;
  updateRtspUrlDraft: (value: string) => void;
  updateCameraDisplayCount: (value: 2 | 4) => void;
  updateTelegramBotTokenDraft: (value: string) => void;
  updateTelegramChatSelection: (chatId: string, selected: boolean) => void;
  updateTelegramAutoSync: (value: boolean) => void;
  updateTelegramSensorCooldownDraft: (value: string) => void;
  updateBboxVisible: (value: boolean) => void;
  updateOverlayDisplayMode: (value: 'always' | 'alert' | 'risk') => void;
  updateHazardPopupDebounceMode: (value: 'recent_three_frames_two_risks' | 'consecutive_two_risks') => void;
  updateTag3DangerPopupOnly: (value: boolean) => void;
  setPopupDurationMs: (value: number) => void;
  setSensorPopupDurationMs: (value: number) => void;
  applyWsUrl: () => void;
  applySensorBridgeUrl: () => void;
  applyRtspControlUrl: () => void;
  applyRtspUrl: () => void;
  startRtspStream: () => Promise<void>;
  stopRtspStream: () => Promise<void>;
  syncTelegramChats: () => Promise<void>;
  applyTelegramSettings: () => Promise<void>;
}

export function SettingsModal({
  open,
  wsDraft,
  sensorBridgeDraft,
  rtspControlDraft,
  rtspUrlDraft,
  rtspStreamStatus,
  rtspStreamMessage,
  cameraDisplayCount,
  bboxVisible,
  overlayDisplayMode,
  hazardPopupDebounceMode,
  tag3DangerPopupOnly,
  popupDurationMs,
  sensorPopupDurationMs,
  configMessage,
  sensorSettingsMessage,
  telegramSettingsMessage,
  telegramBotTokenConfigured,
  telegramBotTokenMasked,
  telegramBotTokenDraft,
  telegramKnownChats,
  telegramAutoSync,
  telegramSensorCooldownDraft,
  telegramSyncingChats,
  telegramSavingSettings,
  onClose,
  updateWsDraft,
  updateSensorBridgeDraft,
  updateRtspControlDraft,
  updateRtspUrlDraft,
  updateCameraDisplayCount,
  updateTelegramBotTokenDraft,
  updateTelegramChatSelection,
  updateTelegramAutoSync,
  updateTelegramSensorCooldownDraft,
  updateBboxVisible,
  updateOverlayDisplayMode,
  updateHazardPopupDebounceMode,
  updateTag3DangerPopupOnly,
  setPopupDurationMs,
  setSensorPopupDurationMs,
  applyWsUrl,
  applySensorBridgeUrl,
  applyRtspControlUrl,
  applyRtspUrl,
  startRtspStream,
  stopRtspStream,
  syncTelegramChats,
  applyTelegramSettings,
}: SettingsModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [bboxVisibleDraft, setBboxVisibleDraft] = useState(bboxVisible);
  const [cameraDisplayCountDraft, setCameraDisplayCountDraft] = useState<2 | 4>(cameraDisplayCount);
  const [overlayDisplayModeDraft, setOverlayDisplayModeDraft] = useState(overlayDisplayMode);
  const [hazardPopupDebounceModeDraft, setHazardPopupDebounceModeDraft] = useState(hazardPopupDebounceMode);
  const [tag3DangerPopupOnlyDraft, setTag3DangerPopupOnlyDraft] = useState(tag3DangerPopupOnly);
  const [hazardDurationDraft, setHazardDurationDraft] = useState(toSecondsDraft(popupDurationMs));
  const [fieldStateDurationDraft, setFieldStateDurationDraft] = useState(toSecondsDraft(sensorPopupDurationMs));
  const [durationError, setDurationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setBboxVisibleDraft(bboxVisible);
    setCameraDisplayCountDraft(cameraDisplayCount);
    setOverlayDisplayModeDraft(overlayDisplayMode);
    setHazardPopupDebounceModeDraft(hazardPopupDebounceMode);
    setTag3DangerPopupOnlyDraft(tag3DangerPopupOnly);
    setHazardDurationDraft(toSecondsDraft(popupDurationMs));
    setFieldStateDurationDraft(toSecondsDraft(sensorPopupDurationMs));
    setDurationError(null);
  }, [bboxVisible, cameraDisplayCount, hazardPopupDebounceMode, open, overlayDisplayMode, popupDurationMs, sensorPopupDurationMs, tag3DangerPopupOnly]);

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
        className="ghost-border max-h-[calc(100dvh-3rem)] w-full max-w-3xl overflow-y-auto rounded-[32px] bg-surface p-5 shadow-xl sm:p-6"
        role="dialog"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm text-secondary">SYSTEM SETTINGS</p>
            <h2 className="text-balance text-2xl font-semibold text-on-surface" id={titleId}>
              설정
            </h2>
            <p className="max-w-2xl text-pretty text-sm leading-6 text-on-surface-variant" id={descriptionId}>
              저장된 CCTV와 센서 브리지 주소를 관리하고, 위험 팝업과 현장 상태 팝업 유지 시간을 조정합니다.
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

        <div className="mt-6 space-y-4">
          <details open className="rounded-[28px] border border-outline/40 bg-surface-high p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-on-surface">
              <span>
                기본 연결
                <span className="ml-2 font-normal text-on-surface-variant">CCTV, 센서 브리지, RTSP 주소</span>
              </span>
              <span className="text-xs font-medium text-on-surface-variant">접기/펼치기</span>
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
                  placeholder="ws://10.161.110.223:8787"
                  spellCheck={false}
                  type="text"
                  value={sensorBridgeDraft}
                />
              </label>

              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm font-medium text-on-surface">RTSP Control API URL</span>
                <input
                  className="w-full rounded-2xl border border-outline/40 bg-background px-4 py-3 text-sm text-on-surface outline-none transition-colors placeholder:text-secondary focus:border-primary focus:ring-2 focus:ring-primary/30"
                  onChange={(event) => updateRtspControlDraft(event.target.value)}
                  placeholder="http://host:port"
                  spellCheck={false}
                  type="text"
                  value={rtspControlDraft}
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
            </div>
          </details>

          <details open className="rounded-[28px] border border-outline/40 bg-surface-high p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-on-surface">
              <span>
                표시/팝업
                <span className="ml-2 font-normal text-on-surface-variant">BBOX, 팝업 조건, 유지 시간</span>
              </span>
              <span className="text-xs font-medium text-on-surface-variant">접기/펼치기</span>
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-on-surface">BBOX 표시 여부</span>
                <select
                  className="w-full rounded-2xl border border-outline/40 bg-background px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                  onChange={(event) => setBboxVisibleDraft(event.target.value === 'true')}
                  value={String(bboxVisibleDraft)}
                >
                  <option value="true">표시</option>
                  <option value="false">숨김</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-on-surface">카메라 화면 개수</span>
                <select
                  className="w-full rounded-2xl border border-outline/40 bg-background px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                  onChange={(event) => setCameraDisplayCountDraft(Number(event.target.value) as 2 | 4)}
                  value={String(cameraDisplayCountDraft)}
                >
                  <option value="2">2개</option>
                  <option value="4">4개</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-on-surface">박스 표시 조건</span>
                <select
                  className="w-full rounded-2xl border border-outline/40 bg-background px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                  onChange={(event) => setOverlayDisplayModeDraft(event.target.value as 'always' | 'alert' | 'risk')}
                  value={overlayDisplayModeDraft}
                >
                  <option value="always">항상</option>
                  <option value="alert">경고/위험일 때</option>
                  <option value="risk">위험일 때만</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-on-surface">위험 팝업 감지 방식</span>
                <select
                  className="w-full rounded-2xl border border-outline/40 bg-background px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                  onChange={(event) =>
                    setHazardPopupDebounceModeDraft(
                      event.target.value as 'recent_three_frames_two_risks' | 'consecutive_two_risks'
                    )
                  }
                  value={hazardPopupDebounceModeDraft}
                >
                  <option value="recent_three_frames_two_risks">최근 3프레임 중 위험 2회 감지</option>
                  <option value="consecutive_two_risks">위험 2프레임 연속 감지</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-on-surface">위험 팝업 시간(초)</span>
                <input
                  className="w-full rounded-2xl border border-outline/40 bg-background px-4 py-3 text-sm text-on-surface outline-none transition-colors placeholder:text-secondary focus:border-primary focus:ring-2 focus:ring-primary/30"
                  min={0}
                  onChange={(event) => setHazardDurationDraft(event.target.value)}
                  step={0.1}
                  type="number"
                  value={hazardDurationDraft}
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-on-surface">현장 상태 팝업 시간(초)</span>
                <input
                  className="w-full rounded-2xl border border-outline/40 bg-background px-4 py-3 text-sm text-on-surface outline-none transition-colors placeholder:text-secondary focus:border-primary focus:ring-2 focus:ring-primary/30"
                  min={0}
                  onChange={(event) => setFieldStateDurationDraft(event.target.value)}
                  step={0.1}
                  type="number"
                  value={fieldStateDurationDraft}
                />
              </label>

              <label className="flex items-start gap-3 rounded-2xl border border-outline/40 bg-background px-4 py-3 sm:col-span-2">
                <input
                  aria-label="Tag 3 데인저 전용 팝업"
                  checked={tag3DangerPopupOnlyDraft}
                  className="mt-1 size-4 rounded border-outline/40 text-primary focus:ring-primary/30"
                  onChange={(event) => setTag3DangerPopupOnlyDraft(event.target.checked)}
                  type="checkbox"
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium text-on-surface">Tag 3 데인저 전용 팝업</span>
                  <span className="block text-sm leading-6 text-on-surface-variant">
                    켜면 센서에서 `tag 3`만 확인하고, `danger` 존 진입 시에만 팝업과 경광등을 동작시킵니다.
                  </span>
                </span>
              </label>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                className="machined-btn rounded-2xl border border-primary px-5 py-3 text-sm font-medium text-on-primary transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => {
                  const nextHazardDuration = parseSecondsDraft(hazardDurationDraft);
                  const nextFieldStateDuration = parseSecondsDraft(fieldStateDurationDraft);

                  if (nextHazardDuration == null || nextFieldStateDuration == null) {
                    setDurationError('팝업 시간은 0 이상의 숫자(초)로 입력해주세요.');
                    return;
                  }

                  setDurationError(null);
                  updateBboxVisible(bboxVisibleDraft);
                  updateCameraDisplayCount(cameraDisplayCountDraft);
                  updateOverlayDisplayMode(overlayDisplayModeDraft);
                  updateHazardPopupDebounceMode(hazardPopupDebounceModeDraft);
                  updateTag3DangerPopupOnly(tag3DangerPopupOnlyDraft);
                  setPopupDurationMs(nextHazardDuration);
                  setSensorPopupDurationMs(nextFieldStateDuration);
                }}
                type="button"
              >
                표시/팝업 적용
              </button>
            </div>
          </details>

          <details open className="rounded-[28px] border border-outline/40 bg-surface-high p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-on-surface">
              <span>
                Telegram 알림
                <span className="ml-2 font-normal text-on-surface-variant">토큰, 채팅방, 자동 동기화</span>
              </span>
              <span className="text-xs font-medium text-on-surface-variant">접기/펼치기</span>
            </summary>
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-on-surface">알림 대상 관리</p>
                  <p className="text-sm leading-6 text-on-surface-variant">
                    봇 토큰을 저장한 뒤 채팅방을 찾고, 알림을 보낼 채팅방만 체크해서 적용합니다.
                  </p>
                </div>
                <span className="rounded-full border border-outline/40 bg-background px-3 py-2 text-xs font-medium text-on-surface-variant">
                  {telegramBotTokenConfigured ? `TOKEN ${telegramBotTokenMasked}` : 'TOKEN 미설정'}
                </span>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-medium text-on-surface">Telegram Bot Token</span>
                <input
                  className="w-full rounded-2xl border border-outline/40 bg-background px-4 py-3 text-sm text-on-surface outline-none transition-colors placeholder:text-secondary focus:border-primary focus:ring-2 focus:ring-primary/30"
                  onChange={(event) => updateTelegramBotTokenDraft(event.target.value)}
                  placeholder={telegramBotTokenConfigured ? '새 토큰을 입력하면 교체됩니다.' : '123456:abcdef...'}
                  spellCheck={false}
                  type="text"
                  value={telegramBotTokenDraft}
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-on-surface">센서 알림 쿨다운(초)</span>
                  <input
                    className="w-full rounded-2xl border border-outline/40 bg-background px-4 py-3 text-sm text-on-surface outline-none transition-colors placeholder:text-secondary focus:border-primary focus:ring-2 focus:ring-primary/30"
                    min={0}
                    onChange={(event) => updateTelegramSensorCooldownDraft(event.target.value)}
                    step={1}
                    type="number"
                    value={telegramSensorCooldownDraft}
                  />
                </label>

                <label className="flex items-center gap-3 rounded-2xl border border-outline/40 bg-background px-4 py-3">
                  <input
                    checked={telegramAutoSync}
                    className="size-4 accent-primary"
                    onChange={(event) => updateTelegramAutoSync(event.target.checked)}
                    type="checkbox"
                  />
                  <span className="text-sm font-medium text-on-surface">채팅방 자동 동기화</span>
                </label>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-2xl border border-outline/40 bg-background px-4 py-3 text-sm font-medium text-on-surface transition-colors hover:bg-surface-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                  disabled={telegramSyncingChats}
                  onClick={() => {
                    void syncTelegramChats();
                  }}
                  type="button"
                >
                  채팅방 찾기
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-on-surface">알림 대상 채팅방</p>
                <div className="grid gap-2">
                  {telegramKnownChats.length > 0 ? (
                    telegramKnownChats.map((chat) => (
                      <label
                        key={chat.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-outline/40 bg-background px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-on-surface">{chat.title}</p>
                          <p className="truncate text-xs text-on-surface-variant">
                            {chat.type} · {chat.id}
                          </p>
                        </div>
                        <input
                          aria-label={`${chat.title} (${chat.type})`}
                          checked={chat.selected}
                          className="size-4 accent-primary"
                          onChange={(event) => updateTelegramChatSelection(chat.id, event.target.checked)}
                          type="checkbox"
                        />
                      </label>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-outline/40 bg-background px-4 py-3 text-sm text-on-surface-variant">
                      아직 찾은 채팅방이 없습니다. 봇과 대화한 뒤 채팅방 찾기를 눌러주세요.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  className="machined-btn rounded-2xl border border-primary px-5 py-3 text-sm font-medium text-on-primary transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                  disabled={telegramSavingSettings}
                  onClick={() => {
                    void applyTelegramSettings();
                  }}
                  type="button"
                >
                  Telegram 적용
                </button>
              </div>
            </div>
          </details>
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
          {telegramSettingsMessage ? (
            <p aria-live="polite" className="rounded-2xl border border-outline/40 bg-surface-high px-4 py-3 text-sm text-on-surface">
              {telegramSettingsMessage}
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
              className="machined-btn rounded-2xl border border-primary px-5 py-3 text-sm font-medium text-on-primary transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => {
                applyWsUrl();
                applySensorBridgeUrl();
                applyRtspControlUrl();
                applyRtspUrl();
              }}
            type="button"
          >
            기본 연결 적용
          </button>
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
        </div>
      </div>
    </div>
  );
}
