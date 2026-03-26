import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createAiAlertMessage,
  createBridgeMessage,
  createBridgeHttpHandler,
  createLogRequestHandler,
  createRtspControlHandlers,
  createSensorBridgeServer,
  saveRuntimeLogFile,
} from '../server.js';

describe('createBridgeMessage', () => {
  it('returns a normalized frontend_state payload string from an incoming udp buffer', () => {
    const result = createBridgeMessage(
      Buffer.from(
        JSON.stringify({
          type: 'frontend_state',
          timestamp: '2026-03-22T20:30:15.120+09:00',
          system: {
            sensor_server_online: true,
            zone_rule: {
              caution_distance_m: 5,
              danger_distance_m: 3,
            },
          },
          workers: [
            {
              tag_id: 1,
              name: 'worker_1',
              approved: false,
              connected: true,
              x: 1,
              y: 2,
              distance_m: 2.24,
              zone_status: 'danger',
              is_warning: true,
              is_emergency: true,
              last_update: '2026-03-22T20:30:15.080+09:00',
            },
          ],
        })
      )
    );

    expect(JSON.parse(result)).toMatchObject({
      type: 'frontend_state',
      workers: [{ tag_id: 1 }],
    });
  });

  it('throws on invalid json packets', () => {
    expect(() => createBridgeMessage(Buffer.from('invalid-json'))).toThrow();
  });

  it('throws on payloads that are not frontend_state snapshots', () => {
    expect(() => createBridgeMessage(Buffer.from(JSON.stringify({ type: 'sensor_event' })))).toThrow(/frontend_state/i);
  });
});

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
  it('broadcasts valid frontend_state UDP payloads to websocket clients', () => {
    const sent = [];
    const udpSocket = { bind: vi.fn(), on: vi.fn(), close: vi.fn() };
    const httpServer = { listen: vi.fn(), close: vi.fn() };
    const wsServer = { on: vi.fn(), clients: new Set([{ readyState: 1, send: (message) => sent.push(message) }]), close: vi.fn() };

    const server = createSensorBridgeServer({
      createUdpSocket: () => udpSocket,
      createHttpServer: () => httpServer,
      createWebSocketServer: () => wsServer,
      logger: { info: vi.fn(), error: vi.fn() },
    });

    server.start({
      udpHost: '0.0.0.0',
      udpPort: 9500,
      wsPort: 8787,
    });

    const messageHandler = udpSocket.on.mock.calls.find(([eventName]) => eventName === 'message')[1];
    messageHandler(
      Buffer.from(
        JSON.stringify({
          type: 'frontend_state',
          timestamp: '2026-03-22T20:30:15.120+09:00',
          system: {
            sensor_server_online: true,
            zone_rule: { caution_distance_m: 5, danger_distance_m: 3 },
          },
          workers: [],
        })
      ),
      { address: '127.0.0.1', port: 9999 }
    );

    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0])).toMatchObject({ type: 'frontend_state' });
  });

  it('drops invalid frontend_state payloads and logs an error', () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const sent = [];
    const udpSocket = { bind: vi.fn(), on: vi.fn(), close: vi.fn() };
    const httpServer = { listen: vi.fn(), close: vi.fn() };
    const wsServer = { on: vi.fn(), clients: new Set([{ readyState: 1, send: (message) => sent.push(message) }]), close: vi.fn() };

    const server = createSensorBridgeServer({
      createUdpSocket: () => udpSocket,
      createHttpServer: () => httpServer,
      createWebSocketServer: () => wsServer,
      logger,
    });

    server.start({
      udpHost: '0.0.0.0',
      udpPort: 9500,
      wsPort: 8787,
    });

    const messageHandler = udpSocket.on.mock.calls.find(([eventName]) => eventName === 'message')[1];
    messageHandler(Buffer.from(JSON.stringify({ type: 'frontend_state', workers: [] })), { address: '127.0.0.1', port: 9999 });

    expect(sent).toHaveLength(0);
    expect(logger.error).toHaveBeenCalled();
  });

  it('sends telegram photo alerts for AI UDP payloads with RISK level or higher', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const sensorUdpSocket = { bind: vi.fn(), on: vi.fn(), close: vi.fn() };
    const aiUdpSocket = { bind: vi.fn(), on: vi.fn(), close: vi.fn() };
    const httpServer = { listen: vi.fn(), close: vi.fn() };
    const wsServer = { on: vi.fn(), clients: new Set(), close: vi.fn() };
    const sendTelegramAlert = vi.fn().mockResolvedValue(undefined);

    const server = createSensorBridgeServer({
      createUdpSocket: vi.fn()
        .mockReturnValueOnce(sensorUdpSocket)
        .mockReturnValueOnce(aiUdpSocket),
      createHttpServer: () => httpServer,
      createWebSocketServer: () => wsServer,
      createTelegramAlertSender: () => sendTelegramAlert,
      logger,
    });

    server.start({
      udpHost: '0.0.0.0',
      udpPort: 9500,
      aiUdpPort: 9600,
      wsPort: 8787,
      telegramBotToken: 'bot-token',
      telegramChatId: '-100123',
    });

    const aiMessageHandler = aiUdpSocket.on.mock.calls.find(([eventName]) => eventName === 'message')[1];
    await aiMessageHandler(
      Buffer.from(
        JSON.stringify({
          sourceID: 'sangju_cam2_gpu1_20260324_041116',
          top_event_ko: '경고: 충돌 위험 매우높음: 작업자-중장비 초근접',
          combined_ko: '현장 상황: 현재 경고 발생(최고: RISK). 주요 알림: 경고: 충돌 위험 매우높음: 작업자-중장비 초근접',
          objects: [
            { track_id: 21, label: 'person' },
            { track_id: 6, label: 'machinery' },
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
      ),
      { address: '127.0.0.1', port: 12000 }
    );

    expect(sendTelegramAlert).toHaveBeenCalledTimes(1);
    expect(sendTelegramAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: '-100123',
        botToken: 'bot-token',
        caption: expect.stringContaining('RISK'),
        photoBuffer: expect.any(Buffer),
      })
    );
  });

  it('does not send telegram alerts for AI UDP payloads below RISK', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const sensorUdpSocket = { bind: vi.fn(), on: vi.fn(), close: vi.fn() };
    const aiUdpSocket = { bind: vi.fn(), on: vi.fn(), close: vi.fn() };
    const httpServer = { listen: vi.fn(), close: vi.fn() };
    const wsServer = { on: vi.fn(), clients: new Set(), close: vi.fn() };
    const sendTelegramAlert = vi.fn().mockResolvedValue(undefined);

    const server = createSensorBridgeServer({
      createUdpSocket: vi.fn()
        .mockReturnValueOnce(sensorUdpSocket)
        .mockReturnValueOnce(aiUdpSocket),
      createHttpServer: () => httpServer,
      createWebSocketServer: () => wsServer,
      createTelegramAlertSender: () => sendTelegramAlert,
      logger,
    });

    server.start({
      udpHost: '0.0.0.0',
      udpPort: 9500,
      aiUdpPort: 9600,
      wsPort: 8787,
      telegramBotToken: 'bot-token',
      telegramChatId: '-100123',
    });

    const aiMessageHandler = aiUdpSocket.on.mock.calls.find(([eventName]) => eventName === 'message')[1];
    await aiMessageHandler(
      Buffer.from(
        JSON.stringify({
          sourceID: 'sangju_cam2_gpu1_20260324_041116',
          top_event_ko: '주의: 거리 근접',
          event_object_groups: [
            {
              event: {
                level: 'CAUTION',
                severity: 2,
              },
            },
          ],
        })
      ),
      { address: '127.0.0.1', port: 12000 }
    );

    expect(sendTelegramAlert).not.toHaveBeenCalled();
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
