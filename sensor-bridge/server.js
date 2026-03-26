import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';

const LOG_DIR_URL = new URL('../runtime-logs/', import.meta.url);
const RTSP_FRAME_DIR_URL = new URL('../runtime-rtsp/', import.meta.url);
const CONFIG_DIR_PATH = 'runtime-config';
const TELEGRAM_SETTINGS_FILE_PATH = `${CONFIG_DIR_PATH}/telegram-settings.json`;
const LIGHT_CONTROL_HOST = '192.168.10.7';
const LIGHT_CONTROL_PORT = 8888;
const AI_ALERT_LEVEL_PRIORITY = {
  INFO: 1,
  SAFE: 1,
  CAUTION: 2,
  WARNING: 3,
  RISK: 4,
  DANGER: 5,
  EMERGENCY: 6,
};

function ensureObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value;
}

function ensureString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value.trim();
}

function ensureBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean`);
  }

  return value;
}

function ensureNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }

  return value;
}

function ensureOptionalNumber(value, label) {
  if (value == null) {
    return null;
  }

  return ensureNumber(value, label);
}

function ensureLightControlCommand(value) {
  if (value !== 'on' && value !== 'off') {
    throw new Error('command must be on or off');
  }

  return value;
}

function ensureZoneStatus(value) {
  if (value !== 'safe' && value !== 'caution' && value !== 'danger') {
    throw new Error('zone_status must be safe, caution, or danger');
  }
}

function ensureLogType(value) {
  if (value !== 'cctv' && value !== 'sensor') {
    throw new Error('type must be cctv or sensor');
  }

  return value;
}

function ensureLogEntries(value) {
  if (!Array.isArray(value)) {
    throw new Error('entries must be an array');
  }

  return value.map((entry, index) => {
    const record = ensureObject(entry, `entry[${index}]`);
    return {
      timestamp: ensureString(record.timestamp, `entry[${index}].timestamp`),
      summary: ensureString(record.summary, `entry[${index}].summary`),
      detail: typeof record.detail === 'string' ? record.detail : '',
    };
  });
}

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Private-Network': 'true',
  };
}

function validateLightControlPayload(payload) {
  const root = ensureObject(payload, 'payload');
  const type = ensureString(root.type, 'type');
  if (type !== 'light_control') {
    throw new Error('type must be light_control');
  }

  return {
    type,
    command: ensureLightControlCommand(root.command),
    timestamp: ensureString(root.timestamp, 'timestamp'),
  };
}

function toHttpUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol === 'wss:') parsed.protocol = 'https:';
  if (parsed.protocol === 'ws:') parsed.protocol = 'http:';
  return parsed.toString().replace(/\/$/, '');
}

function formatDatePart(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimePart(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}-${minutes}-${seconds}`;
}

export function buildRuntimeLogFileContent(entries) {
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

export async function saveRuntimeLogFile({
  type,
  entries,
  mkdirImpl = mkdir,
  writeFileImpl = writeFile,
  now = new Date(),
} = {}) {
  const safeType = ensureLogType(type);
  const safeEntries = ensureLogEntries(entries);
  const fileName = `${safeType}-log-${formatDatePart(now)}_${formatTimePart(now)}.txt`;
  const fileUrl = new URL(fileName, LOG_DIR_URL);
  const content = buildRuntimeLogFileContent(safeEntries);

  await mkdirImpl(LOG_DIR_URL, { recursive: true });
  await writeFileImpl(fileUrl, content, 'utf8');

  return {
    fileName,
    savedPath: `runtime-logs/${fileName}`,
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...getCorsHeaders(),
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, body, contentType) {
  response.writeHead(statusCode, {
    'Content-Type': contentType,
    ...getCorsHeaders(),
  });
  response.end(body);
}

async function readRequestJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return JSON.parse(raw || '{}');
}

export function createLogRequestHandler({ logger = console } = {}) {
  return async function handleRequest(request, response) {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        ...getCorsHeaders(),
      });
      response.end();
      return;
    }

    if (request.method !== 'POST' || request.url !== '/logs') {
      sendJson(response, 404, { error: 'not_found' });
      return;
    }

    try {
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      const raw = Buffer.concat(chunks).toString('utf8').trim();
      const payload = JSON.parse(raw || '{}');
      const result = await saveRuntimeLogFile(payload);
      sendJson(response, 200, result);
    } catch (error) {
      logger.error('failed to save runtime logs', error);
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : 'failed_to_save_logs',
      });
    }
  };
}

function validateFrontendStatePayload(payload) {
  const root = ensureObject(payload, 'payload');
  const type = ensureString(root.type, 'type');
  if (type !== 'frontend_state') {
    throw new Error('payload type must be frontend_state');
  }

  ensureString(root.timestamp, 'timestamp');

  const system = ensureObject(root.system, 'system');
  const zoneRule = ensureObject(system.zone_rule, 'zone_rule');
  ensureBoolean(system.sensor_server_online, 'sensor_server_online');
  ensureNumber(zoneRule.caution_distance_m, 'caution_distance_m');
  ensureNumber(zoneRule.danger_distance_m, 'danger_distance_m');

  if (!Array.isArray(root.workers)) {
    throw new Error('workers must be an array');
  }

  for (const worker of root.workers) {
    const record = ensureObject(worker, 'worker');
    ensureNumber(record.tag_id, 'tag_id');
    ensureString(record.name, 'name');
    ensureBoolean(record.approved, 'approved');
    ensureBoolean(record.connected, 'connected');
    ensureNumber(record.x, 'x');
    ensureNumber(record.y, 'y');
    ensureNumber(record.distance_m, 'distance_m');
    ensureZoneStatus(record.zone_status);
    ensureBoolean(record.is_warning, 'is_warning');
    ensureBoolean(record.is_emergency, 'is_emergency');
    ensureString(record.last_update, 'last_update');
  }

  return root;
}

export function createBridgeMessage(buffer) {
  const raw = buffer.toString('utf8').trim();
  const parsed = JSON.parse(raw);
  validateFrontendStatePayload(parsed);
  return JSON.stringify(parsed);
}

function ensureAiPacketRoot(payload) {
  return ensureObject(payload, 'payload');
}

function normalizeAlertLevel(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  return value.trim().toUpperCase();
}

function levelToPriority(level) {
  return AI_ALERT_LEVEL_PRIORITY[level] ?? 0;
}

function getHighestAiEvent(root) {
  const groups = Array.isArray(root.event_object_groups) ? root.event_object_groups : [];
  let highest = null;

  for (const group of groups) {
    const record = ensureObject(group, 'event_object_group');
    const event = ensureObject(record.event, 'event_object_group.event');
    const level = normalizeAlertLevel(event.level);
    const severity = ensureOptionalNumber(event.severity, 'event_object_group.event.severity');
    const priority = severity ?? (level ? levelToPriority(level) : 0);

    if (!highest || priority > highest.priority) {
      highest = {
        level: level ?? 'UNKNOWN',
        severity,
        priority,
      };
    }
  }

  return highest;
}

function countObjectsByLabel(root, label) {
  const objects = Array.isArray(root.objects) ? root.objects : [];
  return objects.filter((entry) => ensureObject(entry, 'object').label === label).length;
}

function formatAlertTimestamp(reportWallTsMs) {
  if (typeof reportWallTsMs !== 'number' || !Number.isFinite(reportWallTsMs)) {
    return null;
  }

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Seoul',
  }).format(new Date(reportWallTsMs));
}

function formatIsoTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Seoul',
  }).format(date);
}

function decodeBase64Image(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const base64 = value.includes(',') ? value.split(',').at(-1) : value;
  return Buffer.from(base64, 'base64');
}

function buildAiAlertCaption(root, highestEvent) {
  const sourceId = typeof root.sourceID === 'string' ? root.sourceID : 'unknown-source';
  const timestamp = formatAlertTimestamp(root.report_wall_ts_ms);
  const personCount = countObjectsByLabel(root, 'person');
  const machineryCount = countObjectsByLabel(root, 'machinery');
  const summary =
    (typeof root.top_event_ko === 'string' && root.top_event_ko.trim()) ||
    (typeof root.combined_ko === 'string' && root.combined_ko.trim()) ||
    '현장 위험 이벤트 감지';

  const lines = [
    '[굴착기 AI 위험 알림]',
    `카메라: ${sourceId}`,
    `위험도: ${highestEvent.level}`,
  ];

  if (timestamp) {
    lines.push(`시간: ${timestamp}`);
  }

  lines.push(`요약: ${summary}`);
  lines.push(`탐지: 작업자 ${personCount}명 / 중장비 ${machineryCount}대`);
  return lines.join('\n');
}

export function createAiAlertMessage(buffer) {
  const raw = buffer.toString('utf8').trim();
  const parsed = JSON.parse(raw || '{}');
  const root = ensureAiPacketRoot(parsed);
  const highestEvent = getHighestAiEvent(root);

  if (!highestEvent || highestEvent.priority < AI_ALERT_LEVEL_PRIORITY.RISK) {
    return {
      shouldSend: false,
      caption: '',
      photoBuffer: null,
      level: highestEvent?.level ?? null,
      sourceId: typeof root.sourceID === 'string' ? root.sourceID : null,
    };
  }

  return {
    shouldSend: true,
    caption: buildAiAlertCaption(root, highestEvent),
    photoBuffer: decodeBase64Image(root.image_jpeg_base64),
    level: highestEvent.level,
    sourceId: typeof root.sourceID === 'string' ? root.sourceID : null,
  };
}

export function createLightControlBridge({
  host = LIGHT_CONTROL_HOST,
  port = LIGHT_CONTROL_PORT,
  createConnection = net.createConnection,
  logger = console,
} = {}) {
  let lastCommand = null;

  return {
    async relay(payload) {
      const validatedPayload = validateLightControlPayload(payload);
      if (validatedPayload.command === lastCommand) {
        return {
          delivered: false,
          deduplicated: true,
          command: validatedPayload.command,
        };
      }

      await new Promise((resolve, reject) => {
        const socket = createConnection({ host, port });
        let settled = false;

        const settle = (callback, value) => {
          if (settled) return;
          settled = true;
          callback(value);
        };

        socket.once?.('error', (error) => {
          logger.error('failed to send light control command', error);
          settle(reject, error);
        });
        socket.once?.('connect', () => {
          socket.write(JSON.stringify(validatedPayload), (error) => {
            if (error) {
              settle(reject, error);
              return;
            }
            socket.end();
            settle(resolve);
          });
        });
      });

      lastCommand = validatedPayload.command;
      return {
        delivered: true,
        deduplicated: false,
        command: validatedPayload.command,
      };
    },
  };
}

export function attachLightControlWebSocketServer({
  httpServer,
  lightControlBridge,
  logger = console,
  path = '/ws/light-control',
  createWebSocketServer = (options) => new WebSocketServer(options),
} = {}) {
  if (!httpServer || !lightControlBridge) {
    return { close() {} };
  }

  const webSocketServer = createWebSocketServer({ noServer: true });

  httpServer.on?.('upgrade', (request, socket, head) => {
    const requestUrl = new URL(request.url || '/', 'http://localhost');
    if (requestUrl.pathname !== path) {
      socket.destroy();
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (client) => {
      webSocketServer.emit('connection', client, request);
    });
  });

  webSocketServer.on('connection', (client) => {
    const remoteAddress = client._socket?.remoteAddress || 'unknown';
    logger.info(`light control websocket connected from ${remoteAddress}`);

    client.on('message', async (raw) => {
      try {
        logger.info(`light control websocket message received (${String(raw).length} bytes)`);
        const payload = JSON.parse(String(raw));
        const result = await lightControlBridge.relay(payload);
        logger.info(
          `light control websocket message processed: command=${result.command}, delivered=${result.delivered}, deduplicated=${result.deduplicated}`
        );
        client.send(JSON.stringify({ ok: true, ...result }));
      } catch (error) {
        logger.error('light control websocket request failed', error);
        client.send(
          JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : 'light_control_failed',
          })
        );
      }
    });
  });

  return {
    close() {
      webSocketServer.close();
    },
  };
}

function parseTelegramChatIds(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(/[,\s]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

function sanitizeTelegramCooldown(value, fallback = 5000) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.round(value));
}

function parseTelegramCooldownInput(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function normalizeTelegramKnownChat(entry, selectedChatIds = []) {
  const record = ensureObject(entry, 'telegram_known_chat');
  const id = ensureString(String(record.id), 'telegram_known_chat.id');
  const type = typeof record.type === 'string' && record.type.trim() ? record.type.trim() : 'unknown';
  const title = typeof record.title === 'string' && record.title.trim() ? record.title.trim() : id;

  return {
    id,
    type,
    title,
    selected: selectedChatIds.includes(id),
  };
}

function createDefaultTelegramSettings(overrides = {}) {
  const selectedChatIds = Array.isArray(overrides.chatIds) ? overrides.chatIds.map(String) : [];
  const knownChatsInput = Array.isArray(overrides.knownChats) ? overrides.knownChats : [];

  return {
    botToken: typeof overrides.botToken === 'string' ? overrides.botToken.trim() : '',
    chatIds: Array.from(new Set(selectedChatIds.filter(Boolean))),
    autoSync: typeof overrides.autoSync === 'boolean' ? overrides.autoSync : true,
    sensorAlertCooldownMs: sanitizeTelegramCooldown(overrides.sensorAlertCooldownMs, 5000),
    knownChats: knownChatsInput.map((entry) => normalizeTelegramKnownChat(entry, selectedChatIds)),
  };
}

function maskTelegramBotToken(botToken) {
  if (typeof botToken !== 'string' || !botToken.trim()) {
    return '';
  }

  const token = botToken.trim();
  if (token.length <= 8) {
    return '*'.repeat(token.length);
  }

  return `${token.slice(0, 4)}${'*'.repeat(Math.max(4, token.length - 8))}${token.slice(-4)}`;
}

function buildTelegramChatTitle(chat) {
  if (!chat || typeof chat !== 'object') {
    return 'Unknown chat';
  }

  if (typeof chat.title === 'string' && chat.title.trim()) {
    return chat.title.trim();
  }

  const names = [chat.first_name, chat.last_name]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim());

  if (names.length > 0) {
    return names.join(' ');
  }

  if (typeof chat.username === 'string' && chat.username.trim()) {
    return `@${chat.username.trim()}`;
  }

  return String(chat.id ?? 'Unknown chat');
}

function extractTelegramChatId(update) {
  const candidates = [
    update?.message?.chat?.id,
    update?.edited_message?.chat?.id,
    update?.channel_post?.chat?.id,
    update?.edited_channel_post?.chat?.id,
    update?.my_chat_member?.chat?.id,
    update?.chat_member?.chat?.id,
    update?.chat_join_request?.chat?.id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' || typeof candidate === 'string') {
      return String(candidate);
    }
  }

  return null;
}

function extractTelegramChat(update) {
  const candidates = [
    update?.message?.chat,
    update?.edited_message?.chat,
    update?.channel_post?.chat,
    update?.edited_channel_post?.chat,
    update?.my_chat_member?.chat,
    update?.chat_member?.chat,
    update?.chat_join_request?.chat,
  ];

  for (const candidate of candidates) {
    if (candidate && (typeof candidate.id === 'number' || typeof candidate.id === 'string')) {
      return {
        id: String(candidate.id),
        type: typeof candidate.type === 'string' && candidate.type.trim() ? candidate.type.trim() : 'unknown',
        title: buildTelegramChatTitle(candidate),
      };
    }
  }

  return null;
}

export function createTelegramChatRegistry({
  initialChatIds = [],
  fetchImpl = fetch,
  logger = console,
} = {}) {
  const chatIds = new Set(initialChatIds.map((entry) => String(entry).trim()).filter(Boolean));
  const knownChats = new Map();
  let nextOffset = 0;

  return {
    async sync(botToken) {
      if (!botToken) {
        return {
          chatIds: Array.from(chatIds),
          knownChats: Array.from(knownChats.values()),
        };
      }

      try {
        const response = await fetchImpl(
          `https://api.telegram.org/bot${botToken}/getUpdates?offset=${nextOffset}&timeout=0`,
          {
            method: 'GET',
          }
        );

        if (!response.ok) {
          throw new Error(`telegram getUpdates failed with status ${response.status}`);
        }

        const payload = await response.json();
        const updates = Array.isArray(payload?.result) ? payload.result : [];
        let maxUpdateId = nextOffset - 1;

        for (const update of updates) {
          const chat = extractTelegramChat(update);
          if (chat) {
            chatIds.add(chat.id);
            knownChats.set(chat.id, chat);
          }

          if (typeof update?.update_id === 'number') {
            maxUpdateId = Math.max(maxUpdateId, update.update_id);
          }
        }

        if (maxUpdateId >= nextOffset) {
          nextOffset = maxUpdateId + 1;
        }
      } catch (error) {
        logger.error('failed to sync telegram chats', error);
      }

      return {
        chatIds: Array.from(chatIds),
        knownChats: Array.from(knownChats.values()),
      };
    },

    getChatIds() {
      return Array.from(chatIds);
    },

    getKnownChats() {
      return Array.from(knownChats.values());
    },
  };
}

export function createTelegramSettingsStore({
  settingsFileUrl = TELEGRAM_SETTINGS_FILE_PATH,
  initialSettings = {},
  mkdirImpl = mkdir,
  readFileImpl = readFile,
  writeFileImpl = writeFile,
  logger = console,
} = {}) {
  let settings = createDefaultTelegramSettings(initialSettings);
  let readyPromise = null;

  async function save() {
    await mkdirImpl(CONFIG_DIR_PATH, { recursive: true });
    await writeFileImpl(settingsFileUrl, JSON.stringify(settings, null, 2), 'utf8');
  }

  return {
    async initialize() {
      if (!readyPromise) {
        readyPromise = (async () => {
          try {
            const raw = await readFileImpl(settingsFileUrl, 'utf8');
            const parsed = JSON.parse(raw);
            settings = createDefaultTelegramSettings({
              ...initialSettings,
              ...parsed,
            });
          } catch (error) {
            if (error?.code !== 'ENOENT') {
              logger.error('failed to load telegram settings', error);
            }
            settings = createDefaultTelegramSettings(initialSettings);
          }

          await save();
          return settings;
        })();
      }

      await readyPromise;
      return this.getPublicSettings();
    },

    async waitUntilReady() {
      if (!readyPromise) {
        await this.initialize();
        return;
      }

      await readyPromise;
    },

    getSettings() {
      return {
        ...settings,
        chatIds: [...settings.chatIds],
        knownChats: settings.knownChats.map((entry) => ({ ...entry })),
      };
    },

    getPublicSettings() {
      return {
        botTokenConfigured: Boolean(settings.botToken),
        botTokenMasked: maskTelegramBotToken(settings.botToken),
        chatIds: [...settings.chatIds],
        autoSync: settings.autoSync,
        sensorAlertCooldownMs: settings.sensorAlertCooldownMs,
        knownChats: settings.knownChats.map((entry) => ({
          ...entry,
          selected: settings.chatIds.includes(entry.id),
        })),
      };
    },

    async update(nextPartial) {
      const nextSettings = createDefaultTelegramSettings({
        ...settings,
        ...nextPartial,
        botToken:
          typeof nextPartial?.botToken === 'string'
            ? nextPartial.botToken.trim() || settings.botToken
            : settings.botToken,
      });
      settings = nextSettings;
      await save();
      return this.getPublicSettings();
    },

    async replaceKnownChats(nextKnownChats) {
      settings = createDefaultTelegramSettings({
        ...settings,
        knownChats: nextKnownChats,
      });
      await save();
      return this.getPublicSettings();
    },
  };
}

function buildSensorAlertCaption(root, riskyWorkers) {
  const timestamp = formatIsoTimestamp(root.timestamp);
  const lines = ['[굴착기 센서 위험 알림]'];

  if (timestamp) {
    lines.push(`시간: ${timestamp}`);
  }

  lines.push(`위험 작업자 수: ${riskyWorkers.length}명`);
  lines.push(
    ...riskyWorkers.slice(0, 5).map((worker) => {
      const flags = [];
      if (worker.is_emergency) flags.push('EMERGENCY');
      if (!worker.is_emergency && worker.is_warning) flags.push('WARNING');
      flags.push(worker.zone_status.toUpperCase());
      return `- ${worker.name} (#${worker.tag_id}) ${worker.distance_m.toFixed(2)}m / ${flags.join(' · ')}`;
    })
  );

  return lines.join('\n');
}

export function createSensorAlertMessage(buffer) {
  const raw = buffer.toString('utf8').trim();
  const root = JSON.parse(raw || '{}');
  const payload = validateFrontendStatePayload(root);
  const riskyWorkers = payload.workers.filter(
    (worker) => worker.is_warning || worker.is_emergency || worker.zone_status === 'danger'
  );

  if (riskyWorkers.length === 0) {
    return {
      shouldSend: false,
      caption: '',
      photoBuffer: null,
    };
  }

  return {
    shouldSend: true,
    caption: buildSensorAlertCaption(payload, riskyWorkers),
    photoBuffer: null,
  };
}

export function createTelegramAlertSender({ fetchImpl = fetch } = {}) {
  return async function sendTelegramAlert({ botToken, chatId, caption, photoBuffer }) {
    if (!botToken || !chatId) {
      throw new Error('telegram bot token and chat id are required');
    }

    if (photoBuffer) {
      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('caption', caption);
      formData.append('photo', new Blob([photoBuffer], { type: 'image/jpeg' }), 'alert.jpg');

      const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`telegram sendPhoto failed with status ${response.status}`);
      }

      return;
    }

    const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
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
  };
}

export function createRtspStreamManager({
  hlsDirUrl = RTSP_FRAME_DIR_URL,
  spawnImpl = spawn,
  mkdirImpl = mkdir,
  rmImpl = rm,
  logger = console,
} = {}) {
  let processRef = null;
  let state = {
    status: 'idle',
    rtspUrl: '',
    playbackUrl: null,
    error: null,
  };
  let sessionId = 0;

  async function cleanup() {
    await rmImpl(hlsDirUrl, { recursive: true, force: true }).catch(() => {});
    await mkdirImpl(hlsDirUrl, { recursive: true });
  }

  return {
    async start(rtspUrl, playbackBaseUrl = 'http://localhost:8787') {
      const safeRtspUrl = ensureString(rtspUrl, 'rtspUrl');
      if (!/^rtsp:\/\//i.test(safeRtspUrl)) {
        throw new Error('rtspUrl must start with rtsp://');
      }

      if (processRef) {
        processRef.kill('SIGTERM');
        processRef = null;
      }

      await cleanup();
      sessionId += 1;

      const framePath = new URL('frame.jpg', hlsDirUrl);
      const ffmpegArgs = [
        '-rtsp_transport',
        'tcp',
        '-i',
        safeRtspUrl,
        '-an',
        '-vf',
        'fps=10',
        '-q:v',
        '5',
        '-update',
        '1',
        '-y',
        '-f',
        'image2',
        framePath.pathname,
      ];

      const child = spawnImpl('ffmpeg', ffmpegArgs, {
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      processRef = child;
      state = {
        status: 'running',
        rtspUrl: safeRtspUrl,
        playbackUrl: `${playbackBaseUrl}/rtsp/frame.jpg?session=${sessionId}`,
        error: null,
      };

      child.stderr?.on('data', (chunk) => {
        logger.info(String(chunk));
      });
      child.on('exit', (code) => {
        if (processRef !== child) return;
        processRef = null;
        if (state.status === 'stopped') return;
        state = {
          ...state,
          status: code === 0 ? 'stopped' : 'failed',
          error: code === 0 ? null : `ffmpeg exited with code ${code}`,
        };
      });

      return this.getState();
    },

    async stop() {
      if (processRef) {
        processRef.kill('SIGTERM');
        processRef = null;
      }
      state = {
        ...state,
        status: 'stopped',
        playbackUrl: null,
        error: null,
      };
      return this.getState();
    },

    getState() {
      return {
        status: state.status,
        rtspUrl: state.rtspUrl,
        playbackUrl: state.playbackUrl,
        error: state.error,
      };
    },
  };
}

function getRequestBaseUrl(request, fallbackBaseUrl) {
  const host = request.headers?.host;
  if (!host) {
    return fallbackBaseUrl;
  }

  const protocolHeader = request.headers?.['x-forwarded-proto'];
  const protocol = typeof protocolHeader === 'string' && protocolHeader ? protocolHeader : 'http';
  return `${protocol}://${host}`;
}

export function createRtspControlHandlers({ manager, logger = console, baseUrl = 'http://localhost:8787' } = {}) {
  return async function handleRtspRequest(request, response) {
    try {
      if (request.method === 'OPTIONS') {
        response.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
        response.end();
        return;
      }

      if (request.method === 'POST' && request.url === '/rtsp/start') {
        const payload = await readRequestJson(request);
        const result = await manager.start(payload.rtspUrl, getRequestBaseUrl(request, baseUrl));
        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'POST' && request.url === '/rtsp/stop') {
        const result = await manager.stop();
        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'GET' && request.url === '/rtsp/status') {
        sendJson(response, 200, manager.getState());
        return;
      }

      sendJson(response, 404, { error: 'not_found' });
    } catch (error) {
      logger.error('failed to handle rtsp request', error);
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : 'rtsp_request_failed',
      });
    }
  };
}

export function createBridgeHttpHandler({
  logger = console,
  rtspManager,
  wsPort = 8787,
  rtspFrameDirUrl = RTSP_FRAME_DIR_URL,
  telegramSettingsStore,
  createTelegramChatRegistry: createTelegramChatRegistryImpl = createTelegramChatRegistry,
  relaySensorSnapshotAlert,
  relayCctvAlert,
} = {}) {
  const logHandler = createLogRequestHandler({ logger });
  const baseUrl = `http://localhost:${wsPort}`;
  const rtspHandler = createRtspControlHandlers({ manager: rtspManager, logger, baseUrl });
  const telegramChatRegistry = createTelegramChatRegistryImpl({ logger });

  async function handleTelegramRequest(request, response, requestPath) {
    if (!telegramSettingsStore) {
      sendJson(response, 503, { error: 'telegram_settings_unavailable' });
      return true;
    }

    await telegramSettingsStore.waitUntilReady?.();

    if (request.method === 'GET' && requestPath === '/telegram/settings') {
      sendJson(response, 200, telegramSettingsStore.getPublicSettings());
      return true;
    }

    if (request.method === 'POST' && requestPath === '/telegram/settings') {
      const payload = await readRequestJson(request);
      const result = await telegramSettingsStore.update({
        botToken: typeof payload.botToken === 'string' ? payload.botToken : undefined,
        chatIds: Array.isArray(payload.chatIds) ? payload.chatIds.map(String) : undefined,
        autoSync: typeof payload.autoSync === 'boolean' ? payload.autoSync : undefined,
        sensorAlertCooldownMs: parseTelegramCooldownInput(payload.sensorAlertCooldownMs),
      });
      sendJson(response, 200, result);
      return true;
    }

    if (request.method === 'POST' && requestPath === '/telegram/settings/recommended') {
      const result = await telegramSettingsStore.update({
        autoSync: true,
        sensorAlertCooldownMs: 5000,
      });
      sendJson(response, 200, result);
      return true;
    }

    if (request.method === 'POST' && requestPath === '/telegram/chats/sync') {
      const currentSettings = telegramSettingsStore.getSettings();
      if (!currentSettings.botToken) {
        sendJson(response, 400, { error: 'telegram_bot_token_required' });
        return true;
      }

      const syncResult = await telegramChatRegistry.sync(currentSettings.botToken);
      const result = await telegramSettingsStore.replaceKnownChats(syncResult.knownChats);
      sendJson(response, 200, result);
      return true;
    }

    if (request.method === 'POST' && requestPath === '/telegram/alerts/sensor') {
      if (typeof relaySensorSnapshotAlert !== 'function') {
        sendJson(response, 503, { error: 'telegram_sensor_alert_relay_unavailable' });
        return true;
      }

      const payload = await readRequestJson(request);
      const result = await relaySensorSnapshotAlert(payload);
      sendJson(response, 200, result);
      return true;
    }

    if (request.method === 'POST' && requestPath === '/telegram/alerts/cctv') {
      if (typeof relayCctvAlert !== 'function') {
        sendJson(response, 503, { error: 'telegram_cctv_alert_relay_unavailable' });
        return true;
      }

      const payload = await readRequestJson(request);
      const result = await relayCctvAlert(payload);
      sendJson(response, 200, result);
      return true;
    }

    return false;
  }

  return async function handleHttpRequest(request, response) {
    const rawRequestUrl = request.url || '/';
    const parsedRequestUrl = new URL(rawRequestUrl, 'http://localhost');
    const requestPath = parsedRequestUrl.pathname;

    if (request.method === 'GET' && requestPath === '/rtsp/frame.jpg') {
      const fileUrl = new URL('frame.jpg', rtspFrameDirUrl);

      try {
        const info = await stat(fileUrl);
        if (!info.isFile()) {
          sendJson(response, 404, { error: 'not_found' });
          return;
        }
        const content = await readFile(fileUrl);
        sendText(response, 200, content, 'image/jpeg');
      } catch {
        sendJson(response, 404, { error: 'not_found' });
      }
      return;
    }

    if (requestPath === '/logs' || requestPath.startsWith('/rtsp/')) {
      if (requestPath === '/logs') {
        await logHandler(request, response);
        return;
      }

      await rtspHandler(request, response);
      return;
    }

    if (requestPath.startsWith('/telegram/')) {
      const handled = await handleTelegramRequest(request, response, requestPath);
      if (handled) {
        return;
      }
    }

    sendJson(response, 404, { error: 'not_found' });
  };
}

export function createSensorBridgeServer({
  createHttpServer = (handler) => http.createServer(handler),
  createLightControlBridge: createLightControlBridgeImpl = createLightControlBridge,
  attachLightControlWebSocketServer: attachLightControlWebSocketServerImpl = attachLightControlWebSocketServer,
  createTelegramAlertSender: createTelegramAlertSenderImpl = createTelegramAlertSender,
  createTelegramChatRegistry: createTelegramChatRegistryImpl = createTelegramChatRegistry,
  createTelegramSettingsStore: createTelegramSettingsStoreImpl = createTelegramSettingsStore,
  createRtspStreamManager: createRtspStreamManagerImpl = createRtspStreamManager,
  logger = console,
} = {}) {
  let httpServer = null;
  let lightControlWebSocketServer = null;
  let lightControlBridge = null;
  let rtspManager = null;
  let lastSensorAlertAt = 0;
  let telegramSettingsStore = null;

  return {
    start({
      wsPort = 8787,
      telegramBotToken = '',
      telegramChatId = '',
      sensorAlertCooldownMs = 5000,
    }) {
      telegramSettingsStore = createTelegramSettingsStoreImpl({
        initialSettings: {
          botToken: telegramBotToken,
          chatIds: parseTelegramChatIds(telegramChatId),
          autoSync: true,
          sensorAlertCooldownMs,
        },
        logger,
      });
      telegramSettingsStore.initialize().catch((error) => {
        logger.error('failed to initialize telegram settings store', error);
      });
      const sendTelegramAlert = createTelegramAlertSenderImpl({ logger });
      const telegramChatRegistry = createTelegramChatRegistryImpl({
        initialChatIds: parseTelegramChatIds(telegramChatId),
        logger,
      });

      async function sendAlertToTelegramChats(alert) {
        await telegramSettingsStore.waitUntilReady?.();
        const currentSettings = telegramSettingsStore.getSettings();
        if (!currentSettings.botToken) {
          logger.error('telegram alert skipped because bot token is missing');
          return;
        }

        let chatIds = currentSettings.chatIds;
        if (currentSettings.autoSync) {
          const syncResult = await telegramChatRegistry.sync(currentSettings.botToken);
          chatIds = syncResult.chatIds.length > 0 ? Array.from(new Set([...chatIds, ...syncResult.chatIds])) : chatIds;
          await telegramSettingsStore.replaceKnownChats(syncResult.knownChats);
          if (chatIds.length > 0) {
            await telegramSettingsStore.update({ chatIds });
          }
        }

        if (chatIds.length === 0) {
          logger.error('telegram alert skipped because no chat ids are known yet');
          return;
        }

        const results = await Promise.allSettled(
          chatIds.map((chatId) =>
            sendTelegramAlert({
              botToken: currentSettings.botToken,
              chatId,
              caption: alert.caption,
              photoBuffer: alert.photoBuffer,
            })
          )
        );

        for (const result of results) {
          if (result.status === 'rejected') {
            logger.error('failed to send telegram alert', result.reason);
          }
        }
      }

      async function relaySensorSnapshotAlert(payload) {
        const buffer = Buffer.from(JSON.stringify(payload));
        const alert = createSensorAlertMessage(buffer);
        const now = Date.now();
        const currentSettings = telegramSettingsStore.getSettings();
        const cooldownActive = now - lastSensorAlertAt < currentSettings.sensorAlertCooldownMs;

        if (!alert.shouldSend) {
          return { shouldSend: false, delivered: false, reason: 'not_risky' };
        }

        if (cooldownActive) {
          return { shouldSend: true, delivered: false, reason: 'cooldown_active' };
        }

        lastSensorAlertAt = now;
        await sendAlertToTelegramChats(alert);
        return { shouldSend: true, delivered: true };
      }

      async function relayCctvAlert(payload) {
        const buffer = Buffer.from(JSON.stringify(payload));
        const alert = createAiAlertMessage(buffer);

        if (!alert.shouldSend) {
          return { shouldSend: false, delivered: false, reason: 'below_risk_threshold' };
        }

        await sendAlertToTelegramChats(alert);
        return { shouldSend: true, delivered: true, sourceId: alert.sourceId, level: alert.level };
      }

      rtspManager = createRtspStreamManagerImpl({ logger });
      lightControlBridge = createLightControlBridgeImpl({ logger });
      httpServer = createHttpServer(
        createBridgeHttpHandler({
          logger,
          rtspManager,
          wsPort,
          telegramSettingsStore,
          createTelegramChatRegistry: createTelegramChatRegistryImpl,
          relaySensorSnapshotAlert,
          relayCctvAlert,
        })
      );
      lightControlWebSocketServer = attachLightControlWebSocketServerImpl({
        httpServer,
        lightControlBridge,
        logger,
      });
      httpServer.listen?.(wsPort, '0.0.0.0', () => {
        logger.info(`sensor bridge api listening on http://0.0.0.0:${wsPort}`);
        logger.info(`sensor bridge log api listening on http://0.0.0.0:${wsPort}/logs`);
        logger.info(`rtsp control api listening on http://0.0.0.0:${wsPort}/rtsp/status`);
        logger.info(`light control websocket listening on ws://0.0.0.0:${wsPort}/ws/light-control`);
        logger.info(`telegram sensor relay api listening on http://0.0.0.0:${wsPort}/telegram/alerts/sensor`);
        logger.info(`telegram cctv relay api listening on http://0.0.0.0:${wsPort}/telegram/alerts/cctv`);
      });
    },

    stop() {
      rtspManager?.stop?.();
      lightControlWebSocketServer?.close?.();
      httpServer?.close();
    },
  };
}

function toPort(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const server = createSensorBridgeServer();
  server.start({
    wsPort: toPort(process.env.SENSOR_BRIDGE_WS_PORT, 8787),
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
    sensorAlertCooldownMs: toPort(process.env.SENSOR_ALERT_COOLDOWN_MS, 5000),
  });
}
