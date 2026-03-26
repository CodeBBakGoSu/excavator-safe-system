import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createAiAlertMessage,
  createBridgeHttpHandler,
  createLightControlBridge,
  createLogRequestHandler,
  createRtspControlHandlers,
  createSensorBridgeServer,
  createSensorAlertMessage,
  createTelegramChatRegistry,
  saveRuntimeLogFile,
} from '../server.js';

function createTelegramSettingsStoreMock({
  botToken = 'bot-token',
  chatIds = [],
  autoSync = false,
  sensorAlertCooldownMs = 5000,
  knownChats = [],
} = {}) {
  const state = {
    botToken,
    chatIds: [...chatIds],
    autoSync,
    sensorAlertCooldownMs,
    knownChats: [...knownChats],
  };

  const toPublicSettings = () => ({
    botTokenConfigured: Boolean(state.botToken),
    botTokenMasked: 'token',
    chatIds: [...state.chatIds],
    autoSync: state.autoSync,
    sensorAlertCooldownMs: state.sensorAlertCooldownMs,
    knownChats: state.knownChats.map((entry) => ({
      ...entry,
      selected: state.chatIds.includes(entry.id),
    })),
  });

  return {
    initialize: vi.fn().mockResolvedValue(toPublicSettings()),
    waitUntilReady: vi.fn().mockResolvedValue(undefined),
    getSettings: vi.fn(() => ({
      botToken: state.botToken,
      chatIds: [...state.chatIds],
      autoSync: state.autoSync,
      sensorAlertCooldownMs: state.sensorAlertCooldownMs,
      knownChats: state.knownChats.map((entry) => ({
        ...entry,
        selected: state.chatIds.includes(entry.id),
      })),
    })),
    getPublicSettings: vi.fn(() => toPublicSettings()),
    update: vi.fn().mockImplementation(async (nextPartial = {}) => {
      if (typeof nextPartial.botToken === 'string' && nextPartial.botToken.trim()) {
        state.botToken = nextPartial.botToken.trim();
      }
      if (Array.isArray(nextPartial.chatIds)) {
        state.chatIds = nextPartial.chatIds.map(String);
      }
      if (typeof nextPartial.autoSync === 'boolean') {
        state.autoSync = nextPartial.autoSync;
      }
      if (typeof nextPartial.sensorAlertCooldownMs === 'number') {
        state.sensorAlertCooldownMs = nextPartial.sensorAlertCooldownMs;
      }
      return toPublicSettings();
    }),
    replaceKnownChats: vi.fn().mockImplementation(async (nextKnownChats = []) => {
      state.knownChats = [...nextKnownChats];
      return toPublicSettings();
    }),
  };
}

describe('createLogRequestHandler', () => {
  it('returns cors headers for preflight and log save responses', async () => {
    const handler = createLogRequestHandler({ logger: { error: vi.fn() } });
    const headers = [];
    const response = {
      writeHead: vi.fn((status, nextHeaders) => {
        headers.push({ status, nextHeaders });
      }),
      end: vi.fn(),
    };

    await handler(
      {
        method: 'OPTIONS',
        url: '/logs',
        [Symbol.asyncIterator]: async function* () {},
      },
      response
    );

    expect(headers[0].nextHeaders).toMatchObject({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Private-Network': 'true',
    });

    await handler(
      {
        method: 'POST',
        url: '/logs',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              type: 'cctv',
              entries: [
                {
                  timestamp: '2026-03-24 09:00:00',
                  summary: 'frame received',
                  detail: 'ok',
                },
              ],
            })
          );
        },
      },
      response
    );

    expect(headers[1].nextHeaders).toMatchObject({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Private-Network': 'true',
    });
  });
});

describe('createSensorBridgeServer', () => {
  it('starts an http bridge server for relay and control apis', () => {
    const httpServer = { listen: vi.fn(), close: vi.fn() };

    const server = createSensorBridgeServer({
      createHttpServer: () => httpServer,
      createTelegramSettingsStore: () => createTelegramSettingsStoreMock(),
      logger: { info: vi.fn(), error: vi.fn() },
    });

    server.start({
      wsPort: 8787,
    });

    expect(httpServer.listen).toHaveBeenCalledWith(8787, '0.0.0.0', expect.any(Function));
  });

  it('stops the http bridge server cleanly', () => {
    const httpServer = { listen: vi.fn(), close: vi.fn() };
    const rtspManager = { stop: vi.fn() };

    const server = createSensorBridgeServer({
      createHttpServer: () => httpServer,
      createRtspStreamManager: () => rtspManager,
      createTelegramSettingsStore: () => createTelegramSettingsStoreMock(),
      logger: { info: vi.fn(), error: vi.fn() },
    });

    server.start({
      wsPort: 8787,
    });
    server.stop();

    expect(rtspManager.stop).toHaveBeenCalledOnce();
    expect(httpServer.close).toHaveBeenCalledOnce();
  });
});

describe('createLightControlBridge', () => {
  it('sends a validated light control json payload over tcp', async () => {
    const writes = [];
    const end = vi.fn();
    const socket = {
      once(event, handler) {
        if (event === 'connect') {
          handler();
        }
        return this;
      },
      on() {
        return this;
      },
      write: vi.fn((payload, callback) => {
        writes.push(payload);
        callback?.();
      }),
      end,
    };
    const createConnection = vi.fn(() => socket);
    const bridge = createLightControlBridge({
      createConnection,
      logger: { error: vi.fn(), info: vi.fn() },
    });

    await bridge.relay({
      type: 'light_control',
      command: 'on',
      timestamp: '2026-03-27T10:00:00+09:00',
    });

    expect(createConnection).toHaveBeenCalledWith({ host: '192.168.1.7', port: 8888 });
    expect(writes).toEqual([
      JSON.stringify({
        type: 'light_control',
        command: 'on',
        timestamp: '2026-03-27T10:00:00+09:00',
      }),
    ]);
    expect(end).toHaveBeenCalledOnce();
  });

  it('deduplicates repeated commands but still forwards state changes immediately', async () => {
    const writes = [];
    const createConnection = vi.fn(() => ({
      once(event, handler) {
        if (event === 'connect') {
          handler();
        }
        return this;
      },
      on() {
        return this;
      },
      write: vi.fn((payload, callback) => {
        writes.push(payload);
        callback?.();
      }),
      end: vi.fn(),
    }));
    const bridge = createLightControlBridge({
      createConnection,
      logger: { error: vi.fn(), info: vi.fn() },
    });

    await bridge.relay({
      type: 'light_control',
      command: 'on',
      timestamp: '2026-03-27T10:00:00+09:00',
    });
    await bridge.relay({
      type: 'light_control',
      command: 'on',
      timestamp: '2026-03-27T10:00:01+09:00',
    });
    await bridge.relay({
      type: 'light_control',
      command: 'off',
      timestamp: '2026-03-27T10:00:02+09:00',
    });

    expect(writes).toHaveLength(2);
    expect(writes[1]).toContain('"command":"off"');
  });

  it('rejects invalid control payloads without opening a tcp socket', async () => {
    const createConnection = vi.fn();
    const bridge = createLightControlBridge({
      createConnection,
      logger: { error: vi.fn(), info: vi.fn() },
    });

    await expect(
      bridge.relay({
        type: 'unknown',
        command: 'blink',
        timestamp: '2026-03-27T10:00:00+09:00',
      })
    ).rejects.toThrow(/light_control/);

    expect(createConnection).not.toHaveBeenCalled();
  });
});

describe('createRtspControlHandlers', () => {
  it('starts the RTSP frame bridge and returns the playback url', async () => {
    const manager = {
      start: vi.fn().mockResolvedValue({
        status: 'running',
        rtspUrl: 'rtsp://10.0.0.5/live.sdp',
        playbackUrl: 'http://192.168.1.206:8787/rtsp/frame.jpg?session=1',
      }),
      stop: vi.fn(),
      getState: vi.fn(),
    };
    const handlers = createRtspControlHandlers({ manager, logger: { error: vi.fn() } });

    const request = {
      headers: {
        host: '192.168.1.206:8787',
      },
      method: 'POST',
      url: '/rtsp/start',
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(JSON.stringify({ rtspUrl: 'rtsp://10.0.0.5/live.sdp' }));
      },
    };
    const response = {
      writeHead: vi.fn(),
      end: vi.fn(),
    };

    await handlers(request, response);

    expect(manager.start).toHaveBeenCalledWith('rtsp://10.0.0.5/live.sdp', 'http://192.168.1.206:8787');
    expect(response.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'Content-Type': 'application/json; charset=utf-8' })
    );
    expect(JSON.parse(response.end.mock.calls[0][0])).toMatchObject({
      status: 'running',
      playbackUrl: 'http://192.168.1.206:8787/rtsp/frame.jpg?session=1',
    });
  });

  it('returns the current RTSP bridge state', async () => {
    const manager = {
      start: vi.fn(),
      stop: vi.fn(),
      getState: vi.fn().mockReturnValue({
        status: 'idle',
        rtspUrl: '',
        playbackUrl: null,
      }),
    };
    const handlers = createRtspControlHandlers({ manager, logger: { error: vi.fn() } });
    const response = {
      writeHead: vi.fn(),
      end: vi.fn(),
    };

    await handlers({ method: 'GET', url: '/rtsp/status' }, response);

    expect(manager.getState).toHaveBeenCalledOnce();
    expect(JSON.parse(response.end.mock.calls[0][0])).toMatchObject({
      status: 'idle',
      playbackUrl: null,
    });
  });

  it('serves rtsp frame images even when the request has a cache-busting query string', async () => {
    const frameDir = path.join(process.cwd(), 'runtime-rtsp');
    await mkdir(frameDir, { recursive: true });
    await writeFile(path.join(frameDir, 'frame.jpg'), 'fake-jpeg', 'utf8');

    const response = {
      writeHead: vi.fn(),
      end: vi.fn(),
    };

    const handler = createBridgeHttpHandler({
      logger: { error: vi.fn() },
      rtspManager: {
        start: vi.fn(),
        stop: vi.fn(),
        getState: vi.fn(),
      },
      rtspFrameDirUrl: new URL(`file://${frameDir}/`),
      wsPort: 8787,
    });

    await handler(
      {
        method: 'GET',
        url: '/rtsp/frame.jpg?session=99',
      },
      response
    );

    expect(response.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        'Content-Type': 'image/jpeg',
      })
    );

    await rm(frameDir, { recursive: true, force: true });
  });
});

describe('createBridgeHttpHandler telegram endpoints', () => {
  it('returns saved telegram settings and syncs known chats on request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: [
          {
            update_id: 1,
            message: {
              chat: {
                id: 8477727287,
                type: 'private',
                first_name: '기현',
                last_name: '홍',
              },
            },
          },
        ],
      }),
    });

    const handler = createBridgeHttpHandler({
      logger: { error: vi.fn() },
      rtspManager: {
        start: vi.fn(),
        stop: vi.fn(),
        getState: vi.fn(),
      },
      telegramSettingsStore: createTelegramSettingsStoreMock({
        botToken: 'bot-token',
        chatIds: ['8477727287'],
        autoSync: true,
        knownChats: [
          {
            id: '8477727287',
            type: 'private',
            title: '기현 홍',
            selected: true,
          },
        ],
      }),
      createTelegramChatRegistry: () => createTelegramChatRegistry({ fetchImpl, logger: { error: vi.fn() } }),
      wsPort: 8787,
    });

    const getResponse = { writeHead: vi.fn(), end: vi.fn() };
    await handler({ method: 'GET', url: '/telegram/settings' }, getResponse);
    expect(JSON.parse(getResponse.end.mock.calls[0][0])).toMatchObject({
      botTokenConfigured: true,
      chatIds: ['8477727287'],
      autoSync: true,
      sensorAlertCooldownMs: 5000,
    });

    const syncResponse = { writeHead: vi.fn(), end: vi.fn() };
    await handler(
      {
        method: 'POST',
        url: '/telegram/chats/sync',
        [Symbol.asyncIterator]: async function* () {},
      },
      syncResponse
    );

    const syncPayload = JSON.parse(syncResponse.end.mock.calls[0][0]);
    expect(fetchImpl).toHaveBeenCalled();
    expect(syncPayload.knownChats).toEqual([
      expect.objectContaining({
        id: '8477727287',
        type: 'private',
        title: '기현 홍',
        selected: true,
      }),
    ]);
  });

  it('accepts string cooldown payloads and normalizes them before saving', async () => {
    const telegramSettingsStore = createTelegramSettingsStoreMock({
      botToken: 'bot-token',
      chatIds: ['8477727287'],
      autoSync: true,
      sensorAlertCooldownMs: 5000,
    });

    const handler = createBridgeHttpHandler({
      logger: { error: vi.fn() },
      rtspManager: {
        start: vi.fn(),
        stop: vi.fn(),
        getState: vi.fn(),
      },
      telegramSettingsStore,
      wsPort: 8787,
    });

    const response = { writeHead: vi.fn(), end: vi.fn() };
    await handler(
      {
        method: 'POST',
        url: '/telegram/settings',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              sensorAlertCooldownMs: '45000',
            })
          );
        },
      },
      response
    );

    expect(telegramSettingsStore.update).toHaveBeenCalledWith(
      expect.objectContaining({
        sensorAlertCooldownMs: 45000,
      })
    );
    expect(JSON.parse(response.end.mock.calls[0][0])).toMatchObject({
      sensorAlertCooldownMs: 45000,
    });
  });

  it('relays sensor danger snapshots to the telegram sender pipeline', async () => {
    const relaySensorSnapshotAlert = vi.fn().mockResolvedValue({
      shouldSend: true,
      delivered: true,
    });

    const handler = createBridgeHttpHandler({
      logger: { error: vi.fn() },
      rtspManager: {
        start: vi.fn(),
        stop: vi.fn(),
        getState: vi.fn(),
      },
      telegramSettingsStore: createTelegramSettingsStoreMock({
        botToken: 'bot-token',
        chatIds: ['8477727287'],
        autoSync: true,
      }),
      relaySensorSnapshotAlert,
      wsPort: 8787,
    });

    const response = { writeHead: vi.fn(), end: vi.fn() };
    await handler(
      {
        method: 'POST',
        url: '/telegram/alerts/sensor',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              type: 'frontend_state',
              timestamp: '2026-03-26T18:26:42.148+09:00',
              system: {
                sensor_server_online: true,
                zone_rule: { caution_distance_m: 5, danger_distance_m: 3 },
              },
              workers: [
                {
                  tag_id: 1,
                  name: 'worker_1',
                  approved: true,
                  connected: true,
                  x: -0.68,
                  y: 1.41,
                  distance_m: 1.57,
                  zone_status: 'danger',
                  is_warning: true,
                  is_emergency: true,
                  last_update: '2026-03-26T18:26:42.158+09:00',
                },
              ],
            })
          );
        },
      },
      response
    );

    expect(relaySensorSnapshotAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'frontend_state',
        workers: [
          expect.objectContaining({
            zone_status: 'danger',
            is_emergency: true,
          }),
        ],
      })
    );
    expect(response.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'Content-Type': 'application/json; charset=utf-8' })
    );
    expect(JSON.parse(response.end.mock.calls[0][0])).toMatchObject({
      shouldSend: true,
      delivered: true,
    });
  });

  it('relays cctv risk events to the telegram sender pipeline', async () => {
    const relayCctvAlert = vi.fn().mockResolvedValue({
      shouldSend: true,
      delivered: true,
      level: 'RISK',
    });

    const handler = createBridgeHttpHandler({
      logger: { error: vi.fn() },
      rtspManager: {
        start: vi.fn(),
        stop: vi.fn(),
        getState: vi.fn(),
      },
      telegramSettingsStore: createTelegramSettingsStoreMock({
        botToken: 'bot-token',
        chatIds: ['8477727287'],
        autoSync: true,
      }),
      relayCctvAlert,
      wsPort: 8787,
    });

    const response = { writeHead: vi.fn(), end: vi.fn() };
    await handler(
      {
        method: 'POST',
        url: '/telegram/alerts/cctv',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              source_id: 'cam1',
              top_event_ko: '경고: 작업자 접근',
              event_object_groups: [{ event: { level: 'RISK', message_ko: '경고: 작업자 접근' }, track_ids: [7] }],
            })
          );
        },
      },
      response
    );

    expect(relayCctvAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        source_id: 'cam1',
      })
    );
    expect(JSON.parse(response.end.mock.calls[0][0])).toMatchObject({
      shouldSend: true,
      delivered: true,
      level: 'RISK',
    });
  });
});

describe('createAiAlertMessage', () => {
  it('builds a telegram photo payload from ai udp packets with risk events', () => {
    const result = createAiAlertMessage(
      Buffer.from(
        JSON.stringify({
          sourceID: 'sangju_cam2_gpu1_20260324_041116',
          report_wall_ts_ms: 1774325578164,
          top_event_ko: '경고: 충돌 위험 매우높음: 작업자-중장비 초근접',
          combined_ko: '현장 상황: 현재 경고 발생(최고: RISK). 주요 알림: 경고: 충돌 위험 매우높음: 작업자-중장비 초근접',
          objects: [
            { track_id: 2, label: 'person' },
            { track_id: 6, label: 'machinery' },
            { track_id: 12, label: 'person' },
          ],
          event_object_groups: [
            {
              event: {
                level: 'RISK',
                severity: 4,
              },
            },
          ],
          image_jpeg_base64: Buffer.from('fake-image').toString('base64'),
        })
      )
    );

    expect(result.shouldSend).toBe(true);
    expect(result.photoBuffer).toBeInstanceOf(Buffer);
    expect(result.caption).toContain('cam2');
    expect(result.caption).toContain('RISK');
    expect(result.caption).toContain('작업자 2명');
    expect(result.caption).toContain('중장비 1대');
  });

  it('returns shouldSend false for non-risk ai packets', () => {
    const result = createAiAlertMessage(
      Buffer.from(
        JSON.stringify({
          sourceID: 'sangju_cam2_gpu1_20260324_041116',
          event_object_groups: [
            {
              event: {
                level: 'INFO',
                severity: 1,
              },
            },
          ],
        })
      )
    );

    expect(result.shouldSend).toBe(false);
    expect(result.photoBuffer).toBeNull();
  });
});

describe('createSensorAlertMessage', () => {
  it('returns a text alert when workers are in warning or emergency state', () => {
    const result = createSensorAlertMessage(
      Buffer.from(
        JSON.stringify({
          type: 'frontend_state',
          timestamp: '2026-03-22T20:30:15.120+09:00',
          system: {
            sensor_server_online: true,
            zone_rule: { caution_distance_m: 5, danger_distance_m: 3 },
          },
          workers: [
            {
              tag_id: 1,
              name: 'worker_1',
              approved: false,
              connected: true,
              x: 1,
              y: 2,
              distance_m: 1.51,
              zone_status: 'danger',
              is_warning: true,
              is_emergency: true,
              last_update: '2026-03-22T20:30:15.080+09:00',
            },
          ],
        })
      )
    );

    expect(result.shouldSend).toBe(true);
    expect(result.photoBuffer).toBeNull();
    expect(result.caption).toContain('worker_1');
    expect(result.caption).toContain('1.51m');
  });
});

describe('saveRuntimeLogFile', () => {
  it('formats and writes a server-side runtime log file', async () => {
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.fn().mockResolvedValue(undefined);

    const result = await saveRuntimeLogFile({
      type: 'sensor',
      entries: [
        {
          timestamp: '2026. 3. 24. 00:41:12',
          summary: '현장 상태 스냅샷 수신',
          detail: '작업자 2명 · 위험 1명',
        },
      ],
      mkdirImpl: mkdir,
      writeFileImpl: writeFile,
      now: new Date('2026-03-24T00:41:12+09:00'),
    });

    expect(result.fileName).toBe('sensor-log-2026-03-24_00-41-12.txt');
    expect(result.savedPath).toContain('runtime-logs/sensor-log-2026-03-24_00-41-12.txt');
    expect(mkdir).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile.mock.calls[0][1]).toContain('시간: 2026. 3. 24. 00:41:12');
    expect(writeFile.mock.calls[0][1]).toContain('요약: 현장 상태 스냅샷 수신');
    expect(writeFile.mock.calls[0][1]).toContain('상세:');
  });
});
