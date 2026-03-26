import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import dgram from 'node:dgram';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';

const LOG_DIR_URL = new URL('../runtime-logs/', import.meta.url);
const RTSP_FRAME_DIR_URL = new URL('../runtime-rtsp/', import.meta.url);
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

export function createBridgeHttpHandler({ logger = console, rtspManager, wsPort = 8787, rtspFrameDirUrl = RTSP_FRAME_DIR_URL } = {}) {
  const logHandler = createLogRequestHandler({ logger });
  const baseUrl = `http://localhost:${wsPort}`;
  const rtspHandler = createRtspControlHandlers({ manager: rtspManager, logger, baseUrl });

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

    sendJson(response, 404, { error: 'not_found' });
  };
}

export function createSensorBridgeServer({
  createUdpSocket = () => dgram.createSocket('udp4'),
  createHttpServer = (handler) => http.createServer(handler),
  createWebSocketServer = ({ server }) => new WebSocketServer({ server }),
  createTelegramAlertSender: createTelegramAlertSenderImpl = createTelegramAlertSender,
  createRtspStreamManager: createRtspStreamManagerImpl = createRtspStreamManager,
  logger = console,
} = {}) {
  const sensorUdpSocket = createUdpSocket('sensor');
  const aiUdpSocket = createUdpSocket('ai');
  let wsServer = null;
  let httpServer = null;
  let rtspManager = null;

  return {
    start({
      udpHost = '0.0.0.0',
      udpPort = 9500,
      aiUdpHost = '0.0.0.0',
      aiUdpPort = 9600,
      wsPort = 8787,
      telegramBotToken = '',
      telegramChatId = '',
    }) {
      rtspManager = createRtspStreamManagerImpl({ logger });
      httpServer = createHttpServer(createBridgeHttpHandler({ logger, rtspManager, wsPort }));
      wsServer = createWebSocketServer({ server: httpServer });
      const sendTelegramAlert = createTelegramAlertSenderImpl({ logger });

      wsServer.on?.('connection', () => {
        logger.info(`sensor bridge websocket client connected on ${wsPort}`);
      });

      sensorUdpSocket.on('message', (buffer, remoteInfo) => {
        try {
          const message = createBridgeMessage(buffer);
          for (const client of wsServer.clients) {
            if (client.readyState === 1) {
              client.send(message);
            }
          }
        } catch (error) {
          logger.error(`invalid sensor packet from ${remoteInfo.address}:${remoteInfo.port}`, error);
        }
      });

      aiUdpSocket.on('message', async (buffer, remoteInfo) => {
        try {
          const alert = createAiAlertMessage(buffer);
          if (!alert.shouldSend) {
            return;
          }

          if (!telegramBotToken || !telegramChatId) {
            logger.error('telegram alert skipped because bot token or chat id is missing');
            return;
          }

          await sendTelegramAlert({
            botToken: telegramBotToken,
            chatId: telegramChatId,
            caption: alert.caption,
            photoBuffer: alert.photoBuffer,
          });
        } catch (error) {
          logger.error(`invalid ai alert packet from ${remoteInfo.address}:${remoteInfo.port}`, error);
        }
      });

      sensorUdpSocket.bind(udpPort, udpHost, () => {
        aiUdpSocket.bind(aiUdpPort, aiUdpHost, () => {
          httpServer.listen?.(wsPort, '0.0.0.0', () => {
            logger.info(`sensor bridge udp listening on ${udpHost}:${udpPort}`);
            logger.info(`ai alert udp listening on ${aiUdpHost}:${aiUdpPort}`);
            logger.info(`sensor bridge websocket listening on 0.0.0.0:${wsPort}`);
            logger.info(`sensor bridge log api listening on http://0.0.0.0:${wsPort}/logs`);
            logger.info(`rtsp control api listening on http://0.0.0.0:${wsPort}/rtsp/status`);
          });
        });
      });
    },

    stop() {
      sensorUdpSocket.close();
      aiUdpSocket.close();
      rtspManager?.stop?.();
      wsServer?.close();
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
    udpHost: process.env.SENSOR_UDP_HOST || '0.0.0.0',
    udpPort: toPort(process.env.SENSOR_UDP_PORT, 9500),
    aiUdpHost: process.env.AI_UDP_HOST || '0.0.0.0',
    aiUdpPort: toPort(process.env.AI_UDP_PORT, 9600),
    wsPort: toPort(process.env.SENSOR_BRIDGE_WS_PORT, 8787),
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  });
}
