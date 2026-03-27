import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  extractJsonPayloadsFromText,
  normalizeBBoxForImage,
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
  FrontendStateWorker,
} from '../../../../frontend-state/frontendStateTypes';

const AUTO_POPUP_MS = 2000;
const SENSOR_AUTO_POPUP_MS = AUTO_POPUP_MS + 1200;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAYS_MS = [1000, 2000, 4000];
const MAX_STREAM_LOGS = 200;
const MAX_EVENT_FEED_ITEMS = 60;
const WS_STORAGE_KEY = 'excavator-safe-system:cctv-poc-ws-url';
const SENSOR_WS_STORAGE_KEY = 'excavator-safe-system:sensor-bridge-ws-url';
const SENSOR_INPUT_WS_STORAGE_KEY = 'excavator-safe-system:sensor-input-ws-url';
const RTSP_CONTROL_API_STORAGE_KEY = 'excavator-safe-system:rtsp-control-api-url';
const RTSP_URL_STORAGE_KEY = 'excavator-safe-system:rtsp-hls-url';
const TELEGRAM_BOT_TOKEN_STORAGE_KEY = 'excavator-safe-system:telegram-bot-token';
const TELEGRAM_CHAT_IDS_STORAGE_KEY = 'excavator-safe-system:telegram-chat-ids';
const TELEGRAM_KNOWN_CHATS_STORAGE_KEY = 'excavator-safe-system:telegram-known-chats';
const TELEGRAM_AUTO_SYNC_STORAGE_KEY = 'excavator-safe-system:telegram-auto-sync';
const TELEGRAM_SENSOR_COOLDOWN_STORAGE_KEY = 'excavator-safe-system:telegram-sensor-cooldown-ms';
const BBOX_VISIBLE_STORAGE_KEY = 'excavator-safe-system:bbox-visible';
const OVERLAY_DISPLAY_MODE_STORAGE_KEY = 'excavator-safe-system:overlay-display-mode';
const CAMERA_DISPLAY_COUNT_STORAGE_KEY = 'excavator-safe-system:camera-display-count';
const HAZARD_POPUP_DURATION_STORAGE_KEY = 'excavator-safe-system:hazard-popup-duration-ms';
const FIELD_STATE_POPUP_DURATION_STORAGE_KEY = 'excavator-safe-system:field-state-popup-duration-ms';
const HAZARD_POPUP_DEBOUNCE_MODE_STORAGE_KEY = 'excavator-safe-system:hazard-popup-debounce-mode';
const HAZARD_QUALIFICATION_WINDOW_MS = 1500;
const DEFAULT_CCTV_WS_URL = 'ws://10.161.110.223:8876';
const DEFAULT_SENSOR_BRIDGE_WS_URL = 'ws://10.161.110.223:8787';
const DEFAULT_SENSOR_INPUT_WS_URL = 'ws://192.168.10.7:10000';
const DEFAULT_RTSP_CONTROL_API_URL = 'http://10.161.110.223:8787';
const DEFAULT_RTSP_URL = 'rtsp://admin:total!23@192.168.1.100:554';
const DEFAULT_TELEGRAM_BOT_TOKEN = '8385397257:AAFS3n_zuXKfHW0K0lP2uk4rxz7pWb3AIVk';

export const INDUSTRIAL_MONITOR_CHANNELS: ChannelConfig[] = [
  { id: 1, cameraKey: 'cam1', channel: 'CH-01', title: '굴착기 구역 A', sourceType: 'cctv' },
  { id: 2, cameraKey: 'cam2', channel: 'CH-02', title: '굴착기 구역 B', sourceType: 'cctv' },
  { id: 3, cameraKey: 'rtsp', channel: 'CH-03', title: 'RTSP 실시간 모니터', sourceType: 'rtsp' },
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
  relationTrackIds: [],
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
  id: string;
  timestamp: string;
  summary: string;
  detail: string;
};

export type LogStreamType = 'cctv' | 'sensor';
export type RtspStreamStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'failed';
export type OverlayDisplayMode = 'always' | 'alert' | 'risk';
export type CameraDisplayCount = 2 | 4;
export type HazardPopupDebounceMode = 'recent_three_frames_two_risks' | 'consecutive_two_risks';

export type HazardRiskSample = {
  atMs: number;
  isRisk: boolean;
  severity: 'normal' | 'risk';
};

export type HazardPopupSnapshot = {
  channelId: number;
  channelLabel: string;
  channelTitle: string;
  summary: string;
  runtime: ChannelRuntimeState;
};

export type EventFeedItem = {
  id: string;
  channelId: number;
  channelLabel: string;
  channelTitle: string;
  alertTier: 'caution' | 'risk';
  summary: string;
  frameIndex: number | null;
  objectCount: number;
  sourceId: string;
  timestamp: string;
};

export type TelegramKnownChat = {
  id: string;
  type: string;
  title: string;
  selected: boolean;
};

export type SensorGateState = 'no_sensor' | 'approved_nearest' | 'unapproved_nearest';
export type EffectiveHazardState = 'safe' | 'hazardous';
export type LightControlCommand = 'on' | 'off';
export type LightControlReason =
  | 'nearest_approved_sensor'
  | 'nearest_unapproved_sensor'
  | 'ai_only'
  | 'idle';

export type HazardControlState = {
  nearestSensorWorker: FrontendStateWorker | null;
  sensorGateState: SensorGateState;
  effectiveHazardState: EffectiveHazardState;
  popupBlocked: boolean;
  popupReason: LightControlReason;
  lightCommand: LightControlCommand;
  selectedPopupChannelId: number | null;
};

type SocketConnectMode = 'manual' | 'retry';

let logEntrySequence = 0;

function createLogId() {
  logEntrySequence += 1;
  return `log-${Date.now()}-${logEntrySequence}`;
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

type LocationLike = {
  hostname: string;
  origin: string;
  port: string;
  protocol: string;
};

function isLoopbackHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
}

function normalizeLoopbackUrl(url: string, locationLike?: LocationLike) {
  if (!locationLike || isLoopbackHostname(locationLike.hostname)) {
    return url;
  }

  try {
    const parsedUrl = new URL(url);
    if (!isLoopbackHostname(parsedUrl.hostname)) {
      return url;
    }

    parsedUrl.hostname = locationLike.hostname;
    if (!parsedUrl.port) {
      parsedUrl.port = locationLike.protocol === 'https:' ? '443' : '80';
    }
    return parsedUrl.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

function normalizeHttpApiBase(url: string, locationLike?: LocationLike) {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol === 'ws:') {
      parsedUrl.protocol = 'http:';
    } else if (parsedUrl.protocol === 'wss:') {
      parsedUrl.protocol = 'https:';
    }

    return normalizeLoopbackUrl(parsedUrl.toString().replace(/\/$/, ''), locationLike);
  } catch {
    return normalizeLoopbackUrl(url.replace(/\/$/, ''), locationLike);
  }
}

function formatSecondsDraftFromMs(value: number) {
  const seconds = value / 1000;
  return Number.isInteger(seconds) ? String(seconds) : String(seconds);
}

function parseSecondsDraftToMs(value: string, fallback = 5000) {
  const parsed = Number.parseFloat(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.round(parsed * 1000);
}

export function getBridgeHttpBase(
  sensorBridgeUrl: string,
  sensorBridgeDraft: string,
  locationLike?: LocationLike
) {
  const candidate = sensorBridgeUrl.trim() || sensorBridgeDraft.trim();
  if (candidate) {
    const wsUrl = new URL(candidate);
    const protocol = wsUrl.protocol === 'wss:' ? 'https:' : 'http:';
    return `${protocol}//${wsUrl.host}`;
  }

  if (locationLike || typeof window !== 'undefined') {
    const currentLocation = locationLike ?? window.location;
    const protocol = currentLocation.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${currentLocation.hostname}:8787`;
  }

  return 'http://localhost:8787';
}

function shouldUseDevBridgeProxy(targetBase: string, locationLike?: LocationLike) {
  if (!locationLike) return false;
  if (locationLike.port !== '5173') return false;

  try {
    return new URL(targetBase).origin !== locationLike.origin;
  } catch {
    return false;
  }
}

export function getBridgeApiUrl(
  path: string,
  sensorBridgeUrl: string,
  sensorBridgeDraft: string,
  locationLike?: LocationLike
) {
  const base = getBridgeHttpBase(sensorBridgeUrl, sensorBridgeDraft, locationLike);

  if (shouldUseDevBridgeProxy(base, locationLike)) {
    const params = new URLSearchParams({
      path,
      target: base,
    });
    return `/__bridge_proxy__?${params.toString()}`;
  }

  return `${base}${path}`;
}

export function getLightControlWsUrl(rtspControlApiBase: string) {
  const base = new URL(rtspControlApiBase);
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  base.pathname = '/ws/light-control';
  base.search = '';
  base.hash = '';
  return base.toString();
}

function maskTelegramBotToken(botToken: string) {
  const token = botToken.trim();
  if (!token) return '';
  if (token.length <= 8) return '*'.repeat(token.length);
  return `${token.slice(0, 4)}${'*'.repeat(Math.max(4, token.length - 8))}${token.slice(-4)}`;
}

function buildTelegramChatTitle(chat: Record<string, unknown>) {
  if (typeof chat.title === 'string' && chat.title.trim()) {
    return chat.title.trim();
  }

  const names = [chat.first_name, chat.last_name]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => (value as string).trim());
  if (names.length > 0) {
    return names.join(' ');
  }

  if (typeof chat.username === 'string' && chat.username.trim()) {
    return `@${chat.username.trim()}`;
  }

  return String(chat.id ?? 'Unknown chat');
}

function extractTelegramChat(update: Record<string, unknown>): TelegramKnownChat | null {
  const record = update as {
    message?: { chat?: Record<string, unknown> };
    edited_message?: { chat?: Record<string, unknown> };
    channel_post?: { chat?: Record<string, unknown> };
    edited_channel_post?: { chat?: Record<string, unknown> };
    my_chat_member?: { chat?: Record<string, unknown> };
    chat_member?: { chat?: Record<string, unknown> };
    chat_join_request?: { chat?: Record<string, unknown> };
  };
  const candidates = [
    record.message?.chat,
    record.edited_message?.chat,
    record.channel_post?.chat,
    record.edited_channel_post?.chat,
    record.my_chat_member?.chat,
    record.chat_member?.chat,
    record.chat_join_request?.chat,
  ];

  for (const chat of candidates) {
    if (!chat) continue;
    const id = chat.id;
    if (typeof id !== 'number' && typeof id !== 'string') continue;
    return {
      id: String(id),
      type: typeof chat.type === 'string' && chat.type.trim() ? chat.type.trim() : 'unknown',
      title: buildTelegramChatTitle(chat),
      selected: false,
    };
  }

  return null;
}

function buildTelegramBotApiUrl(botToken: string, method: string) {
  return `https://api.telegram.org/bot${botToken}/${method}`;
}

function decodeBase64Image(base64Payload: string) {
  const normalized = base64Payload.replace(/^data:image\/\w+;base64,/, '').trim();
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: 'image/jpeg' });
}

function normalizeTelegramImageSource(imageSrc: string) {
  const normalized = imageSrc.trim();
  if (!normalized) {
    return '';
  }

  return normalized.startsWith('data:image/') ? normalized : `data:image/jpeg;base64,${normalized}`;
}

function shouldRenderTelegramBoxes(mode: OverlayDisplayMode, alertTier: ChannelRuntimeState['alertTier']) {
  if (mode === 'always') return true;
  if (mode === 'alert') return alertTier !== 'normal';
  return alertTier === 'risk';
}

function getTelegramOverlayObjects(runtime: ChannelRuntimeState, mode: OverlayDisplayMode) {
  const highlightTrackIds = new Set(runtime.visualFrame.overlayTrackIds);
  const relationTrackIds = new Set(runtime.visualFrame.relationTrackIds);
  const sourceObjects =
    mode === 'always'
      ? runtime.visualFrame.objects
      : runtime.visualFrame.objects.filter(
          (object) => object.trackId != null && (highlightTrackIds.has(object.trackId) || relationTrackIds.has(object.trackId))
        );

  return sourceObjects.map((object) => ({
    object,
    highlighted: object.trackId != null && highlightTrackIds.has(object.trackId),
    relationHighlighted:
      runtime.alertTier !== 'normal' &&
      object.trackId != null &&
      runtime.visualFrame.relationTrackIds.includes(object.trackId),
  }));
}

async function loadImageElement(src: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('overlay image load failed'));
    image.src = src;
  });
}

async function renderTelegramOverlayPhoto(
  imageSrc: string,
  runtime: ChannelRuntimeState,
  bboxVisible: boolean,
  overlayDisplayMode: OverlayDisplayMode
) {
  const normalizedImageSrc = normalizeTelegramImageSource(imageSrc);

  if (!normalizedImageSrc || !bboxVisible || !shouldRenderTelegramBoxes(overlayDisplayMode, runtime.alertTier)) {
    return decodeBase64Image(normalizedImageSrc);
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return decodeBase64Image(imageSrc);
  }

  try {
    const image = await loadImageElement(normalizedImageSrc);
    const width = image.naturalWidth || runtime.imageNaturalSize?.[0] || runtime.visualFrame.imageSize?.[0] || 1920;
    const height = image.naturalHeight || runtime.imageNaturalSize?.[1] || runtime.visualFrame.imageSize?.[1] || 1080;
    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    const overlayObjects = getTelegramOverlayObjects(runtime, overlayDisplayMode);
    context.textBaseline = 'middle';
    context.font = '700 16px ui-monospace, SFMono-Regular, Menlo, monospace';

    for (const { object, highlighted, relationHighlighted } of overlayObjects) {
      const [x1, y1, x2, y2] = normalizeBBoxForImage(object.bbox, [width, height]);
      const rectWidth = Math.max(0, x2 - x1);
      const rectHeight = Math.max(0, y2 - y1);
      const stroke = relationHighlighted ? '#ff3b30' : highlighted ? '#ffb4ab' : '#4b8eff';
      const fill = relationHighlighted ? 'rgba(255, 59, 48, 0.2)' : highlighted ? 'rgba(255, 180, 171, 0.12)' : 'rgba(75, 142, 255, 0.12)';
      const labelFill = relationHighlighted ? '#ff3b30' : stroke;
      const labelText = relationHighlighted ? '#ffffff' : '#121416';
      const label = `${(object.label || 'object').toUpperCase()} #${object.trackId ?? '--'}`;
      const labelY = Math.max(10, y1 - 38);

      context.fillStyle = fill;
      context.strokeStyle = stroke;
      context.lineWidth = 4;
      context.beginPath();
      context.roundRect(x1, y1, rectWidth, rectHeight, 12);
      context.fill();
      context.stroke();

      context.fillStyle = labelFill;
      context.beginPath();
      context.roundRect(x1, labelY, 152, 32, 10);
      context.fill();

      context.fillStyle = labelText;
      context.fillText(label, x1 + 12, labelY + 16);
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    return blob ?? decodeBase64Image(normalizedImageSrc);
  } catch {
    return decodeBase64Image(normalizedImageSrc);
  }
}

function buildSensorTelegramCaption(snapshot: FrontendStateSnapshot) {
  const riskyWorkers = snapshot.workers.filter(
    (worker) =>
      worker.approved === false &&
      (worker.isWarning || worker.isEmergency || worker.zoneStatus === 'danger')
  );
  if (riskyWorkers.length === 0) {
    return '';
  }

  const lines = ['[굴착기 센서 위험 알림]'];
  if (snapshot.timestamp) {
    lines.push(`시간: ${snapshot.timestamp}`);
  }
  lines.push(`위험 작업자 수: ${riskyWorkers.length}명`);
  lines.push(
    ...riskyWorkers.slice(0, 5).map((worker) => {
      const flags = [];
      if (worker.isEmergency) flags.push('EMERGENCY');
      if (!worker.isEmergency && worker.isWarning) flags.push('WARNING');
      flags.push(worker.zoneStatus.toUpperCase());
      return `- ${worker.name} (#${worker.tagId}) ${worker.distanceM.toFixed(2)}m / ${flags.join(' · ')}`;
    })
  );
  return lines.join('\n');
}

function buildCctvTelegramCaption(payload: Record<string, unknown>) {
  const frameIndex = typeof payload.frame_index === 'number' ? payload.frame_index : null;
  const topEvent = typeof payload.top_event_ko === 'string' ? payload.top_event_ko : '';
  const combined = typeof payload.combined_ko === 'string' ? payload.combined_ko : '';
  const sourceId = typeof payload.source_id === 'string' ? payload.source_id : 'unknown';
  const zoneName = typeof payload.zone_name === 'string' ? payload.zone_name : '';

  return [
    '[굴착기 CCTV 위험 알림]',
    zoneName ? `구역: ${zoneName}` : null,
    `채널: ${sourceId}`,
    frameIndex != null ? `프레임: ${frameIndex}` : null,
    topEvent || combined || '위험 이벤트 감지',
  ]
    .filter(Boolean)
    .join('\n');
}

export function getLocalBridgeApiUrl(path: string, locationLike?: LocationLike) {
  const currentLocation = locationLike ?? (typeof window !== 'undefined' ? window.location : undefined);
  const protocol = currentLocation?.protocol === 'https:' ? 'https:' : 'http:';
  const hostname = currentLocation?.hostname ?? 'localhost';
  const base = `${protocol}//${hostname}:8787`;

  if (shouldUseDevBridgeProxy(base, currentLocation)) {
    const params = new URLSearchParams({
      path,
      target: base,
    });
    return `/__bridge_proxy__?${params.toString()}`;
  }

  return `${base}${path}`;
}

export function normalizeRtspPlaybackUrl(playbackUrl: string, rtspControlApiBase: string) {
  try {
    const playback = new URL(playbackUrl);
    if (!isLoopbackHostname(playback.hostname)) {
      return playbackUrl;
    }

    const controlBase = new URL(rtspControlApiBase);
    if (isLoopbackHostname(controlBase.hostname)) {
      return playbackUrl;
    }

    playback.protocol = controlBase.protocol;
    playback.host = controlBase.host;
    return playback.toString();
  } catch {
    return playbackUrl;
  }
}

export function getRtspPlaybackSrc(playbackUrl: string, rtspControlApiBase: string, locationLike?: LocationLike) {
  return normalizeRtspPlaybackUrl(playbackUrl, rtspControlApiBase);
}

function formatLogFileDatePart(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLogFileTimePart(date: Date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}-${minutes}-${seconds}`;
}

function buildRuntimeLogFileContent(entries: StreamLogEntry[]) {
  return entries
    .map((entry) =>
      [
        `시간: ${entry.timestamp}`,
        `요약: ${entry.summary}`,
        '상세:',
        entry.detail || '(상세 없음)',
        '------------------------------------------------------------',
      ].join('\n')
    )
    .join('\n\n');
}

function downloadRuntimeLogs(type: LogStreamType, entries: StreamLogEntry[], now = new Date()) {
  const fileName = `${type}-log-${formatLogFileDatePart(now)}_${formatLogFileTimePart(now)}.txt`;
  const content = buildRuntimeLogFileContent(entries);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
  return fileName;
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

function loadStoredTelegramBotToken(defaultValue = DEFAULT_TELEGRAM_BOT_TOKEN) {
  if (typeof window === 'undefined') return defaultValue;
  return window.localStorage.getItem(TELEGRAM_BOT_TOKEN_STORAGE_KEY)?.trim() || defaultValue;
}

function loadStoredTelegramChatIds(defaultValue: string[] = []) {
  if (typeof window === 'undefined') return defaultValue;
  const raw = window.localStorage.getItem(TELEGRAM_CHAT_IDS_STORAGE_KEY);
  if (!raw) return defaultValue;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function loadStoredTelegramKnownChats(defaultValue: TelegramKnownChat[] = []) {
  if (typeof window === 'undefined') return defaultValue;
  const raw = window.localStorage.getItem(TELEGRAM_KNOWN_CHATS_STORAGE_KEY);
  if (!raw) return defaultValue;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultValue;
    return parsed
      .map((entry) =>
        entry && typeof entry === 'object'
          ? {
              id: String((entry as { id?: unknown }).id ?? ''),
              type: typeof (entry as { type?: unknown }).type === 'string' ? (entry as { type: string }).type : 'unknown',
              title:
                typeof (entry as { title?: unknown }).title === 'string'
                  ? (entry as { title: string }).title
                  : String((entry as { id?: unknown }).id ?? ''),
              selected: Boolean((entry as { selected?: unknown }).selected),
            }
          : null
      )
      .filter((entry): entry is TelegramKnownChat => Boolean(entry?.id));
  } catch {
    return defaultValue;
  }
}

function loadStoredTelegramAutoSync(defaultValue = true) {
  if (typeof window === 'undefined') return defaultValue;
  const raw = window.localStorage.getItem(TELEGRAM_AUTO_SYNC_STORAGE_KEY);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return defaultValue;
}

function loadStoredTelegramSensorCooldown(defaultValue = 5000) {
  if (typeof window === 'undefined') return defaultValue;
  const raw = window.localStorage.getItem(TELEGRAM_SENSOR_COOLDOWN_STORAGE_KEY);
  if (!raw) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
}

function loadStoredRtspUrl(defaultValue = '') {
  if (typeof window === 'undefined') return defaultValue;
  return window.localStorage.getItem(RTSP_URL_STORAGE_KEY)?.trim() || defaultValue;
}

function loadStoredRtspControlUrl(defaultValue = '') {
  if (typeof window === 'undefined') return defaultValue;
  return window.localStorage.getItem(RTSP_CONTROL_API_STORAGE_KEY)?.trim() || defaultValue;
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

function loadStoredCameraDisplayCount(defaultValue: CameraDisplayCount = 4) {
  if (typeof window === 'undefined') return defaultValue;
  const stored = window.localStorage.getItem(CAMERA_DISPLAY_COUNT_STORAGE_KEY);
  if (stored === '2') return 2;
  if (stored === '4') return 4;
  return defaultValue;
}

function loadStoredHazardPopupDebounceMode(
  defaultValue: HazardPopupDebounceMode = 'recent_three_frames_two_risks'
) {
  if (typeof window === 'undefined') return defaultValue;
  const stored = window.localStorage.getItem(HAZARD_POPUP_DEBOUNCE_MODE_STORAGE_KEY);
  if (stored === 'recent_three_frames_two_risks' || stored === 'consecutive_two_risks') return stored;
  return defaultValue;
}

export function getRtspApiBase(
  rtspControlUrl: string,
  rtspControlDraft: string,
  sensorBridgeUrl: string,
  sensorBridgeDraft: string,
  locationLike?: LocationLike
) {
  const candidate = rtspControlUrl.trim() || rtspControlDraft.trim();
  if (candidate) {
    return normalizeHttpApiBase(candidate.replace(/\/$/, ''), locationLike);
  }

  return getBridgeHttpBase(sensorBridgeUrl, sensorBridgeDraft, locationLike);
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

function getFrameSummary(frame: FrameSnapshot) {
  return frame.topEventKo || frame.combinedKo || frame.eventsKo[0] || '실시간 위험 이벤트 대기';
}

function isRiskyUnapprovedWorker(worker: FrontendStateWorker) {
  return worker.approved === false && (worker.isWarning || worker.isEmergency || worker.zoneStatus === 'danger');
}

function findNearestSensorWorker(sensorSnapshot: FrontendStateSnapshot | null) {
  if (!sensorSnapshot || sensorSnapshot.workers.length === 0) {
    return null;
  }

  return sensorSnapshot.workers.reduce<FrontendStateWorker | null>((nearest, worker) => {
    if (!nearest) return worker;
    if (worker.distanceM < nearest.distanceM) return worker;
    return nearest;
  }, null);
}

function getSensorGateState(sensorSnapshot: FrontendStateSnapshot | null): {
  nearestSensorWorker: FrontendStateWorker | null;
  sensorGateState: SensorGateState;
} {
  const nearestSensorWorker = findNearestSensorWorker(sensorSnapshot);
  if (!nearestSensorWorker) {
    return {
      nearestSensorWorker: null,
      sensorGateState: 'no_sensor',
    };
  }

  return {
    nearestSensorWorker,
    sensorGateState: isRiskyUnapprovedWorker(nearestSensorWorker) ? 'unapproved_nearest' : 'approved_nearest',
  };
}

export function selectHazardPopupChannelId(latestRiskChannelId: number | null, latestFrameChannelId: number | null) {
  return latestRiskChannelId ?? latestFrameChannelId ?? null;
}

export function createSensorPopupRuntime(runtime: ChannelRuntimeState): ChannelRuntimeState {
  const allTrackIds = runtime.latestFrame.objects
    .map((object) => object.trackId)
    .filter((trackId): trackId is number => trackId != null);

  return {
    ...runtime,
    alertTier: runtime.alertTier === 'normal' ? 'risk' : runtime.alertTier,
    latestFrame: {
      ...runtime.latestFrame,
      overlayTrackIds: allTrackIds,
      relationTrackIds: [],
    },
    visualFrame: {
      ...runtime.latestFrame,
      overlayTrackIds: allTrackIds,
      relationTrackIds: [],
    },
  };
}

export function deriveHazardControlState({
  sensorSnapshot,
  aiHazardDetected,
  latestRiskChannelId,
  latestFrameChannelId,
}: {
  sensorSnapshot: FrontendStateSnapshot | null;
  aiHazardDetected: boolean;
  latestRiskChannelId: number | null;
  latestFrameChannelId: number | null;
}): HazardControlState {
  const { nearestSensorWorker, sensorGateState } = getSensorGateState(sensorSnapshot);

  if (sensorGateState === 'approved_nearest') {
    return {
      nearestSensorWorker,
      sensorGateState,
      effectiveHazardState: 'safe',
      popupBlocked: true,
      popupReason: 'nearest_approved_sensor',
      lightCommand: 'off',
      selectedPopupChannelId: null,
    };
  }

  if (sensorGateState === 'unapproved_nearest') {
    return {
      nearestSensorWorker,
      sensorGateState,
      effectiveHazardState: 'hazardous',
      popupBlocked: false,
      popupReason: 'nearest_unapproved_sensor',
      lightCommand: 'on',
      selectedPopupChannelId: selectHazardPopupChannelId(latestRiskChannelId, latestFrameChannelId),
    };
  }

  return {
    nearestSensorWorker,
    sensorGateState,
    effectiveHazardState: aiHazardDetected ? 'hazardous' : 'safe',
    popupBlocked: false,
    popupReason: aiHazardDetected ? 'ai_only' : 'idle',
    lightCommand: aiHazardDetected ? 'on' : 'off',
    selectedPopupChannelId: aiHazardDetected
      ? selectHazardPopupChannelId(latestRiskChannelId, latestFrameChannelId)
      : null,
  };
}

function isImmediateSevereFrame(frame: FrameSnapshot) {
  return frame.highlight?.tone === 'red' || /매우높음|초근접/.test(frame.topEventKo);
}

export function evaluateHazardQualification(
  samples: HazardRiskSample[],
  mode: HazardPopupDebounceMode,
  qualificationWindowMs = HAZARD_QUALIFICATION_WINDOW_MS
) {
  if (samples.length === 0) return false;

  const latestAtMs = samples[samples.length - 1]?.atMs ?? 0;
  const recentSamples = samples
    .filter((sample) => latestAtMs - sample.atMs <= qualificationWindowMs)
    .slice(-3);

  if (mode === 'consecutive_two_risks') {
    const lastTwo = recentSamples.slice(-2);
    return lastTwo.length === 2 && lastTwo.every((sample) => sample.isRisk);
  }

  return recentSamples.filter((sample) => sample.isRisk).length >= 2;
}

export interface IndustrialMonitorRuntime {
  wsUrl: string;
  wsDraft: string;
  sensorBridgeUrl: string;
  sensorBridgeDraft: string;
  sensorInputUrl: string;
  sensorInputDraft: string;
  rtspControlUrl: string;
  rtspControlDraft: string;
  rtspUrl: string;
  rtspUrlDraft: string;
  rtspPlaybackUrl: string | null;
  rtspStreamStatus: RtspStreamStatus;
  rtspStreamMessage: string | null;
  cameraDisplayCount: CameraDisplayCount;
  hiddenChannelIds: number[];
  bboxVisible: boolean;
  overlayDisplayMode: OverlayDisplayMode;
  hazardPopupDebounceMode: HazardPopupDebounceMode;
  popupDurationMs: number;
  sensorPopupDurationMs: number;
  runtimeMap: Record<number, ChannelRuntimeState>;
  configMessage: string | null;
  focusedChannelId: number;
  popupChannelId: number | null;
  popupSnapshot: HazardPopupSnapshot | null;
  nearestSensorWorker: FrontendStateWorker | null;
  sensorGateState: SensorGateState;
  effectiveHazardState: EffectiveHazardState;
  latestRiskChannelId: number | null;
  latestFrameChannelId: number | null;
  sensorConnectionStatus: FrontendStateConnectionStatus;
  sensorReconnectAttempt: number;
  sensorSettingsMessage: string | null;
  fieldStateMessage: string | null;
  sensorSnapshot: FrontendStateSnapshot | null;
  sensorPopupOpen: boolean;
  telegramSettingsMessage: string | null;
  telegramBotTokenConfigured: boolean;
  telegramBotTokenMasked: string;
  telegramBotTokenDraft: string;
  telegramKnownChats: TelegramKnownChat[];
  telegramSelectedChatIds: string[];
  telegramAutoSync: boolean;
  telegramSensorAlertCooldownMs: number;
  telegramSensorCooldownDraft: string;
  telegramSyncingChats: boolean;
  telegramSavingSettings: boolean;
  sensorLogs: StreamLogEntry[];
  cctvLogs: StreamLogEntry[];
  eventFeed: EventFeedItem[];
  logActionMessage: string | null;
  savingLogType: LogStreamType | null;
  updateWsDraft: (value: string) => void;
  updateSensorBridgeDraft: (value: string) => void;
  updateSensorInputDraft: (value: string) => void;
  updateRtspControlDraft: (value: string) => void;
  updateRtspUrlDraft: (value: string) => void;
  updateCameraDisplayCount: (value: CameraDisplayCount) => void;
  updateBboxVisible: (value: boolean) => void;
  updateOverlayDisplayMode: (value: OverlayDisplayMode) => void;
  updateHazardPopupDebounceMode: (value: HazardPopupDebounceMode) => void;
  setPopupDurationMs: (value: number) => void;
  setSensorPopupDurationMs: (value: number) => void;
  updateTelegramBotTokenDraft: (value: string) => void;
  updateTelegramChatSelection: (chatId: string, selected: boolean) => void;
  updateTelegramAutoSync: (value: boolean) => void;
  updateTelegramSensorCooldownDraft: (value: string) => void;
  focusChannel: (channelId: number) => void;
  connectSocket: (targetUrl: string, mode?: SocketConnectMode) => void;
  disconnectSocket: () => void;
  connectSensorSocket: (targetUrl: string, mode?: SocketConnectMode) => void;
  disconnectSensorSocket: () => void;
  applyWsUrl: () => void;
  applySensorBridgeUrl: () => void;
  applySensorInputUrl: () => void;
  applyRtspControlUrl: () => void;
  applyRtspUrl: () => void;
  startRtspStream: () => Promise<void>;
  stopRtspStream: () => Promise<void>;
  refreshTelegramSettings: () => Promise<void>;
  syncTelegramChats: () => Promise<void>;
  applyTelegramSettings: () => Promise<void>;
  openChannelPopup: (channelId: number) => void;
  closeChannelPopup: () => void;
  openSensorSnapshotPreview: () => void;
  closeSensorPopup: () => void;
  hideChannel: (channelId: number) => void;
  showChannel: (channelId: number) => void;
  showAllChannels: () => void;
  updateChannelImageNaturalSize: (channelId: number, width: number, height: number) => void;
  saveLogsToServer: (type: LogStreamType) => Promise<void>;
}

export function useIndustrialMonitorRuntime(): IndustrialMonitorRuntime {
  const [wsUrl, setWsUrl] = useState(() => loadStoredWsUrl(DEFAULT_CCTV_WS_URL));
  const [wsDraft, setWsDraft] = useState(() => loadStoredWsUrl(DEFAULT_CCTV_WS_URL));
  const [sensorBridgeUrl, setSensorBridgeUrl] = useState(() => loadStoredSensorUrl(DEFAULT_SENSOR_BRIDGE_WS_URL));
  const [sensorBridgeDraft, setSensorBridgeDraft] = useState(() => loadStoredSensorUrl(DEFAULT_SENSOR_BRIDGE_WS_URL));
  const [sensorInputUrl, setSensorInputUrl] = useState(() => loadStoredSensorUrl(DEFAULT_SENSOR_INPUT_WS_URL));
  const [sensorInputDraft, setSensorInputDraft] = useState(() => loadStoredSensorUrl(DEFAULT_SENSOR_INPUT_WS_URL));
  const [rtspControlUrl, setRtspControlUrl] = useState(() => loadStoredRtspControlUrl(DEFAULT_RTSP_CONTROL_API_URL));
  const [rtspControlDraft, setRtspControlDraft] = useState(() => loadStoredRtspControlUrl(DEFAULT_RTSP_CONTROL_API_URL));
  const [rtspUrl, setRtspUrl] = useState(() => loadStoredRtspUrl(DEFAULT_RTSP_URL));
  const [rtspUrlDraft, setRtspUrlDraft] = useState(() => loadStoredRtspUrl(DEFAULT_RTSP_URL));
  const [rtspPlaybackUrl, setRtspPlaybackUrl] = useState<string | null>(null);
  const [rtspStreamStatus, setRtspStreamStatus] = useState<RtspStreamStatus>('idle');
  const [rtspStreamMessage, setRtspStreamMessage] = useState<string | null>(null);
  const [cameraDisplayCount, setCameraDisplayCount] = useState<CameraDisplayCount>(() => loadStoredCameraDisplayCount(4));
  const [hiddenChannelIds, setHiddenChannelIds] = useState<number[]>([]);
  const [bboxVisible, setBboxVisible] = useState(() => loadStoredBboxVisible(true));
  const [overlayDisplayMode, setOverlayDisplayMode] = useState<OverlayDisplayMode>(() =>
    loadStoredOverlayDisplayMode('alert')
  );
  const [hazardPopupDebounceMode, setHazardPopupDebounceMode] = useState<HazardPopupDebounceMode>(() =>
    loadStoredHazardPopupDebounceMode('recent_three_frames_two_risks')
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
  const [popupSnapshot, setPopupSnapshot] = useState<HazardPopupSnapshot | null>(null);
  const [sensorConnectionStatus, setSensorConnectionStatus] = useState<FrontendStateConnectionStatus>('idle');
  const [sensorReconnectAttempt, setSensorReconnectAttempt] = useState(0);
  const [sensorSettingsMessage, setSensorSettingsMessage] = useState<string | null>(null);
  const [fieldStateMessage, setFieldStateMessage] = useState<string | null>(null);
  const [sensorSnapshot, setSensorSnapshot] = useState<FrontendStateSnapshot | null>(null);
  const [sensorPopupOpen, setSensorPopupOpen] = useState(false);
  const [telegramBotToken, setTelegramBotToken] = useState(() => loadStoredTelegramBotToken());
  const [telegramSettingsMessage, setTelegramSettingsMessage] = useState<string | null>(null);
  const [telegramBotTokenConfigured, setTelegramBotTokenConfigured] = useState(() =>
    Boolean(loadStoredTelegramBotToken())
  );
  const [telegramBotTokenMasked, setTelegramBotTokenMasked] = useState(() =>
    maskTelegramBotToken(loadStoredTelegramBotToken())
  );
  const [telegramBotTokenDraft, setTelegramBotTokenDraft] = useState('');
  const [telegramSelectedChatIds, setTelegramSelectedChatIds] = useState<string[]>(() => loadStoredTelegramChatIds([]));
  const [telegramKnownChats, setTelegramKnownChats] = useState<TelegramKnownChat[]>(() =>
    loadStoredTelegramKnownChats([]).map((entry) => ({
      ...entry,
      selected: loadStoredTelegramChatIds([]).includes(entry.id),
    }))
  );
  const [telegramAutoSync, setTelegramAutoSync] = useState(() => loadStoredTelegramAutoSync(true));
  const [telegramSensorAlertCooldownMs, setTelegramSensorAlertCooldownMs] = useState(() =>
    loadStoredTelegramSensorCooldown(5000)
  );
  const [telegramSensorCooldownDraft, setTelegramSensorCooldownDraft] = useState(() =>
    formatSecondsDraftFromMs(loadStoredTelegramSensorCooldown(5000))
  );
  const [telegramSyncingChats, setTelegramSyncingChats] = useState(false);
  const [telegramSavingSettings, setTelegramSavingSettings] = useState(false);
  const [sensorLogs, setSensorLogs] = useState<StreamLogEntry[]>([]);
  const [cctvLogs, setCctvLogs] = useState<StreamLogEntry[]>([]);
  const [eventFeed, setEventFeed] = useState<EventFeedItem[]>([]);
  const [logActionMessage, setLogActionMessage] = useState<string | null>(null);
  const [savingLogType, setSavingLogType] = useState<LogStreamType | null>(null);
  const rtspControlApiBase = useMemo(
    () => getRtspApiBase(rtspControlUrl, rtspControlDraft, sensorBridgeUrl, sensorBridgeDraft, window.location),
    [rtspControlDraft, rtspControlUrl, sensorBridgeDraft, sensorBridgeUrl]
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
  const recentRiskSamplesRef = useRef<Record<number, HazardRiskSample[]>>({});
  const runtimeMapRef = useRef<Record<number, ChannelRuntimeState>>(createRuntimeMap());
  const hiddenChannelIdsRef = useRef<number[]>([]);
  const manualCloseSocketsRef = useRef(new WeakSet<WebSocket>());
  const manualCloseSensorSocketsRef = useRef(new WeakSet<WebSocket>());
  const telegramLastSensorAlertSentAtRef = useRef(0);
  const latestRiskChannelIdRef = useRef<number | null>(null);
  const latestFrameChannelIdRef = useRef<number | null>(null);
  const lightControlWsRef = useRef<WebSocket | null>(null);
  const lightControlQueueRef = useRef<string[]>([]);
  const lastLightCommandSentRef = useRef<LightControlCommand | null>(null);

  const channelByCameraKey = useMemo(
    () =>
      Object.fromEntries(INDUSTRIAL_MONITOR_CHANNELS.map((channel) => [channel.cameraKey, channel])) as Record<
        string,
        ChannelConfig
      >,
    []
  );

  const channelById = useMemo(
    () =>
      Object.fromEntries(INDUSTRIAL_MONITOR_CHANNELS.map((channel) => [channel.id, channel])) as Record<number, ChannelConfig>,
    []
  );

  const getVisibleChannelIds = useCallback(
    (hiddenIds: number[], displayCount: CameraDisplayCount) =>
      INDUSTRIAL_MONITOR_CHANNELS.filter((channel) => !hiddenIds.includes(channel.id))
        .slice(0, displayCount)
        .map((channel) => channel.id),
    []
  );

  const hazardControlState = useMemo(
    () =>
      deriveHazardControlState({
        sensorSnapshot,
        aiHazardDetected: popupSnapshot?.runtime.alertTier === 'risk',
        latestRiskChannelId: latestRiskChannelIdRef.current,
        latestFrameChannelId: latestFrameChannelIdRef.current,
      }),
    [popupSnapshot, sensorSnapshot]
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

  const appendEventFeedItem = useCallback((item: EventFeedItem) => {
    setEventFeed((prev) => [item, ...prev].slice(0, MAX_EVENT_FEED_ITEMS));
  }, []);

  const flushLightControlQueue = useCallback(() => {
    const socket = lightControlWsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    while (lightControlQueueRef.current.length > 0) {
      const nextPayload = lightControlQueueRef.current.shift();
      if (nextPayload) {
        socket.send(nextPayload);
      }
    }
  }, []);

  const ensureLightControlSocket = useCallback(() => {
    const existing = lightControlWsRef.current;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return existing;
    }

    const socket = new WebSocket(getLightControlWsUrl(rtspControlApiBase));
    socket.onopen = () => {
      appendSensorLog('경광등 제어 WebSocket 연결 성공', `연결 주소: ${socket.url}`);
      flushLightControlQueue();
    };
    socket.onmessage = (event) => {
      appendSensorLog('경광등 제어 WebSocket 응답 수신', `수신 데이터: ${String(event.data)}`);
    };
    socket.onclose = () => {
      appendSensorLog('경광등 제어 WebSocket 종료', `연결 종료: ${socket.url}`);
      if (lightControlWsRef.current === socket) {
        lightControlWsRef.current = null;
      }
    };
    socket.onerror = () => {
      appendSensorLog('경광등 제어 WebSocket 오류', '백엔드 경광등 제어 WebSocket 연결 중 오류가 발생했습니다.');
    };
    lightControlWsRef.current = socket;
    return socket;
  }, [appendSensorLog, flushLightControlQueue, rtspControlApiBase]);

  const sendLightControlCommand = useCallback(
    (command: LightControlCommand, reason: LightControlReason) => {
      if (command === 'off' && lastLightCommandSentRef.current == null) {
        return;
      }

      if (command === lastLightCommandSentRef.current) {
        return;
      }

      lastLightCommandSentRef.current = command;
      const payload = JSON.stringify({
        type: 'light_control',
        command,
        timestamp: new Date().toISOString(),
        reason,
      });
      const socket = ensureLightControlSocket();
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
        return;
      }
      lightControlQueueRef.current.push(payload);
    },
    [ensureLightControlSocket]
  );

  const saveLogsToServer = useCallback(
    async (type: LogStreamType) => {
      const entries = type === 'cctv' ? cctvLogs : sensorLogs;
      if (entries.length === 0) return;

      setSavingLogType(type);
      setLogActionMessage(null);

      try {
        const fileName = downloadRuntimeLogs(type, entries);
        setLogActionMessage(`${getLogTypeLabel(type)} 로그 다운로드 완료 · ${fileName}`);
      } catch (error) {
        setLogActionMessage(
          `${getLogTypeLabel(type)} 로그 다운로드 실패 · ${error instanceof Error ? error.message : '알 수 없는 오류'}`
        );
      } finally {
        setSavingLogType(null);
      }
    },
    [cctvLogs, sensorLogs]
  );

  const persistTelegramSettings = useCallback(
    (nextSettings: {
      botToken: string;
      chatIds: string[];
      knownChats: TelegramKnownChat[];
      autoSync: boolean;
      sensorAlertCooldownMs: number;
    }) => {
      const nextChatIds = Array.from(new Set(nextSettings.chatIds.map(String).filter(Boolean)));
      const nextKnownChats = nextSettings.knownChats.map((entry) => ({
        ...entry,
        selected: nextChatIds.includes(entry.id),
      }));

      setTelegramBotToken(nextSettings.botToken);
      setTelegramBotTokenConfigured(Boolean(nextSettings.botToken));
      setTelegramBotTokenMasked(maskTelegramBotToken(nextSettings.botToken));
      setTelegramSelectedChatIds(nextChatIds);
      setTelegramKnownChats(nextKnownChats);
      setTelegramAutoSync(nextSettings.autoSync);
      setTelegramSensorAlertCooldownMs(nextSettings.sensorAlertCooldownMs);
      setTelegramSensorCooldownDraft(formatSecondsDraftFromMs(nextSettings.sensorAlertCooldownMs));
      setTelegramBotTokenDraft('');

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(TELEGRAM_BOT_TOKEN_STORAGE_KEY, nextSettings.botToken);
        window.localStorage.setItem(TELEGRAM_CHAT_IDS_STORAGE_KEY, JSON.stringify(nextChatIds));
        window.localStorage.setItem(TELEGRAM_KNOWN_CHATS_STORAGE_KEY, JSON.stringify(nextKnownChats));
        window.localStorage.setItem(TELEGRAM_AUTO_SYNC_STORAGE_KEY, String(nextSettings.autoSync));
        window.localStorage.setItem(
          TELEGRAM_SENSOR_COOLDOWN_STORAGE_KEY,
          String(nextSettings.sensorAlertCooldownMs)
        );
      }
    },
    []
  );

  const refreshTelegramSettings = useCallback(async () => {
    setTelegramBotTokenConfigured(Boolean(telegramBotToken));
    setTelegramBotTokenMasked(maskTelegramBotToken(telegramBotToken));
    setTelegramKnownChats((prev) =>
      prev.map((entry) => ({
        ...entry,
        selected: telegramSelectedChatIds.includes(entry.id),
      }))
    );
  }, [telegramBotToken, telegramSelectedChatIds]);

  const relaySensorSnapshotToTelegram = useCallback(
    async (snapshotPayload: Record<string, unknown>) => {
      if (!telegramBotToken || telegramSelectedChatIds.length === 0) {
        return;
      }

      const snapshot = parseFrontendStatePayload(snapshotPayload);
      const caption = buildSensorTelegramCaption(snapshot);
      if (!caption) {
        return;
      }

      const now = Date.now();
      if (now - telegramLastSensorAlertSentAtRef.current < telegramSensorAlertCooldownMs) {
        return;
      }

      try {
        for (const chatId of telegramSelectedChatIds) {
          const response = await fetch(buildTelegramBotApiUrl(telegramBotToken, 'sendMessage'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify({
              chat_id: chatId,
              text: caption,
            }),
          });

          if (!response.ok) {
            throw new Error(`telegram sendMessage failed with status ${response.status}`);
          }
        }
        telegramLastSensorAlertSentAtRef.current = now;
      } catch (error) {
        appendSensorLog(
          '텔레그램 센서 알림 전송 실패',
          error instanceof Error ? error.message : '알 수 없는 오류'
        );
      }
    },
    [appendSensorLog, telegramBotToken, telegramSelectedChatIds, telegramSensorAlertCooldownMs]
  );

  const relayCctvRiskToTelegram = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!telegramBotToken || telegramSelectedChatIds.length === 0) {
        return;
      }

      const { frame, imageSrc: payloadImageSrc } = parseFramePayload(payload);
      const caption = buildCctvTelegramCaption({
        ...payload,
        source_id: frame.sourceId,
        zone_name: frame.zoneName ?? payload.zone_name,
        top_event_ko: frame.topEventKo,
        combined_ko: frame.combinedKo,
      });
      const sourceId = frame.sourceId;
      const channelKey = parseCameraKey(sourceId);
      const channel = channelKey ? channelByCameraKey[channelKey] : null;
      const channelRuntime = channel ? runtimeMapRef.current[channel.id] : null;
      const telegramRuntime: ChannelRuntimeState =
        channelRuntime != null
          ? {
              ...channelRuntime,
              visualFrame: frame,
              latestFrame: frame,
              alertTier: frame.alertTier,
              currentImage: payloadImageSrc ?? channelRuntime.currentImage,
              imageNaturalSize: channelRuntime.imageNaturalSize ?? frame.imageSize,
            }
          : {
              ...EMPTY_INDUSTRIAL_MONITOR_RUNTIME,
              latestFrame: frame,
              visualFrame: frame,
              alertTier: frame.alertTier,
              currentImage: payloadImageSrc,
              imageNaturalSize: frame.imageSize,
            };
      const imageSrc = telegramRuntime.currentImage ?? '';

      try {
        for (const chatId of telegramSelectedChatIds) {
          if (imageSrc) {
            const formData = new FormData();
            formData.append('chat_id', chatId);
            formData.append('caption', caption);
            formData.append(
              'photo',
              await renderTelegramOverlayPhoto(imageSrc, telegramRuntime, bboxVisible, overlayDisplayMode),
              'alert.jpg'
            );

            const response = await fetch(buildTelegramBotApiUrl(telegramBotToken, 'sendPhoto'), {
              method: 'POST',
              body: formData,
            });

            if (!response.ok) {
              throw new Error(`telegram sendPhoto failed with status ${response.status}`);
            }
            continue;
          }

          const response = await fetch(buildTelegramBotApiUrl(telegramBotToken, 'sendMessage'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify({
              chat_id: chatId,
              text: caption,
            }),
          });

          if (!response.ok) {
            throw new Error(`telegram sendMessage failed with status ${response.status}`);
          }
        }
      } catch (error) {
        appendCctvLog(
          '텔레그램 CCTV 알림 전송 실패',
          error instanceof Error ? error.message : '알 수 없는 오류'
        );
      }
    },
    [appendCctvLog, bboxVisible, channelByCameraKey, overlayDisplayMode, telegramBotToken, telegramSelectedChatIds]
  );

  const updateRuntime = useCallback((channelId: number, updater: (prev: ChannelRuntimeState) => ChannelRuntimeState) => {
    setRuntimeMap((prev) => {
      const next = {
        ...prev,
        [channelId]: updater(prev[channelId] ?? { ...EMPTY_INDUSTRIAL_MONITOR_RUNTIME }),
      };
      runtimeMapRef.current = next;
      return next;
    });
  }, []);

  const buildPopupSnapshot = useCallback(
    (channelId: number, runtime: ChannelRuntimeState, summaryOverride?: string): HazardPopupSnapshot => {
      const channel = channelById[channelId] ?? INDUSTRIAL_MONITOR_CHANNELS[0];
      return {
        channelId,
        channelLabel: channel.channel,
        channelTitle: channel.title,
        summary: summaryOverride ?? getFrameSummary(runtime.latestFrame),
        runtime: {
          ...runtime,
          latestFrame: runtime.latestFrame,
          visualFrame: runtime.visualFrame,
        },
      };
    },
    [channelById]
  );

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

  const closePopupState = useCallback(() => {
    popupChannelIdRef.current = null;
    setPopupChannelId(null);
    setPopupSnapshot(null);
  }, []);

  const refreshPopupTimer = useCallback(() => {
    clearPopupTimer();
    popupTimerRef.current = window.setTimeout(() => {
      if (!mountedRef.current) return;
      closePopupState();
    }, popupDurationMs);
  }, [clearPopupTimer, closePopupState, popupDurationMs]);

  const openSensorEmergencyHazardPopup = useCallback(() => {
    const selectedChannelId = selectHazardPopupChannelId(
      latestRiskChannelIdRef.current,
      latestFrameChannelIdRef.current
    );
    if (!selectedChannelId) return;

    const selectedChannel = channelById[selectedChannelId];
    const selectedRuntime = runtimeMapRef.current[selectedChannelId] ?? EMPTY_INDUSTRIAL_MONITOR_RUNTIME;
    if (!selectedChannel || !selectedRuntime.currentImage || selectedRuntime.latestFrame.frameIndex == null) return;
    const sensorRuntime = createSensorPopupRuntime(selectedRuntime);

    clearPopupTimer();
    setFocusedChannelId(selectedChannel.id);
    popupChannelIdRef.current = selectedChannel.id;
    setPopupChannelId(selectedChannel.id);
    setPopupSnapshot(
      buildPopupSnapshot(selectedChannel.id, sensorRuntime, '센서에서 위험이 감지되었습니다!')
    );
    refreshPopupTimer();
  }, [buildPopupSnapshot, channelById, clearPopupTimer, refreshPopupTimer]);

  const disconnectSocket = useCallback(() => {
    clearReconnectTimer();
    clearPopupTimer();
    reconnectAttemptRef.current = 0;
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      manualCloseSocketsRef.current.add(ws);
      ws.close(1000, 'manual disconnect');
    }
    appendCctvLog('CCTV WebSocket 연결 해제', '사용자 요청으로 영상 WebSocket 연결을 종료했습니다.');
    const nextRuntimeMap = createRuntimeMap();
    runtimeMapRef.current = nextRuntimeMap;
    recentRiskSamplesRef.current = {};
    latestRiskChannelIdRef.current = null;
    latestFrameChannelIdRef.current = null;
    popupChannelIdRef.current = null;
    setPopupChannelId(null);
    setPopupSnapshot(null);
    setRuntimeMap(nextRuntimeMap);
  }, [appendCctvLog, clearPopupTimer, clearReconnectTimer]);

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
    setSensorSnapshot(null);
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
          latestFrameChannelIdRef.current = channel.id;

          const nowMs = now.getTime();
          const previousRuntime = runtimeMapRef.current[channel.id] ?? { ...EMPTY_INDUSTRIAL_MONITOR_RUNTIME };
          frameTimesRef.current[channel.id] = [
            ...(frameTimesRef.current[channel.id] ?? []).filter((item) => nowMs - item < 1000),
            nowMs,
          ];
          const alertEligible = isActionableAlert(frame);
          const eventTimestamp = formatLogTimestamp(now);

          const nextRuntime: ChannelRuntimeState = {
            ...previousRuntime,
            connectionStatus: 'connected',
            currentImage: imageSrc ?? previousRuntime.currentImage,
            latestFrame: frame,
            visualFrame: frame,
            alertTier: frame.alertTier,
            alertEligible,
            incomingFps: frameTimesRef.current[channel.id].length,
            lastMessageAt: now,
            topEventFlash: alertEligible,
            errorMessage: null,
          };

          runtimeMapRef.current = {
            ...runtimeMapRef.current,
            [channel.id]: nextRuntime,
          };
          updateRuntime(channel.id, () => nextRuntime);

          if (frame.alertTier !== 'normal' || frame.eventsKo.length > 0) {
            appendEventFeedItem({
              id: createLogId(),
              channelId: channel.id,
              channelLabel: channel.channel,
              channelTitle: channel.title,
              alertTier: frame.alertTier === 'risk' ? 'risk' : 'caution',
              summary: getFrameSummary(frame),
              frameIndex: frame.frameIndex,
              objectCount: frame.objects.length,
              sourceId: frame.sourceId,
              timestamp: eventTimestamp,
            });
          }

          const nextSamples = [
            ...(recentRiskSamplesRef.current[channel.id] ?? []).filter(
              (sample) => nowMs - sample.atMs <= HAZARD_QUALIFICATION_WINDOW_MS
            ),
            {
              atMs: nowMs,
              isRisk: frame.alertTier === 'risk',
              severity: frame.alertTier === 'risk' ? 'risk' : 'normal',
            } satisfies HazardRiskSample,
          ].slice(-3);
          recentRiskSamplesRef.current[channel.id] = nextSamples;

          const qualifiesForPopup =
            frame.alertTier === 'risk' &&
            (isImmediateSevereFrame(frame) ||
              evaluateHazardQualification(nextSamples, hazardPopupDebounceMode, HAZARD_QUALIFICATION_WINDOW_MS));
          if (qualifiesForPopup) {
            latestRiskChannelIdRef.current = channel.id;
          }

          const currentSensorGateState = getSensorGateState(sensorSnapshot).sensorGateState;
          const shouldBlockPopup = currentSensorGateState === 'approved_nearest';
          const shouldRelayCctvRisk =
            qualifiesForPopup &&
            !shouldBlockPopup &&
            popupChannelIdRef.current == null;

          if (
            qualifiesForPopup &&
            !shouldBlockPopup &&
            (popupChannelIdRef.current == null || popupChannelIdRef.current === channel.id)
          ) {
            if (popupChannelIdRef.current == null) {
              setFocusedChannelId(channel.id);
            }

            if (shouldRelayCctvRisk) {
              void relayCctvRiskToTelegram(payload);
            }

            popupChannelIdRef.current = channel.id;
            setPopupChannelId(channel.id);
            setPopupSnapshot(buildPopupSnapshot(channel.id, nextRuntime));
            refreshPopupTimer();
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
    [
      appendCctvLog,
      appendEventFeedItem,
      buildPopupSnapshot,
      channelByCameraKey,
      clearReconnectTimer,
      hazardPopupDebounceMode,
      relayCctvRiskToTelegram,
      refreshPopupTimer,
      sensorSnapshot,
      updateRuntime,
    ]
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
          const nextHazardState = deriveHazardControlState({
            sensorSnapshot: nextSnapshot,
            aiHazardDetected: popupSnapshot?.runtime.alertTier === 'risk',
            latestRiskChannelId: latestRiskChannelIdRef.current,
            latestFrameChannelId: latestFrameChannelIdRef.current,
          });
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

          if (
            nextSnapshot.workers.some(
              (worker) =>
                worker.approved === false &&
                (worker.isWarning || worker.isEmergency || worker.zoneStatus === 'danger')
            )
          ) {
            void relaySensorSnapshotToTelegram(payload);
          }

          if (nextHazardState.sensorGateState === 'approved_nearest') {
            clearPopupTimer();
            closePopupState();
            clearSensorPopupTimer();
            setSensorPopupOpen(false);
            continue;
          }

          if (nextHazardState.sensorGateState === 'unapproved_nearest') {
            openSensorEmergencyHazardPopup();
          }
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
    [
      appendSensorLog,
      clearPopupTimer,
      clearSensorPopupTimer,
      clearSensorReconnectTimer,
      closePopupState,
      openSensorEmergencyHazardPopup,
      popupSnapshot,
      relaySensorSnapshotToTelegram,
    ]
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
      if (
        lightControlWsRef.current &&
        (lightControlWsRef.current.readyState === WebSocket.OPEN ||
          lightControlWsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        lightControlWsRef.current.close(1000, 'component unmount');
      }
    };
  }, [clearPopupTimer, clearReconnectTimer, clearSensorPopupTimer, clearSensorReconnectTimer]);

  useEffect(() => {
    if (hazardControlState.sensorGateState === 'approved_nearest' && popupSnapshot) {
      clearPopupTimer();
      closePopupState();
      clearSensorPopupTimer();
      setSensorPopupOpen(false);
    }

    sendLightControlCommand(hazardControlState.lightCommand, hazardControlState.popupReason);
  }, [
    clearPopupTimer,
    clearSensorPopupTimer,
    closePopupState,
    hazardControlState.lightCommand,
    hazardControlState.popupReason,
    hazardControlState.sensorGateState,
    popupSnapshot,
    sendLightControlCommand,
  ]);

  const updateWsDraft = useCallback((value: string) => {
    setWsDraft(value);
    setConfigMessage(null);
  }, []);

  const updateSensorBridgeDraft = useCallback((value: string) => {
    setSensorBridgeDraft(value);
    setSensorSettingsMessage(null);
  }, []);

  const updateSensorInputDraft = useCallback((value: string) => {
    setSensorInputDraft(value);
    setSensorSettingsMessage(null);
  }, []);

  const updateRtspControlDraft = useCallback((value: string) => {
    setRtspControlDraft(value);
    setRtspStreamMessage(null);
  }, []);

  const updateRtspUrlDraft = useCallback((value: string) => {
    setRtspUrlDraft(value);
    setRtspStreamMessage(null);
  }, []);

  const updateTelegramBotTokenDraft = useCallback((value: string) => {
    setTelegramBotTokenDraft(value);
    setTelegramSettingsMessage(null);
  }, []);

  const updateTelegramChatSelection = useCallback((chatId: string, selected: boolean) => {
    setTelegramSelectedChatIds((prev) =>
      selected ? Array.from(new Set([...prev, chatId])) : prev.filter((entry) => entry !== chatId)
    );
    setTelegramKnownChats((prev) =>
      prev.map((entry) => (entry.id === chatId ? { ...entry, selected } : entry))
    );
    setTelegramSettingsMessage(null);
  }, []);

  const updateTelegramAutoSync = useCallback((value: boolean) => {
    setTelegramAutoSync(value);
    setTelegramSettingsMessage(null);
  }, []);

  const updateTelegramSensorCooldownDraft = useCallback((value: string) => {
    setTelegramSensorCooldownDraft(value);
    setTelegramSettingsMessage(null);
  }, []);

  const updateCameraDisplayCount = useCallback(
    (value: CameraDisplayCount) => {
      setCameraDisplayCount(value);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(CAMERA_DISPLAY_COUNT_STORAGE_KEY, String(value));
      }

      const visibleChannelIds = getVisibleChannelIds(hiddenChannelIdsRef.current, value);
      if (visibleChannelIds.length > 0 && !visibleChannelIds.includes(focusedChannelId)) {
        setFocusedChannelId(visibleChannelIds[0]);
      }
    },
    [focusedChannelId, getVisibleChannelIds]
  );

  const updateOverlayDisplayMode = useCallback((value: OverlayDisplayMode) => {
    setOverlayDisplayMode(value);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(OVERLAY_DISPLAY_MODE_STORAGE_KEY, value);
    }
  }, []);

  const updateHazardPopupDebounceMode = useCallback((value: HazardPopupDebounceMode) => {
    setHazardPopupDebounceMode(value);
    recentRiskSamplesRef.current = {};
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(HAZARD_POPUP_DEBOUNCE_MODE_STORAGE_KEY, value);
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
    setSensorBridgeUrl(nextUrl);
    setSensorSettingsMessage('센서 브리지 주소를 저장했습니다.');
  }, [sensorBridgeDraft]);

  const applySensorInputUrl = useCallback(() => {
    const error = validateSocketUrl(sensorInputDraft);
    if (error) {
      setSensorSettingsMessage(error);
      return;
    }

    const nextUrl = sensorInputDraft.trim();
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SENSOR_INPUT_WS_STORAGE_KEY, nextUrl);
    }
    disconnectSensorSocket();
    setSensorInputUrl(nextUrl);
    setSensorSettingsMessage('센서 입력 WebSocket 주소를 저장했습니다.');
    window.setTimeout(() => connectSensorSocket(nextUrl), 0);
  }, [connectSensorSocket, disconnectSensorSocket, sensorInputDraft]);

  const applyRtspUrl = useCallback(() => {
    const nextUrl = rtspUrlDraft.trim();
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RTSP_URL_STORAGE_KEY, nextUrl);
    }
    setRtspUrl(nextUrl);
    setRtspStreamMessage(nextUrl ? 'RTSP 주소를 저장했습니다.' : 'RTSP 주소를 비웠습니다.');
  }, [rtspUrlDraft]);

  const applyRtspControlUrl = useCallback(() => {
    const nextUrl = normalizeHttpApiBase(rtspControlDraft.trim(), typeof window !== 'undefined' ? window.location : undefined);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RTSP_CONTROL_API_STORAGE_KEY, nextUrl);
    }
    setRtspControlUrl(nextUrl);
    setRtspControlDraft(nextUrl);
    setRtspStreamMessage(nextUrl ? 'RTSP 제어 주소를 저장했습니다.' : 'RTSP 제어 주소를 비웠습니다.');
  }, [rtspControlDraft]);

  const syncTelegramChats = useCallback(async () => {
    setTelegramSyncingChats(true);
    setTelegramSettingsMessage(null);

    try {
      const nextBotToken = telegramBotTokenDraft.trim() || telegramBotToken.trim();
      if (!nextBotToken) {
        throw new Error('Telegram Bot Token을 먼저 입력해주세요.');
      }

      const response = await fetch(buildTelegramBotApiUrl(nextBotToken, 'getUpdates'), {
        method: 'GET',
      });
      const payload = await response.json();
      if (!response.ok || payload?.ok === false) {
        throw new Error(
          typeof payload?.description === 'string' ? payload.description : '채팅방 찾기에 실패했습니다.'
        );
      }

      const selectedSet = new Set(telegramSelectedChatIds);
      const knownChatsMap = new Map(telegramKnownChats.map((entry) => [entry.id, entry]));
      const updates = Array.isArray(payload?.result) ? payload.result : [];

      for (const update of updates) {
        const chat = extractTelegramChat(update as Record<string, unknown>);
        if (!chat) continue;
        knownChatsMap.set(chat.id, {
          ...chat,
          selected: selectedSet.has(chat.id),
        });
      }

      const nextKnownChats = Array.from(knownChatsMap.values());
      setTelegramKnownChats(nextKnownChats);
      setTelegramSettingsMessage('텔레그램 채팅방 목록을 찾았습니다.');
    } catch (error) {
      setTelegramSettingsMessage(error instanceof Error ? error.message : '채팅방 찾기에 실패했습니다.');
    } finally {
      setTelegramSyncingChats(false);
    }
  }, [telegramBotToken, telegramBotTokenDraft, telegramKnownChats, telegramSelectedChatIds]);

  const applyTelegramSettings = useCallback(async () => {
    setTelegramSavingSettings(true);
    setTelegramSettingsMessage(null);

    try {
      const nextBotToken = telegramBotTokenDraft.trim() || telegramBotToken.trim();
      const nextCooldownMs = parseSecondsDraftToMs(telegramSensorCooldownDraft, telegramSensorAlertCooldownMs);
      persistTelegramSettings({
        botToken: nextBotToken,
        chatIds: telegramSelectedChatIds,
        knownChats: telegramKnownChats,
        autoSync: telegramAutoSync,
        sensorAlertCooldownMs: nextCooldownMs,
      });
      setTelegramSettingsMessage('텔레그램 설정을 저장했습니다.');
    } catch (error) {
      setTelegramSettingsMessage(error instanceof Error ? error.message : '텔레그램 설정 저장에 실패했습니다.');
    } finally {
      setTelegramSavingSettings(false);
    }
  }, [
    persistTelegramSettings,
    telegramBotToken,
    telegramAutoSync,
    telegramBotTokenDraft,
    telegramKnownChats,
    telegramSelectedChatIds,
    telegramSensorAlertCooldownMs,
    telegramSensorCooldownDraft,
  ]);

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
      const response = await fetch(`${rtspControlApiBase}/rtsp/start`, {
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

      const playbackUrl = typeof result.playbackUrl === 'string'
        ? getRtspPlaybackSrc(result.playbackUrl, rtspControlApiBase, window.location)
        : getRtspPlaybackSrc(`${rtspControlApiBase}/rtsp/frame.jpg`, rtspControlApiBase, window.location);
      setRtspPlaybackUrl(playbackUrl);
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
  }, [rtspControlApiBase, rtspUrlDraft, syncRtspRuntime, updateRuntime]);

  const stopRtspStream = useCallback(async () => {
    try {
      await fetch(`${rtspControlApiBase}/rtsp/stop`, { method: 'POST' });
    } catch {
      // Keep local state consistent even if the stop call fails.
    }
    setRtspPlaybackUrl(null);
    setRtspStreamStatus('stopped');
    setRtspStreamMessage('RTSP 스트림을 중지했습니다.');
    syncRtspRuntime('stopped');
  }, [rtspControlApiBase, syncRtspRuntime]);

  const openChannelPopup = useCallback((channelId: number) => {
    clearPopupTimer();
    setFocusedChannelId(channelId);
    popupChannelIdRef.current = channelId;
    setPopupChannelId(channelId);
    const runtime = runtimeMapRef.current[channelId] ?? { ...EMPTY_INDUSTRIAL_MONITOR_RUNTIME };
    setPopupSnapshot(buildPopupSnapshot(channelId, runtime));
  }, [buildPopupSnapshot, clearPopupTimer]);

  const focusChannel = useCallback((channelId: number) => {
    setFocusedChannelId(channelId);
  }, []);

  const closeChannelPopup = useCallback(() => {
    clearPopupTimer();
    closePopupState();
  }, [clearPopupTimer, closePopupState]);

  const openSensorSnapshotPreview = useCallback(() => {
    clearSensorPopupTimer();
    setSensorPopupOpen(true);
    setFieldStateMessage(sensorSnapshot ? null : '아직 수신된 현장 상태 스냅샷이 없습니다.');
  }, [clearSensorPopupTimer, sensorSnapshot]);

  const closeSensorPopup = useCallback(() => {
    clearSensorPopupTimer();
    setSensorPopupOpen(false);
  }, [clearSensorPopupTimer]);

  const hideChannel = useCallback(
    (channelId: number) => {
      setHiddenChannelIds((prev) => {
        if (prev.includes(channelId)) return prev;

        const next = [...prev, channelId];
        hiddenChannelIdsRef.current = next;
        const visibleChannelIds = getVisibleChannelIds(next, cameraDisplayCount);
        if (visibleChannelIds.length > 0 && !visibleChannelIds.includes(focusedChannelId)) {
          setFocusedChannelId(visibleChannelIds[0]);
        }
        return next;
      });
    },
    [cameraDisplayCount, focusedChannelId, getVisibleChannelIds]
  );

  const showChannel = useCallback((channelId: number) => {
    setHiddenChannelIds((prev) => {
      const next = prev.filter((entry) => entry !== channelId);
      hiddenChannelIdsRef.current = next;
      return next;
    });
  }, []);

  const showAllChannels = useCallback(() => {
    hiddenChannelIdsRef.current = [];
    setHiddenChannelIds([]);
  }, []);

  useEffect(() => {
    syncRtspRuntime(rtspStreamStatus);
  }, [rtspStreamStatus, syncRtspRuntime]);

  return {
    wsUrl,
    wsDraft,
    sensorBridgeUrl,
    sensorBridgeDraft,
    sensorInputUrl,
    sensorInputDraft,
    rtspControlUrl: rtspControlApiBase,
    rtspControlDraft,
    rtspUrl,
    rtspUrlDraft,
    rtspPlaybackUrl,
    rtspStreamStatus,
    rtspStreamMessage,
    cameraDisplayCount,
    hiddenChannelIds,
    bboxVisible,
    overlayDisplayMode,
    hazardPopupDebounceMode,
    popupDurationMs,
    sensorPopupDurationMs,
    runtimeMap,
    configMessage,
    focusedChannelId,
    popupChannelId,
    popupSnapshot,
    nearestSensorWorker: hazardControlState.nearestSensorWorker,
    sensorGateState: hazardControlState.sensorGateState,
    effectiveHazardState: hazardControlState.effectiveHazardState,
    latestRiskChannelId: latestRiskChannelIdRef.current,
    latestFrameChannelId: latestFrameChannelIdRef.current,
    sensorConnectionStatus,
    sensorReconnectAttempt,
    sensorSettingsMessage,
    fieldStateMessage,
    sensorSnapshot,
    sensorPopupOpen,
    telegramSettingsMessage,
    telegramBotTokenConfigured,
    telegramBotTokenMasked,
    telegramBotTokenDraft,
    telegramKnownChats,
    telegramSelectedChatIds,
    telegramAutoSync,
    telegramSensorAlertCooldownMs,
    telegramSensorCooldownDraft,
    telegramSyncingChats,
    telegramSavingSettings,
    sensorLogs,
    cctvLogs,
    eventFeed,
    logActionMessage,
    savingLogType,
    updateWsDraft,
    updateSensorBridgeDraft,
    updateSensorInputDraft,
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
    setPopupDurationMs,
    setSensorPopupDurationMs,
    focusChannel,
    connectSocket,
    disconnectSocket,
    connectSensorSocket,
    disconnectSensorSocket,
    applyWsUrl,
    applySensorBridgeUrl,
    applySensorInputUrl,
    applyRtspControlUrl,
    applyRtspUrl,
    startRtspStream,
    stopRtspStream,
    refreshTelegramSettings,
    syncTelegramChats,
    applyTelegramSettings,
    openChannelPopup,
    closeChannelPopup,
    openSensorSnapshotPreview,
    closeSensorPopup,
    hideChannel,
    showChannel,
    showAllChannels,
    updateChannelImageNaturalSize,
    saveLogsToServer,
  };
}
