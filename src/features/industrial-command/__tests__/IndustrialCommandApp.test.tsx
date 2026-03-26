import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../../App';

const FRAME_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

let fetchMock: ReturnType<typeof vi.fn>;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  send(data: string) {
    this.sent.push(data);
  }

  emitOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  emitMessage(data: string) {
    this.onmessage?.({ data } as MessageEvent<string>);
  }
}

function emitCctvFrame(
  payload: Partial<{
    source_id: string;
    frame_index: number;
    combined_ko: string;
    top_event_ko: string;
    events_ko: string[];
    zone_name: string;
    distance_text: string;
    target_label: string;
    image_size: [number, number];
    objects: Array<{ track_id: number; label: string; bbox_xyxy: [number, number, number, number] }>;
    event_object_groups: Array<{
      event: { level: string; message_ko: string };
      track_ids: number[];
      relations?: Array<Record<string, unknown>>;
    }>;
    image_jpeg_base64: string;
  }>
) {
  MockWebSocket.instances[0].emitMessage(
    JSON.stringify({
      source_id: 'cam1',
      frame_index: 1,
      combined_ko: '현장 상황: 현재 위험 이벤트 없음.',
      top_event_ko: '정상(이벤트 없음)',
      events_ko: [],
      zone_name: '굴착기 구역 A',
      distance_text: '약 1.8m',
      target_label: 'person',
      image_size: [1920, 1080],
      objects: [{ track_id: 7, label: 'person', bbox_xyxy: [240, 120, 560, 920] }],
      event_object_groups: [],
      image_jpeg_base64: FRAME_IMAGE,
      ...payload,
    })
  );
}

function emitLiveData({
  cctvUrl = 'ws://localhost:9999/frames',
  sensorUrl = 'ws://localhost:8787',
}: {
  cctvUrl?: string;
  sensorUrl?: string;
} = {}) {
  window.localStorage.setItem('excavator-safe-system:cctv-poc-ws-url', cctvUrl);
  window.localStorage.setItem('excavator-safe-system:sensor-bridge-ws-url', sensorUrl);
  window.localStorage.setItem('excavator-safe-system:telegram-bot-token', '8385397257:AAFS3n_zuXKfHW0K0lP2uk4rxz7pWb3AIVk');
  window.localStorage.setItem('excavator-safe-system:telegram-chat-ids', JSON.stringify(['8477727287']));
  window.localStorage.setItem(
    'excavator-safe-system:telegram-known-chats',
    JSON.stringify([{ id: '8477727287', type: 'private', title: '기현 홍', selected: true }])
  );

  const result = render(<App />);

  fireEvent.click(screen.getByRole('button', { name: '카메라 연결' }));
  fireEvent.click(screen.getByRole('button', { name: '센서 연결' }));

  expect(MockWebSocket.instances.map((socket) => socket.url)).toEqual([cctvUrl, sensorUrl]);

  act(() => {
    MockWebSocket.instances[0].emitOpen();
    MockWebSocket.instances[1].emitOpen();
    MockWebSocket.instances[0].emitMessage(
      JSON.stringify({
        source_id: 'cam1',
        frame_index: 1842,
        combined_ko: '작업자 위험 접근',
        top_event_ko: '경고: 작업자 접근',
        events_ko: ['작업자 접근', '중장비 근접'],
        zone_name: '굴착기 구역 A',
        distance_text: '약 1.8m',
        target_label: 'person',
        image_size: [1920, 1080],
        objects: [
          {
            track_id: 7,
            label: 'person',
            bbox_xyxy: [240, 120, 560, 920],
          },
          {
            track_id: 8,
            label: 'machinery',
            bbox_xyxy: [840, 260, 1550, 1020],
          },
        ],
        event_object_groups: [
          {
            event: {
              level: 'CAUTION',
              message_ko: '주의: 작업자 접근',
            },
            track_ids: [7],
            relations: [
              {
                a_label: 'person',
                b_label: 'machinery',
                a_id: 7,
                b_id: 8,
                d_over_person_height: 1.1,
              },
            ],
          },
        ],
        image_jpeg_base64: FRAME_IMAGE,
      })
    );
    MockWebSocket.instances[0].emitMessage(
      JSON.stringify({
        source_id: 'cam2',
        frame_index: 910,
        combined_ko: '장비 정상 주행',
        top_event_ko: '주의: 작업 반경 감시',
        events_ko: ['작업 반경 감시'],
        zone_name: '굴착기 구역 B',
        distance_text: '약 4.6m',
        target_label: 'machinery',
        image_size: [1920, 1080],
        objects: [
          {
            track_id: 12,
            label: 'machinery',
            bbox_xyxy: [440, 160, 1450, 960],
          },
        ],
        event_object_groups: [
          {
            event: {
              level: 'CAUTION',
              message_ko: '주의: 작업 반경 감시',
            },
            track_ids: [12],
          },
        ],
        image_jpeg_base64: FRAME_IMAGE,
      })
    );
    MockWebSocket.instances[1].emitMessage(
      JSON.stringify({
        type: 'frontend_state',
        timestamp: '2026-03-24T09:00:15+09:00',
        system: {
          sensor_server_online: true,
          zone_rule: {
            caution_distance_m: 5,
            danger_distance_m: 3,
          },
        },
        workers: [
          {
            tag_id: 9,
            name: 'worker_9',
            approved: true,
            connected: true,
            x: 4,
            y: -2,
            distance_m: 4.47,
            zone_status: 'caution',
            is_warning: true,
            is_emergency: false,
            last_update: '2026-03-24T09:00:14+09:00',
          },
        ],
      })
    );
  });

  return result;
}

describe('IndustrialCommandApp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (String(_input).includes('/getUpdates')) {
        return {
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
        };
      }

      if (init?.method === 'POST') {
        return { ok: true, json: async () => ({ ok: true, result: true }) };
      }

      return { ok: true, json: async () => ({ ok: true, result: [] }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders a fixed four-slot monitor grid and keeps the event feed below the CCTV surface', () => {
    const { container } = emitLiveData();

    const appShell = container.querySelector('main');
    const monitorRegion = screen.getByRole('region', { name: 'Primary monitor area' });
    const eventFeedHeading = screen.getByText('감지 이벤트');
    const monitorGrid = container.querySelector('[data-testid="monitor-grid"]');
    const eventFeed = screen.getByTestId('event-feed-list');
    const pinnedFeed = screen.getByTestId('event-feed-pinned');
    const telemetrySection = eventFeed.closest('section');
    const telemetryAside = eventFeed.closest('aside');

    expect(appShell?.className).not.toContain('lg:grid-cols-[minmax(0,1fr)_320px]');
    expect(appShell?.className).toContain('grid-cols-1');
    expect(appShell?.className).toContain('min-h-0');
    expect(monitorGrid?.className).toContain('sm:grid-cols-2');
    expect(telemetryAside?.className).toContain('min-h-0');
    expect(telemetrySection?.className).toContain('min-h-0');
    expect(eventFeed).toHaveClass('overflow-y-auto');
    expect(eventFeed).toHaveClass('overscroll-contain');
    expect(screen.getAllByRole('button', { name: /CH-0[1-4]/ })).toHaveLength(4);
    expect(within(pinnedFeed).getByText('경고: 작업자 접근')).toBeInTheDocument();
    expect(monitorRegion.compareDocumentPosition(eventFeedHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('switches to a two-camera layout from settings and only shows two enlarged tiles', () => {
    const { container } = emitLiveData();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('카메라 화면 개수'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: '표시/팝업 적용' }));
    fireEvent.click(screen.getByRole('button', { name: '설정 닫기' }));

    const monitorGrid = container.querySelector('[data-testid="monitor-grid"]');

    expect(screen.getAllByRole('button', { name: /CH-0[1-4]/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'CH-01 굴착기 구역 A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CH-02 굴착기 구역 B' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'CH-03 RTSP 실시간 모니터' })).not.toBeInTheDocument();
    expect(monitorGrid?.className).toContain('grid-cols-1');
    expect(window.localStorage.getItem('excavator-safe-system:camera-display-count')).toBe('2');
  });

  it('hides a hovered camera tile and lets the operator restore it from the monitor header', () => {
    emitLiveData();

    const targetTile = screen.getByRole('button', { name: 'CH-02 굴착기 구역 B' });

    fireEvent.mouseEnter(targetTile);
    fireEvent.click(within(targetTile).getByRole('button', { name: '굴착기 구역 B 끄기' }));

    expect(screen.queryByRole('button', { name: 'CH-02 굴착기 구역 B' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CH-02 다시 켜기' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'CH-02 다시 켜기' }));

    expect(screen.getByRole('button', { name: 'CH-02 굴착기 구역 B' })).toBeInTheDocument();
  });

  it('persists the edited sensor alert cooldown when telegram settings are applied', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('센서 알림 쿨다운(초)'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('센서 알림 쿨다운(초)'), {
      target: { value: '45' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Telegram 적용' }));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(window.localStorage.getItem('excavator-safe-system:telegram-sensor-cooldown-ms')).toBe('45000');
  });

  it('finds telegram chats by calling the official telegram getUpdates api directly', async () => {
    window.localStorage.setItem('excavator-safe-system:telegram-bot-token', '8385397257:AAFS3n_zuXKfHW0K0lP2uk4rxz7pWb3AIVk');
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: '채팅방 찾기' }));

    await act(async () => {
      await Promise.resolve();
    });

    const syncCall = fetchMock.mock.calls.find(([input, init]) =>
      String(input).includes('https://api.telegram.org/bot8385397257:AAFS3n_zuXKfHW0K0lP2uk4rxz7pWb3AIVk/getUpdates') &&
      (!init || init.method === 'GET')
    );
    expect(syncCall).toBeTruthy();
  });

  it('shows the first three event items immediately and keeps the rest in a scrollable list', () => {
    emitLiveData();

    act(() => {
      emitCctvFrame({
        source_id: 'cam1',
        frame_index: 100,
        top_event_ko: '경고: 작업자 접근 1',
        combined_ko: '경고: 작업자 접근 1',
        events_ko: ['경고: 작업자 접근 1'],
        event_object_groups: [{ event: { level: 'RISK', message_ko: '경고: 작업자 접근 1' }, track_ids: [7] }],
      });
      emitCctvFrame({
        source_id: 'cam1',
        frame_index: 101,
        top_event_ko: '경고: 작업자 접근 2',
        combined_ko: '경고: 작업자 접근 2',
        events_ko: ['경고: 작업자 접근 2'],
        event_object_groups: [{ event: { level: 'RISK', message_ko: '경고: 작업자 접근 2' }, track_ids: [7] }],
      });
      emitCctvFrame({
        source_id: 'cam1',
        frame_index: 102,
        top_event_ko: '경고: 작업자 접근 3',
        combined_ko: '경고: 작업자 접근 3',
        events_ko: ['경고: 작업자 접근 3'],
        event_object_groups: [{ event: { level: 'RISK', message_ko: '경고: 작업자 접근 3' }, track_ids: [7] }],
      });
      emitCctvFrame({
        source_id: 'cam1',
        frame_index: 103,
        top_event_ko: '경고: 작업자 접근 4',
        combined_ko: '경고: 작업자 접근 4',
        events_ko: ['경고: 작업자 접근 4'],
        event_object_groups: [{ event: { level: 'RISK', message_ko: '경고: 작업자 접근 4' }, track_ids: [7] }],
      });
    });

    const pinnedFeed = screen.getByTestId('event-feed-pinned');
    const scrollFeed = screen.getByTestId('event-feed-list');

    expect(within(pinnedFeed).getByText('경고: 작업자 접근 4')).toBeInTheDocument();
    expect(within(pinnedFeed).getByText('경고: 작업자 접근 3')).toBeInTheDocument();
    expect(within(pinnedFeed).getByText('경고: 작업자 접근 2')).toBeInTheDocument();
    expect(within(scrollFeed).getByText('경고: 작업자 접근 1')).toBeInTheDocument();
    expect(scrollFeed).toHaveClass('overflow-y-auto');
    expect(scrollFeed).toHaveClass('min-h-0');
    expect(scrollFeed.parentElement).toHaveClass('min-h-0');
    expect(scrollFeed.closest('aside')).toHaveClass('overflow-hidden');
  });

  it('keeps tile focus separate from overlay actions and only renders intended detection overlays', () => {
    emitLiveData();

    expect(screen.getByRole('toolbar', { name: '상단 제어 바' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Primary monitor area' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '현장 상태 스냅샷' })).not.toBeInTheDocument();

    const firstTile = screen.getByRole('button', { name: 'CH-01 굴착기 구역 A' });
    expect(within(firstTile).getByText('PERSON #7')).toBeInTheDocument();
    expect(within(firstTile).getByText('MACHINERY #8')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'CH-02 굴착기 구역 B' }));

    expect(screen.getByRole('button', { name: 'CH-02 굴착기 구역 B' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '위험 이벤트 상세' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '로그 보기' }));

    const logsDialog = screen.getByRole('dialog', { name: '로그 뷰어' });
    expect(within(logsDialog).getByText('CH-01 프레임 수신')).toBeInTheDocument();
    expect(within(logsDialog).getByText('현장 상태 스냅샷 수신')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '로그 닫기' }));
    fireEvent.click(screen.getByRole('button', { name: '위험 보기' }));

    expect(screen.queryByRole('dialog', { name: '위험 이벤트 상세' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '현장 상태' }));

    const fieldStateDialog = screen.getByRole('dialog', { name: '현장 상태 스냅샷' });
    expect(within(fieldStateDialog).getAllByText('worker_9')).toHaveLength(2);
    const eventFeed = screen.getByTestId('event-feed-list');
    const pinnedFeed = screen.getByTestId('event-feed-pinned');
    expect(eventFeed).toHaveClass('overflow-y-auto');
    expect(within(pinnedFeed).getByText('주의: 작업 반경 감시')).toBeInTheDocument();
    expect(within(pinnedFeed).getByText('경고: 작업자 접근')).toBeInTheDocument();
  });

  it('auto-opens only the hazard overlay from runtime events and keeps field state manual-only', () => {
    window.localStorage.setItem('excavator-safe-system:cctv-poc-ws-url', 'ws://localhost:9999/frames');
    window.localStorage.setItem('excavator-safe-system:sensor-bridge-ws-url', 'ws://localhost:8787');
    window.localStorage.setItem('excavator-safe-system:hazard-popup-duration-ms', '120');
    window.localStorage.setItem('excavator-safe-system:field-state-popup-duration-ms', '180');

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '카메라 연결' }));
    fireEvent.click(screen.getByRole('button', { name: '센서 연결' }));

    act(() => {
      MockWebSocket.instances[0].emitOpen();
      MockWebSocket.instances[1].emitOpen();
      emitCctvFrame({
        frame_index: 11,
        combined_ko: '작업자 위험 접근',
        top_event_ko: '경고: 작업자 접근',
        events_ko: ['작업자 접근'],
        zone_name: '굴착기 구역 A',
        distance_text: '약 1.8m',
        target_label: 'person',
        event_object_groups: [
          {
            event: {
              level: 'RISK',
              message_ko: '경고: 작업자 접근',
            },
            track_ids: [7],
          },
        ],
      });
      emitCctvFrame({
        frame_index: 12,
        combined_ko: '작업자 위험 접근 지속',
        top_event_ko: '경고: 작업자 접근',
        events_ko: ['작업자 접근'],
        zone_name: '굴착기 구역 A',
        distance_text: '약 1.8m',
        target_label: 'person',
        event_object_groups: [
          {
            event: {
              level: 'RISK',
              message_ko: '경고: 작업자 접근',
            },
            track_ids: [7],
          },
        ],
      });
      MockWebSocket.instances[1].emitMessage(
        JSON.stringify({
          type: 'frontend_state',
          timestamp: '2026-03-24T09:00:15+09:00',
          system: {
            sensor_server_online: true,
            zone_rule: {
              caution_distance_m: 5,
              danger_distance_m: 3,
            },
          },
          workers: [],
        })
      );
    });

    expect(screen.getByRole('dialog', { name: '위험 이벤트 상세' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '현장 상태 스냅샷' })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(120);
    });

    expect(screen.queryByRole('dialog', { name: '위험 이벤트 상세' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '현장 상태 스냅샷' })).not.toBeInTheDocument();
  });

  it('relays only unapproved external sensor snapshots to telegram', async () => {
    window.localStorage.setItem('excavator-safe-system:sensor-bridge-ws-url', 'ws://192.168.1.7:10000');
    window.localStorage.setItem('excavator-safe-system:telegram-bot-token', '8385397257:AAFS3n_zuXKfHW0K0lP2uk4rxz7pWb3AIVk');
    window.localStorage.setItem('excavator-safe-system:telegram-chat-ids', JSON.stringify(['8477727287']));

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '센서 연결' }));

    await act(async () => {
      MockWebSocket.instances[0].emitOpen();
      MockWebSocket.instances[0].emitMessage(
        JSON.stringify({
          type: 'frontend_state',
          timestamp: '2026-03-26T18:26:42.148+09:00',
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
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.telegram.org/bot8385397257:AAFS3n_zuXKfHW0K0lP2uk4rxz7pWb3AIVk/sendMessage',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: expect.stringContaining('[굴착기 센서 위험 알림]'),
      })
    );
  });

  it('does not relay approved sensor warnings to telegram', async () => {
    window.localStorage.setItem('excavator-safe-system:sensor-bridge-ws-url', 'ws://192.168.1.7:10000');
    window.localStorage.setItem('excavator-safe-system:telegram-bot-token', '8385397257:AAFS3n_zuXKfHW0K0lP2uk4rxz7pWb3AIVk');
    window.localStorage.setItem('excavator-safe-system:telegram-chat-ids', JSON.stringify(['8477727287']));

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '센서 연결' }));

    await act(async () => {
      MockWebSocket.instances[0].emitOpen();
      MockWebSocket.instances[0].emitMessage(
        JSON.stringify({
          type: 'frontend_state',
          timestamp: '2026-03-26T18:26:42.148+09:00',
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
      await Promise.resolve();
    });

    expect(fetch).not.toHaveBeenCalledWith(
      'https://api.telegram.org/bot8385397257:AAFS3n_zuXKfHW0K0lP2uk4rxz7pWb3AIVk/sendMessage',
      expect.anything()
    );
  });

  it('relays a newly qualified cctv risk popup to the local telegram bridge api once', async () => {
    window.localStorage.setItem('excavator-safe-system:cctv-poc-ws-url', 'ws://localhost:9999/frames');
    window.localStorage.setItem('excavator-safe-system:telegram-bot-token', '8385397257:AAFS3n_zuXKfHW0K0lP2uk4rxz7pWb3AIVk');
    window.localStorage.setItem('excavator-safe-system:telegram-chat-ids', JSON.stringify(['8477727287']));

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '카메라 연결' }));

    await act(async () => {
      MockWebSocket.instances[0].emitOpen();
      emitCctvFrame({
        frame_index: 21,
        combined_ko: '작업자 위험 접근',
        top_event_ko: '경고: 작업자 접근',
        events_ko: ['작업자 접근'],
        event_object_groups: [{ event: { level: 'RISK', message_ko: '경고: 작업자 접근' }, track_ids: [7] }],
      });
      emitCctvFrame({
        frame_index: 22,
        combined_ko: '작업자 위험 접근 지속',
        top_event_ko: '경고: 작업자 접근',
        events_ko: ['작업자 접근'],
        event_object_groups: [{ event: { level: 'RISK', message_ko: '경고: 작업자 접근' }, track_ids: [7] }],
      });
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.telegram.org/bot8385397257:AAFS3n_zuXKfHW0K0lP2uk4rxz7pWb3AIVk/sendPhoto',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      })
    );

    await act(async () => {
      emitCctvFrame({
        frame_index: 23,
        combined_ko: '작업자 위험 접근 지속',
        top_event_ko: '경고: 작업자 접근',
        events_ko: ['작업자 접근'],
        event_object_groups: [{ event: { level: 'RISK', message_ko: '경고: 작업자 접근' }, track_ids: [7] }],
      });
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('opens on 2 of the last 3 risk frames by default and extends the current risk popup timer when more qualifying frames arrive', () => {
    window.localStorage.setItem('excavator-safe-system:cctv-poc-ws-url', 'ws://localhost:9999/frames');
    window.localStorage.setItem('excavator-safe-system:hazard-popup-duration-ms', '120');

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '카메라 연결' }));

    act(() => {
      MockWebSocket.instances[0].emitOpen();
      emitCctvFrame({ frame_index: 11 });
      emitCctvFrame({
        frame_index: 12,
        combined_ko: '작업자 위험 접근',
        top_event_ko: '경고: 작업자 접근',
        events_ko: ['작업자 접근'],
        event_object_groups: [{ event: { level: 'RISK', message_ko: '경고: 작업자 접근' }, track_ids: [7] }],
      });
    });

    expect(screen.queryByRole('dialog', { name: '위험 이벤트 상세' })).not.toBeInTheDocument();

    act(() => {
      emitCctvFrame({
        frame_index: 13,
        combined_ko: '작업자 위험 접근 지속',
        top_event_ko: '경고: 작업자 접근',
        events_ko: ['작업자 접근'],
        event_object_groups: [{ event: { level: 'RISK', message_ko: '경고: 작업자 접근' }, track_ids: [7] }],
      });
    });

    expect(screen.getByRole('dialog', { name: '위험 이벤트 상세' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60);
      emitCctvFrame({
        frame_index: 14,
        combined_ko: '작업자 위험 접근 지속',
        top_event_ko: '경고: 작업자 접근',
        events_ko: ['작업자 접근'],
        event_object_groups: [{ event: { level: 'RISK', message_ko: '경고: 작업자 접근' }, track_ids: [7] }],
      });
    });

    act(() => {
      vi.advanceTimersByTime(59);
    });

    expect(screen.getByRole('dialog', { name: '위험 이벤트 상세' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(61);
    });

    expect(screen.queryByRole('dialog', { name: '위험 이벤트 상세' })).not.toBeInTheDocument();
  });

  it('keeps the popup content pinned to the last qualified risk snapshot even if a later normal frame lacks image data', () => {
    window.localStorage.setItem('excavator-safe-system:cctv-poc-ws-url', 'ws://localhost:9999/frames');

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '카메라 연결' }));

    act(() => {
      MockWebSocket.instances[0].emitOpen();
      emitCctvFrame({
        frame_index: 20,
        combined_ko: '작업자 위험 접근',
        top_event_ko: '경고: 작업자 접근',
        events_ko: ['작업자 접근'],
        event_object_groups: [{ event: { level: 'RISK', message_ko: '경고: 작업자 접근' }, track_ids: [7] }],
      });
      emitCctvFrame({
        frame_index: 21,
        combined_ko: '작업자 위험 접근 지속',
        top_event_ko: '경고: 작업자 접근',
        events_ko: ['작업자 접근'],
        event_object_groups: [{ event: { level: 'RISK', message_ko: '경고: 작업자 접근' }, track_ids: [7] }],
      });
    });

    const dialog = screen.getByRole('dialog', { name: '위험 이벤트 상세' });
    expect(within(dialog).getByText('경고: 작업자 접근')).toBeInTheDocument();

    act(() => {
      emitCctvFrame({
        frame_index: 22,
        combined_ko: '현장 상황: 현재 위험 이벤트 없음.',
        top_event_ko: '정상(이벤트 없음)',
        events_ko: [],
        event_object_groups: [],
        image_jpeg_base64: '',
      });
    });

    const stickyDialog = screen.getByRole('dialog', { name: '위험 이벤트 상세' });
    expect(within(stickyDialog).getByText('경고: 작업자 접근')).toBeInTheDocument();
    expect(within(stickyDialog).queryByText('아직 수신된 위험 프레임이 없습니다.')).not.toBeInTheDocument();
  });

  it('keeps log headers pinned while the log list scrolls and exposes the RTSP third-quadrant tile', () => {
    emitLiveData();

    fireEvent.click(screen.getByRole('button', { name: '로그 보기' }));

    expect(screen.getByRole('button', { name: 'CH-03 RTSP 실시간 모니터' })).toBeInTheDocument();
    expect(screen.getByTestId('cctv-log-list')).toHaveClass('overflow-y-auto');
    expect(screen.getByTestId('sensor-log-list')).toHaveClass('overflow-y-auto');
    expect(screen.getByTestId('cctv-log-header')).toHaveClass('sticky');
    expect(screen.getByTestId('sensor-log-header')).toHaveClass('sticky');
  });

  it('keeps sensor settings feedback out of the field-state viewer and shows only field-state-specific messaging', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('CCTV WebSocket URL'), {
      target: { value: 'ws://localhost:9999/frames' },
    });
    fireEvent.change(screen.getByLabelText('Sensor Bridge WebSocket URL'), {
      target: { value: 'ws://localhost:8787' },
    });
    fireEvent.click(screen.getByRole('button', { name: '기본 연결 적용' }));

    expect(screen.getByText('센서 브리지 주소를 저장했습니다.')).toBeInTheDocument();

    act(() => {
      vi.runOnlyPendingTimers();
    });

    fireEvent.click(screen.getByRole('button', { name: '설정 닫기' }));
    fireEvent.click(screen.getByRole('button', { name: '현장 상태' }));

    const emptyFieldStateDialog = screen.getByRole('dialog', { name: '현장 상태 스냅샷' });
    expect(within(emptyFieldStateDialog).getByText('아직 수신된 현장 상태 스냅샷이 없습니다.')).toBeInTheDocument();
    expect(within(emptyFieldStateDialog).queryByText('센서 브리지 주소를 저장했습니다.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '현장 상태 닫기' }));

    act(() => {
      MockWebSocket.instances[1].emitOpen();
      MockWebSocket.instances[1].emitMessage(
        JSON.stringify({
          type: 'frontend_state',
          timestamp: '2026-03-24T09:00:15+09:00',
          system: {
            sensor_server_online: true,
            zone_rule: {
              caution_distance_m: 5,
              danger_distance_m: 3,
            },
          },
          workers: [
            {
              tag_id: 11,
              name: 'worker_11',
              approved: false,
              connected: true,
              x: 1,
              y: 2,
              distance_m: 2.24,
              zone_status: 'danger',
              is_warning: true,
              is_emergency: true,
              last_update: '2026-03-24T09:00:14+09:00',
            },
          ],
        })
      );
    });

    fireEvent.click(screen.getByRole('button', { name: '현장 상태' }));

    const populatedFieldStateDialog = screen.getByRole('dialog', { name: '현장 상태 스냅샷' });
    expect(within(populatedFieldStateDialog).getAllByText('worker_11')).toHaveLength(2);
    expect(within(populatedFieldStateDialog).queryByText('센서 브리지 주소를 저장했습니다.')).not.toBeInTheDocument();
    expect(within(populatedFieldStateDialog).queryByText('아직 수신된 현장 상태 스냅샷이 없습니다.')).not.toBeInTheDocument();
  });

  it('opens a sensor emergency popup on a random recent CH-01/CH-02 frame and keeps its bbox overlay', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.75);
    window.localStorage.setItem('excavator-safe-system:cctv-poc-ws-url', 'ws://localhost:9999/frames');
    window.localStorage.setItem('excavator-safe-system:sensor-bridge-ws-url', 'ws://localhost:8787');
    window.localStorage.setItem('excavator-safe-system:hazard-popup-duration-ms', '5000');

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '카메라 연결' }));
    fireEvent.click(screen.getByRole('button', { name: '센서 연결' }));

    act(() => {
      MockWebSocket.instances[0].emitOpen();
      MockWebSocket.instances[1].emitOpen();
      emitCctvFrame({
        source_id: 'cam1',
        frame_index: 31,
        combined_ko: 'CH-01 최신 프레임',
        top_event_ko: '정상(이벤트 없음)',
        events_ko: [],
        objects: [{ track_id: 7, label: 'person', bbox_xyxy: [240, 120, 560, 920] }],
        image_jpeg_base64: FRAME_IMAGE,
      });
      emitCctvFrame({
        source_id: 'cam2',
        frame_index: 44,
        combined_ko: 'CH-02 최신 프레임',
        top_event_ko: '정상(이벤트 없음)',
        events_ko: [],
        objects: [
          { track_id: 21, label: 'person', bbox_xyxy: [320, 180, 620, 900] },
          { track_id: 22, label: 'machinery', bbox_xyxy: [760, 200, 1490, 1020] },
        ],
        event_object_groups: [
          {
            event: {
              level: 'WARNING',
              message_ko: '주의: 작업자-장비 접근',
            },
            track_ids: [21, 22],
            relations: [
              {
                a_label: 'person',
                b_label: 'machinery',
                a_id: 21,
                b_id: 22,
                d_over_person_height: 0.9,
              },
            ],
          },
        ],
        image_jpeg_base64: FRAME_IMAGE,
      });
      MockWebSocket.instances[1].emitMessage(
        JSON.stringify({
          type: 'frontend_state',
          timestamp: '2026-03-26T15:49:52+09:00',
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
              x: -0.68,
              y: 1.41,
              distance_m: 1.57,
              zone_status: 'danger',
              is_warning: true,
              is_emergency: true,
              last_update: '2026-03-25T18:26:42.158+09:00',
            },
          ],
        })
      );
    });

    const hazardDialog = screen.getByRole('dialog', { name: '위험 이벤트 상세' });
    expect(within(hazardDialog).getByText('CH-02')).toBeInTheDocument();
    expect(within(hazardDialog).getAllByText('센서에서 위험이 감지되었습니다!').length).toBeGreaterThan(0);
    expect(within(hazardDialog).getByAltText('굴착기 구역 B 위험 프레임')).toHaveAttribute('src', FRAME_IMAGE);
    expect(within(hazardDialog).getByTestId('hazard-box-21')).toHaveAttribute('stroke', '#4b8eff');
    expect(within(hazardDialog).getByTestId('hazard-box-22')).toHaveAttribute('stroke', '#4b8eff');
  });
});
