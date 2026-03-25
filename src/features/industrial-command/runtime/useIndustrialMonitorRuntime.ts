import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  extractJsonPayloadsFromText,
  parseCameraKey,
  parseFramePayload,
  validateWsUrl,
} from '../../../../cctv-poc/frameParsing';
import { validateSocketUrl } from '../../../../cctv-poc/sensorParsing';
import type { ChannelConfig, ChannelRuntimeState, FrameSnapshot } from '../../../../cctv-poc/types';
import { parseFrontendStatePayload } from '../../../../frontend-state/frontendStateParsing';
import type {
  FrontendStateConnectionStatus,
  FrontendStateSnapshot,
} from '../../../../frontend-state/frontendStateTypes';

const AUTO_POPUP_MS = 2000;
const SENSOR_AUTO_POPUP_MS = AUTO_POPUP_MS + 1200;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAYS_MS = [1000, 2000, 4000];
const MAX_STREAM_LOGS = 200;
const WS_STORAGE_KEY = 'excavator-safe-system:cctv-poc-ws-url';
const SENSOR_WS_STORAGE_KEY = 'excavator-safe-system:sensor-bridge-ws-url';
const RTSP_URL_STORAGE_KEY = 'excavator-safe-system:rtsp-hls-url';
const BBOX_VISIBLE_STORAGE_KEY = 'excavator-safe-system:bbox-visible';
const OVERLAY_DISPLAY_MODE_STORAGE_KEY = 'excavator-safe-system:overlay-display-mode';
const HAZARD_POPUP_DURATION_STORAGE_KEY = 'excavator-safe-system:hazard-popup-duration-ms';
const FIELD_STATE_POPUP_DURATION_STORAGE_KEY = 'excavator-safe-system:field-state-popup-duration-ms';

export const INDUSTRIAL_MONITOR_CHANNELS: ChannelConfig[] = [
  { id: 1, cameraKey: 'cam1', channel: 'CH-01', title: '굴착기 구역 A', sourceType: 'cctv' },
  { id: 2, cameraKey: 'cam2', channel: 'CH-02', title: '굴착기 구역 B', sourceType: 'cctv' },
  { id: 3, cameraKey: 'rtsp', channel: 'CH-03', title: 'RTSP HLS 모니터', sourceType: 'rtsp' },
  { id: 4, cameraKey: 'cam3', channel: 'CH-04', title: '추가 카메라 슬롯', sourceType: 'cctv' },
];

const EMPTY_FRAME: FrameSnapshot = {
  sourceId: '-',
  frameIndex: null,
  reportWallTsMs: null,
  wsSentTsMs: null,
  objects: [],
  combinedKo: '',
  topEventKo: '',
  eventsKo: [],
  imageSize: null,
  overlayTrackIds: [],
  alertTier: 'normal',
  highlight: null,
  zoneName: null,
  detectedTargetLabel: null,
  estimatedDistanceText: null,
};

export const EMPTY_INDUSTRIAL_MONITOR_RUNTIME: ChannelRuntimeState = {
  connectionStatus: 'idle',
  reconnectAttempt: 0,
  errorMessage: null,
  currentImage: null,
  latestFrame: EMPTY_FRAME,
  visualFrame: EMPTY_FRAME,
  imageNaturalSize: null,
  alertTier: 'normal',
  alertEligible: false,
  incomingFps: 0,
  lastMessageAt: null,
  topEventFlash: false,
};

export type StreamLogEntry = {
  id: number;
  timestamp: string;
  summary: string;
  detail: string;
};

export type LogStreamType = 'cctv' | 'sensor';
export type RtspStreamStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'failed';
export type OverlayDisplayMode = 'always' | 'alert' | 'risk';

type SocketConnectMode = 'manual' | 'retry';

function createLogId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function sanitizePayloadDetail(payload: Record<string, unknown>) {
  const json = JSON.stringify(payload, null, 2);
  if (!json) return '';

  return json
    .replace(
      /"(image_jpeg_base64|image_base64|image|frame_base64|frame_jpeg_base64|jpeg_base64|snapshot_base64)"\s*:\s*"([^"]*)"/g,
      (_match, key: string, value: string) => `"${key}": "[omitted ${value.length} chars]"`
    )
    .replace(/\t/g, '  ');
}

function formatLogTimestamp(date = new Date()) {
  return date.toLocaleString('ko-KR', { hour12: false });
}

function getLogApiUrl(sensorBridgeUrl: string) {
  const normalized = sensorBridgeUrl.trim();
  if (normalized) {
    const wsUrl = new URL(normalized);
    const protocol = wsUrl.protocol === 'wss:' ? 'https:' : 'http:';
    return `${protocol}//${wsUrl.host}/logs`;
  }

  if (typeof window !== 'undefined') {
    return `http://${window.location.hostname}:8787/logs`;
  }

  return 'http://localhost:8787/logs';
}

function getLogTypeLabel(type: LogStreamType) {
  return type === 'sensor' ? '센서' : 'CCTV';
}

function createRuntimeMap() {
  return Object.fromEntries(
    INDUSTRIAL_MONITOR_CHANNELS.map((channel) => [channel.id, { ...EMPTY_INDUSTRIAL_MONITOR_RUNTIME }])
  ) as Record<number, ChannelRuntimeState>;
}

function loadStoredWsUrl(defaultValue = '') {
  if (typeof window === 'undefined') return defaultValue;
  return window.localStorage.getItem(WS_STORAGE_KEY)?.trim() || defaultValue;
}

function loadStoredSensorUrl(defaultValue = '') {
  if (typeof window === 'undefined') return defaultValue;
  return window.localStorage.getItem(SENSOR_WS_STORAGE_KEY)?.trim() || defaultValue;
}

function loadStoredRtspUrl(defaultValue = '') {
  if (typeof window === 'undefined') return defaultValue;
  return window.localStorage.getItem(RTSP_URL_STORAGE_KEY)?.trim() || defaultValue;
}

function loadStoredBboxVisible(defaultValue = true) {
  if (typeof window === 'undefined') return defaultValue;
  const stored = window.localStorage.getItem(BBOX_VISIBLE_STORAGE_KEY);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return defaultValue;
}

function loadStoredOverlayDisplayMode(defaultValue: OverlayDisplayMode = 'always') {
  if (typeof window === 'undefined') return defaultValue;
  const stored = window.localStorage.getItem(OVERLAY_DISPLAY_MODE_STORAGE_KEY);
  if (stored === 'always' || stored === 'alert' || stored === 'risk') return stored;
  return defaultValue;
}

function getRtspApiBase(sensorBridgeUrl: string, sensorBridgeDraft: string) {
  const candidate = sensorBridgeUrl.trim() || sensorBridgeDraft.trim();
  if (candidate) {
    const wsUrl = new URL(candidate);
    const protocol = wsUrl.protocol === 'wss:' ? 'https:' : 'http:';
    return `${protocol}//${wsUrl.host}`;
  }

  if (typeof window !== 'undefined') {
    return `http://${window.location.hostname}:8787`;
  }

  return 'http://localhost:8787';
}

function loadStoredDuration(storageKey: string, defaultValue: number) {
  if (typeof window === 'undefined') return defaultValue;

  const storedValue = window.localStorage.getItem(storageKey);
  if (!storedValue) return defaultValue;

  const parsedValue = Number.parseInt(storedValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) return defaultValue;

  return parsedValue;
}

function isActionableAlert(frame: FrameSnapshot) {
  return frame.alertTier !== 'normal' || frame.eventsKo.length > 0 || Boolean(frame.topEventKo);
}

export interface IndustrialMonitorRuntime {
  wsUrl: string;
  wsDraft: string;
  sensorBridgeUrl: string;
  sensorBridgeDraft: string;
  rtspControlUrl: string;
  rtspUrl: string;
  rtspUrlDraft: string;
  rtspPlaybackUrl: string | null;
  rtspStreamStatus: RtspStreamStatus;
  rtspStreamMessage: string | null;
  bboxVisible: boolean;
  overlayDisplayMode: OverlayDisplayMode;
  popupDurationMs: number;
  sensorPopupDurationMs: number;
  runtimeMap: Record<number, ChannelRuntimeState>;
  configMessage: string | null;
  focusedChannelId: number;
  popupChannelId: number | null;
  sensorConnectionStatus: FrontendStateConnectionStatus;
  sensorReconnectAttempt: number;
  sensorSettingsMessage: string | null;
  fieldStateMessage: string | null;
  sensorSnapshot: FrontendStateSnapshot | null;
  sensorPopupOpen: boolean;
  sensorLogs: StreamLogEntry[];
  cctvLogs: StreamLogEntry[];
  logActionMessage: string | null;
  savingLogType: LogStreamType | null;
  updateWsDraft: (value: string) => void;
  updateSensorBridgeDraft: (value: string) => void;
  updateRtspUrlDraft: (value: string) => void;
  updateBboxVisible: (value: boolean) => void;
  updateOverlayDisplayMode: (value: OverlayDisplayMode) => void;
  setPopupDurationMs: (value: number) => void;
  setSensorPopupDurationMs: (value: number) => void;
  focusChannel: (channelId: number) => void;
  connectSocket: (targetUrl: string, mode?: SocketConnectMode) => void;
  disconnectSocket: () => void;
  connectSensorSocket: (targetUrl: string, mode?: SocketConnectMode) => void;
  disconnectSensorSocket: () => void;
  applyWsUrl: () => void;
  applySensorBridgeUrl: () => void;
  applyRtspUrl: () => void;
  startRtspStream: () => Promise<void>;
  stopRtspStream: () => Promise<void>;
  openChannelPopup: (channelId: number) => void;
  closeChannelPopup: () => void;
  openSensorSnapshotPreview: () => void;
  closeSensorPopup: () => void;
  updateChannelImageNaturalSize: (channelId: number, width: number, height: number) => void;
  saveLogsToServer: (type: LogStreamType) => Promise<void>;
}

export function useIndustrialMonitorRuntime(): IndustrialMonitorRuntime {
  const [wsUrl, setWsUrl] = useState(() => loadStoredWsUrl(''));
  const [wsDraft, setWsDraft] = useState(() => loadStoredWsUrl(''));
  const [sensorBridgeUrl, setSensorBridgeUrl] = useState(() => loadStoredSensorUrl(''));
  const [sensorBridgeDraft, setSensorBridgeDraft] = useState(() => loadStoredSensorUrl(''));
  const [rtspUrl, setRtspUrl] = useState(() => loadStoredRtspUrl(''));
  const [rtspUrlDraft, setRtspUrlDraft] = useState(() => loadStoredRtspUrl(''));
  const [rtspPlaybackUrl, setRtspPlaybackUrl] = useState<string | null>(null);
  const [rtspStreamStatus, setRtspStreamStatus] = useState<RtspStreamStatus>('idle');
  const [rtspStreamMessage, setRtspStreamMessage] = useState<string | null>(null);
  const [bboxVisible, setBboxVisible] = useState(() => loadStoredBboxVisible(true));
  const [overlayDisplayMode, setOverlayDisplayMode] = useState<OverlayDisplayMode>(() =>
    loadStoredOverlayDisplayMode('always')
  );
  const [popupDurationMs, setPopupDurationMsState] = useState(() =>
    loadStoredDuration(HAZARD_POPUP_DURATION_STORAGE_KEY, AUTO_POPUP_MS)
  );
  const [sensorPopupDurationMs, setSensorPopupDurationMsState] = useState(() =>
    loadStoredDuration(FIELD_STATE_POPUP_DURATION_STORAGE_KEY, SENSOR_AUTO_POPUP_MS)
  );
  const [runtimeMap, setRuntimeMap] = useState<Record<number, ChannelRuntimeState>>(() => createRuntimeMap());
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [focusedChannelId, setFocusedChannelId] = useState<number>(1);
  const [popupChannelId, setPopupChannelId] = useState<number | null>(null);
  const [sensorConnectionStatus, setSensorConnectionStatus] = useState<FrontendStateConnectionStatus>('idle');
  const [sensorReconnectAttempt, setSensorReconnectAttempt] = useState(0);
  const [sensorSettingsMessage, setSensorSettingsMessage] = useState<string | null>(null);
  const [fieldStateMessage, setFieldStateMessage] = useState<string | null>(null);
  const [sensorSnapshot, setSensorSnapshot] = useState<FrontendStateSnapshot | null>(null);
  const [sensorPopupOpen, setSensorPopupOpen] = useState(false);
  const [sensorLogs, setSensorLogs] = useState<StreamLogEntry[]>([]);
  const [cctvLogs, setCctvLogs] = useState<StreamLogEntry[]>([]);
  const [logActionMessage, setLogActionMessage] = useState<string | null>(null);
  const [savingLogType, setSavingLogType] = useState<LogStreamType | null>(null);
  const rtspControlUrl = useMemo(
    () => getRtspApiBase(sensorBridgeUrl, sensorBridgeDraft),
    [sensorBridgeDraft, sensorBridgeUrl]
  );

  const wsRef = useRef<WebSocket | null>(null);
  const sensorWsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const sensorReconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const sensorReconnectTimerRef = useRef<number | null>(null);
  const popupTimerRef = useRef<number | null>(null);
  const popupChannelIdRef = useRef<number | null>(null);
  const sensorPopupTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const frameTimesRef = useRef<Record<number, number[]>>({});
  const manualCloseSocketsRef = useRef(new WeakSet<WebSocket>());
  const manualCloseSensorSocketsRef = useRef(new WeakSet<WebSocket>());

  const channelByCameraKey = useMemo(
    () =>
      Object.fromEntries(INDUSTRIAL_MONITOR_CHANNELS.map((channel) => [channel.cameraKey, channel])) as Record<
        string,
        ChannelConfig
      >,
    []
  );

  const appendCctvLog = useCallback((summary: string, detail: string) => {
    setCctvLogs((prev) =>
      [...prev, { id: createLogId(), timestamp: formatLogTimestamp(), summary, detail }].slice(-MAX_STREAM_LOGS)
    );
  }, []);

  const appendSensorLog = useCallback((summary: string, detail: string) => {
    setSensorLogs((prev) =>
      [...prev, { id: createLogId(), timestamp: formatLogTimestamp(), summary, detail }].slice(-MAX_STREAM_LOGS)
    );
  }, []);

  const saveLogsToServer = useCallback(
    async (type: LogStreamType) => {
      const entries = type === 'cctv' ? cctvLogs : sensorLogs;
      if (entries.length === 0) return;

      setSavingLogType(type);
      setLogActionMessage(null);

      try {
        const response = await fetch(getLogApiUrl(sensorBridgeUrl || sensorBridgeDraft), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type,
            entries,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof result.error === 'string' ? result.error : '로그 저장에 실패했습니다.');
        }

        setLogActionMessage(`${getLogTypeLabel(type)} 로그 저장 완료 · ${result.fileName} · ${result.savedPath}`);
      } catch (error) {
        setLogActionMessage(
          `${getLogTypeLabel(type)} 로그 저장 실패 · ${error instanceof Error ? error.message : '알 수 없는 오류'}`
        );
      } finally {
        setSavingLogType(null);
      }
    },
    [cctvLogs, sensorBridgeDraft, sensorBridgeUrl, sensorLogs]
  );

  const updateRuntime = useCallback((channelId: number, updater: (prev: ChannelRuntimeState) => ChannelRuntimeState) => {
    setRuntimeMap((prev) => ({
      ...prev,
      [channelId]: updater(prev[channelId] ?? { ...EMPTY_INDUSTRIAL_MONITOR_RUNTIME }),
    }));
  }, []);

  const updateChannelImageNaturalSize = useCallback(
    (channelId: number, width: number, height: number) => {
      updateRuntime(channelId, (prev) => ({ ...prev, imageNaturalSize: [width, height] }));
    },
    [updateRuntime]
  );

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current != null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const clearPopupTimer = useCallback(() => {
    if (popupTimerRef.current != null) {
      window.clearTimeout(popupTimerRef.current);
      popupTimerRef.current = null;
    }
  }, []);

  const clearSensorReconnectTimer = useCallback(() => {
    if (sensorReconnectTimerRef.current != null) {
      window.clearTimeout(sensorReconnectTimerRef.current);
      sensorReconnectTimerRef.current = null;
    }
  }, []);

  const clearSensorPopupTimer = useCallback(() => {
    if (sensorPopupTimerRef.current != null) {
      window.clearTimeout(sensorPopupTimerRef.current);
      sensorPopupTimerRef.current = null;
    }
  }, []);

  const syncRtspRuntime = useCallback((status: RtspStreamStatus) => {
    updateRuntime(3, (prev) => ({
      ...prev,
      connectionStatus:
        status === 'running'
          ? 'connected'
          : status === 'starting'
            ? 'connecting'
            : status === 'failed'
              ? 'failed'
              : 'idle',
      errorMessage: status === 'failed' ? rtspStreamMessage ?? 'RTSP 스트림을 시작하지 못했습니다.' : null,
    }));
  }, [rtspStreamMessage, updateRuntime]);

  const disconnectSocket = useCallback(() => {
    clearReconnectTimer();
    reconnectAttemptRef.current = 0;
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      manualCloseSocketsRef.current.add(ws);
      ws.close(1000, 'manual disconnect');
    }
    appendCctvLog('CCTV WebSocket 연결 해제', '사용자 요청으로 영상 WebSocket 연결을 종료했습니다.');
    setRuntimeMap(createRuntimeMap());
  }, [appendCctvLog, clearReconnectTimer]);

  const disconnectSensorSocket = useCallback(() => {
    clearSensorReconnectTimer();
    clearSensorPopupTimer();
    sensorReconnectAttemptRef.current = 0;
    setSensorReconnectAttempt(0);
    setSensorConnectionStatus('idle');
    const ws = sensorWsRef.current;
    sensorWsRef.current = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      manualCloseSensorSocketsRef.current.add(ws);
      ws.close(1000, 'manual disconnect');
    }
    appendSensorLog('센서 브리지 연결 해제', '사용자 요청으로 센서 브리지 WebSocket 연결을 종료했습니다.');
  }, [appendSensorLog, clearSensorPopupTimer, clearSensorReconnectTimer]);

  const connectSocket = useCallback(
    (targetUrl: string, mode: SocketConnectMode = 'manual') => {
      if (!targetUrl) return;
      const active = wsRef.current;
      if (active && (active.readyState === WebSocket.CONNECTING || active.readyState === WebSocket.OPEN)) return;

      setRuntimeMap((prev) =>
        Object.fromEntries(
          Object.entries(prev).map(([channelId, runtime]) => [
            channelId,
            {
              ...runtime,
              connectionStatus: mode === 'manual' ? 'connecting' : 'reconnecting',
              reconnectAttempt: reconnectAttemptRef.current,
              errorMessage: null,
            },
          ])
        ) as Record<number, ChannelRuntimeState>
      );

      const ws = new WebSocket(targetUrl);
      wsRef.current = ws;
      appendCctvLog('CCTV WebSocket 연결 시작', `대상 주소: ${targetUrl}`);

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        appendCctvLog('CCTV WebSocket 연결 성공', `연결 주소: ${targetUrl}`);
        setRuntimeMap((prev) =>
          Object.fromEntries(
            Object.entries(prev).map(([channelId, runtime]) => [
              channelId,
              { ...runtime, connectionStatus: 'connected', reconnectAttempt: 0, errorMessage: null },
            ])
          ) as Record<number, ChannelRuntimeState>
        );
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        const payloads = extractJsonPayloadsFromText(event.data);
        const now = new Date();

        for (const payload of payloads) {
          const { frame, imageSrc } = parseFramePayload(payload);
          const cameraKey = parseCameraKey(frame.sourceId);
          const channel = cameraKey ? channelByCameraKey[cameraKey] : null;
          appendCctvLog(
            `${channel?.channel ?? 'UNMAPPED'} 프레임 수신`,
            sanitizePayloadDetail(payload) ||
              JSON.stringify(
                {
                  sourceId: frame.sourceId,
                  frameIndex: frame.frameIndex,
                  objects: frame.objects.length,
                },
                null,
                2
              )
          );
          if (!channel) continue;

          const nowMs = now.getTime();
          frameTimesRef.current[channel.id] = [
            ...(frameTimesRef.current[channel.id] ?? []).filter((item) => nowMs - item < 1000),
            nowMs,
          ];
          const alertEligible = isActionableAlert(frame);

          updateRuntime(channel.id, (prev) => ({
            ...prev,
            connectionStatus: 'connected',
            currentImage: imageSrc ?? prev.currentImage,
            latestFrame: frame,
            visualFrame: frame,
            alertTier: frame.alertTier,
            alertEligible,
            incomingFps: frameTimesRef.current[channel.id].length,
            lastMessageAt: now,
            topEventFlash: alertEligible,
            errorMessage: null,
          }));

          if (frame.alertTier === 'risk') {
            if (popupChannelIdRef.current == null) {
              setFocusedChannelId(channel.id);
              popupChannelIdRef.current = channel.id;
              setPopupChannelId(channel.id);
              clearPopupTimer();
              popupTimerRef.current = window.setTimeout(() => {
                if (!mountedRef.current) return;
                popupChannelIdRef.current = null;
                setPopupChannelId(null);
              }, popupDurationMs);
            }
          }
        }
      };

      ws.onerror = () => {
        appendCctvLog('CCTV WebSocket 오류', '영상 WebSocket 연결 중 오류가 발생했습니다.');
        setRuntimeMap((prev) =>
          Object.fromEntries(
            Object.entries(prev).map(([channelId, runtime]) => [
              channelId,
              { ...runtime, errorMessage: 'WebSocket 연결 중 오류가 발생했습니다.' },
            ])
          ) as Record<number, ChannelRuntimeState>
        );
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        appendCctvLog('CCTV WebSocket 종료', `연결 종료: ${targetUrl}`);
        if (!mountedRef.current) return;
        if (manualCloseSocketsRef.current.has(ws)) {
          manualCloseSocketsRef.current.delete(ws);
          return;
        }
        const nextAttempt = reconnectAttemptRef.current + 1;
        if (nextAttempt > MAX_RECONNECT_ATTEMPTS) {
          setRuntimeMap((prev) =>
            Object.fromEntries(
              Object.entries(prev).map(([channelId, runtime]) => [
                channelId,
                {
                  ...runtime,
                  connectionStatus: 'failed',
                  reconnectAttempt: MAX_RECONNECT_ATTEMPTS,
                  errorMessage: '자동 재연결에 실패했습니다.',
                },
              ])
            ) as Record<number, ChannelRuntimeState>
          );
          return;
        }

        reconnectAttemptRef.current = nextAttempt;
        setRuntimeMap((prev) =>
          Object.fromEntries(
            Object.entries(prev).map(([channelId, runtime]) => [
              channelId,
              { ...runtime, connectionStatus: 'reconnecting', reconnectAttempt: nextAttempt },
            ])
          ) as Record<number, ChannelRuntimeState>
        );

        clearReconnectTimer();
        reconnectTimerRef.current = window.setTimeout(() => {
          if (!mountedRef.current) return;
          connectSocket(targetUrl, 'retry');
        }, RECONNECT_DELAYS_MS[nextAttempt - 1] ?? RECONNECT_DELAYS_MS[RECONNECT_DELAYS_MS.length - 1]);
      };
    },
    [appendCctvLog, channelByCameraKey, clearPopupTimer, clearReconnectTimer, popupDurationMs, updateRuntime]
  );

  const connectSensorSocket = useCallback(
    (targetUrl: string, mode: SocketConnectMode = 'manual') => {
      if (!targetUrl) return;
      const active = sensorWsRef.current;
      if (active && (active.readyState === WebSocket.CONNECTING || active.readyState === WebSocket.OPEN)) return;

      setSensorConnectionStatus(mode === 'manual' ? 'connecting' : 'reconnecting');
      setSensorSettingsMessage(null);

      const ws = new WebSocket(targetUrl);
      sensorWsRef.current = ws;
      appendSensorLog('센서 브리지 연결 시작', `대상 주소: ${targetUrl}`);

      ws.onopen = () => {
        sensorReconnectAttemptRef.current = 0;
        setSensorReconnectAttempt(0);
        setSensorConnectionStatus('connected');
        appendSensorLog('센서 브리지 연결 성공', `연결 주소: ${targetUrl}`);
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        const payloads = extractJsonPayloadsFromText(event.data);
        for (const payload of payloads) {
          const nextSnapshot = parseFrontendStatePayload(payload);
          appendSensorLog(
            '현장 상태 스냅샷 수신',
            sanitizePayloadDetail(payload) ||
              JSON.stringify(
                {
                  timestamp: nextSnapshot.timestamp,
                  workers: nextSnapshot.workers.length,
                },
                null,
                2
              )
          );
          setSensorSnapshot(nextSnapshot);
          setFieldStateMessage(null);
        }
      };

      ws.onerror = () => {
        appendSensorLog('센서 브리지 오류', '센서 브리지 연결 중 오류가 발생했습니다.');
        setSensorSettingsMessage('센서 브리지 연결 중 오류가 발생했습니다.');
      };

      ws.onclose = () => {
        if (sensorWsRef.current === ws) {
          sensorWsRef.current = null;
        }
        appendSensorLog('센서 브리지 종료', `연결 종료: ${targetUrl}`);
        if (!mountedRef.current) return;
        if (manualCloseSensorSocketsRef.current.has(ws)) {
          manualCloseSensorSocketsRef.current.delete(ws);
          return;
        }
        const nextAttempt = sensorReconnectAttemptRef.current + 1;
        if (nextAttempt > MAX_RECONNECT_ATTEMPTS) {
          setSensorReconnectAttempt(MAX_RECONNECT_ATTEMPTS);
          setSensorConnectionStatus('failed');
          setSensorSettingsMessage('센서 브리지 자동 재연결에 실패했습니다.');
          return;
        }

        sensorReconnectAttemptRef.current = nextAttempt;
        setSensorReconnectAttempt(nextAttempt);
        setSensorConnectionStatus('reconnecting');
        clearSensorReconnectTimer();
        sensorReconnectTimerRef.current = window.setTimeout(() => {
          if (!mountedRef.current) return;
          connectSensorSocket(targetUrl, 'retry');
        }, RECONNECT_DELAYS_MS[nextAttempt - 1] ?? RECONNECT_DELAYS_MS[RECONNECT_DELAYS_MS.length - 1]);
      };
    },
    [appendSensorLog, clearSensorReconnectTimer]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearReconnectTimer();
      clearPopupTimer();
      clearSensorReconnectTimer();
      clearSensorPopupTimer();
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        wsRef.current.close(1000, 'component unmount');
      }
      if (
        sensorWsRef.current &&
        (sensorWsRef.current.readyState === WebSocket.OPEN || sensorWsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        sensorWsRef.current.close(1000, 'component unmount');
      }
    };
  }, [clearPopupTimer, clearReconnectTimer, clearSensorPopupTimer, clearSensorReconnectTimer]);

  const updateWsDraft = useCallback((value: string) => {
    setWsDraft(value);
    setConfigMessage(null);
  }, []);

  const updateSensorBridgeDraft = useCallback((value: string) => {
    setSensorBridgeDraft(value);
    setSensorSettingsMessage(null);
  }, []);

  const updateRtspUrlDraft = useCallback((value: string) => {
    setRtspUrlDraft(value);
    setRtspStreamMessage(null);
  }, []);

  const updateOverlayDisplayMode = useCallback((value: OverlayDisplayMode) => {
    setOverlayDisplayMode(value);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(OVERLAY_DISPLAY_MODE_STORAGE_KEY, value);
    }
  }, []);

  const updateBboxVisible = useCallback((value: boolean) => {
    setBboxVisible(value);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(BBOX_VISIBLE_STORAGE_KEY, String(value));
    }
  }, []);

  const setPopupDurationMs = useCallback((value: number) => {
    const nextValue = Math.max(0, Math.round(value));
    setPopupDurationMsState(nextValue);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(HAZARD_POPUP_DURATION_STORAGE_KEY, String(nextValue));
    }
  }, []);

  const setSensorPopupDurationMs = useCallback((value: number) => {
    const nextValue = Math.max(0, Math.round(value));
    setSensorPopupDurationMsState(nextValue);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(FIELD_STATE_POPUP_DURATION_STORAGE_KEY, String(nextValue));
    }
  }, []);

  const applyWsUrl = useCallback(() => {
    const error = validateWsUrl(wsDraft);
    if (error) {
      setConfigMessage(error);
      return;
    }

    const nextUrl = wsDraft.trim();
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(WS_STORAGE_KEY, nextUrl);
    }
    disconnectSocket();
    setWsUrl(nextUrl);
    setConfigMessage('WebSocket 주소를 저장했습니다.');
    window.setTimeout(() => connectSocket(nextUrl), 0);
  }, [connectSocket, disconnectSocket, wsDraft]);

  const applySensorBridgeUrl = useCallback(() => {
    const error = validateSocketUrl(sensorBridgeDraft);
    if (error) {
      setSensorSettingsMessage(error);
      return;
    }

    const nextUrl = sensorBridgeDraft.trim();
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SENSOR_WS_STORAGE_KEY, nextUrl);
    }
    disconnectSensorSocket();
    setSensorBridgeUrl(nextUrl);
    setSensorSettingsMessage('센서 브리지 주소를 저장했습니다.');
    window.setTimeout(() => connectSensorSocket(nextUrl), 0);
  }, [connectSensorSocket, disconnectSensorSocket, sensorBridgeDraft]);

  const applyRtspUrl = useCallback(() => {
    const nextUrl = rtspUrlDraft.trim();
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RTSP_URL_STORAGE_KEY, nextUrl);
    }
    setRtspUrl(nextUrl);
    setRtspStreamMessage(nextUrl ? 'RTSP 주소를 저장했습니다.' : 'RTSP 주소를 비웠습니다.');
  }, [rtspUrlDraft]);

  const startRtspStream = useCallback(async () => {
    const nextUrl = rtspUrlDraft.trim();
    if (!nextUrl) {
      setRtspStreamStatus('failed');
      setRtspStreamMessage('RTSP URL을 입력해주세요.');
      syncRtspRuntime('failed');
      return;
    }
    if (!/^rtsp:\/\//i.test(nextUrl)) {
      setRtspStreamStatus('failed');
      setRtspStreamMessage('RTSP URL은 rtsp:// 형식이어야 합니다.');
      syncRtspRuntime('failed');
      return;
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RTSP_URL_STORAGE_KEY, nextUrl);
    }
    setRtspUrl(nextUrl);
    setRtspStreamStatus('starting');
    setRtspStreamMessage('RTSP 스트림을 시작하는 중입니다.');
    syncRtspRuntime('starting');

    try {
      const response = await fetch(`${rtspControlUrl}/rtsp/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rtspUrl: nextUrl }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result.error === 'string' ? result.error : 'RTSP 스트림 시작에 실패했습니다.');
      }

      setRtspPlaybackUrl(typeof result.playbackUrl === 'string' ? result.playbackUrl : `${rtspControlUrl}/hls/stream.m3u8`);
      setRtspStreamStatus('running');
      setRtspStreamMessage('RTSP 스트림이 실행 중입니다.');
      updateRuntime(3, (prev) => ({ ...prev, currentImage: null }));
      syncRtspRuntime('running');
    } catch (error) {
      setRtspPlaybackUrl(null);
      setRtspStreamStatus('failed');
      setRtspStreamMessage(error instanceof Error ? error.message : 'RTSP 스트림 시작에 실패했습니다.');
      syncRtspRuntime('failed');
    }
  }, [rtspControlUrl, rtspUrlDraft, syncRtspRuntime, updateRuntime]);

  const stopRtspStream = useCallback(async () => {
    try {
      await fetch(`${rtspControlUrl}/rtsp/stop`, { method: 'POST' });
    } catch {
      // Keep local state consistent even if the stop call fails.
    }
    setRtspPlaybackUrl(null);
    setRtspStreamStatus('stopped');
    setRtspStreamMessage('RTSP 스트림을 중지했습니다.');
    syncRtspRuntime('stopped');
  }, [rtspControlUrl, syncRtspRuntime]);

  const openChannelPopup = useCallback((channelId: number) => {
    clearPopupTimer();
    setFocusedChannelId(channelId);
    popupChannelIdRef.current = channelId;
    setPopupChannelId(channelId);
  }, [clearPopupTimer]);

  const focusChannel = useCallback((channelId: number) => {
    setFocusedChannelId(channelId);
  }, []);

  const closeChannelPopup = useCallback(() => {
    clearPopupTimer();
    popupChannelIdRef.current = null;
    setPopupChannelId(null);
  }, [clearPopupTimer]);

  const openSensorSnapshotPreview = useCallback(() => {
    clearSensorPopupTimer();
    setSensorPopupOpen(true);
    setFieldStateMessage(sensorSnapshot ? null : '아직 수신된 현장 상태 스냅샷이 없습니다.');
  }, [clearSensorPopupTimer, sensorSnapshot]);

  const closeSensorPopup = useCallback(() => {
    clearSensorPopupTimer();
    setSensorPopupOpen(false);
  }, [clearSensorPopupTimer]);

  useEffect(() => {
    syncRtspRuntime(rtspStreamStatus);
  }, [rtspStreamStatus, syncRtspRuntime]);

  return {
    wsUrl,
    wsDraft,
    sensorBridgeUrl,
    sensorBridgeDraft,
    rtspControlUrl,
    rtspUrl,
    rtspUrlDraft,
    rtspPlaybackUrl,
    rtspStreamStatus,
    rtspStreamMessage,
    bboxVisible,
    overlayDisplayMode,
    popupDurationMs,
    sensorPopupDurationMs,
    runtimeMap,
    configMessage,
    focusedChannelId,
    popupChannelId,
    sensorConnectionStatus,
    sensorReconnectAttempt,
    sensorSettingsMessage,
    fieldStateMessage,
    sensorSnapshot,
    sensorPopupOpen,
    sensorLogs,
    cctvLogs,
    logActionMessage,
    savingLogType,
    updateWsDraft,
    updateSensorBridgeDraft,
    updateRtspUrlDraft,
    updateBboxVisible,
    updateOverlayDisplayMode,
    setPopupDurationMs,
    setSensorPopupDurationMs,
    focusChannel,
    connectSocket,
    disconnectSocket,
    connectSensorSocket,
    disconnectSensorSocket,
    applyWsUrl,
    applySensorBridgeUrl,
    applyRtspUrl,
    startRtspStream,
    stopRtspStream,
    openChannelPopup,
    closeChannelPopup,
    openSensorSnapshotPreview,
    closeSensorPopup,
    updateChannelImageNaturalSize,
    saveLogsToServer,
  };
}
