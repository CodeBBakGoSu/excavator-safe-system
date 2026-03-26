import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../../App';

const FRAME_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

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

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
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
    event_object_groups: Array<{ event: { level: string; message_ko: string }; track_ids: number[] }>;
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

  render(<App />);

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
}

describe('IndustrialCommandApp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders a fixed four-slot monitor grid and keeps telemetry below the CCTV surface', () => {
    const { container } = render(<App />);

    const appShell = container.querySelector('main');
    const monitorRegion = screen.getByRole('region', { name: 'Primary monitor area' });
    const telemetryHeading = screen.getByText('시스템 로그 요약');
    const monitorGrid = container.querySelector('[data-testid="monitor-grid"]');

    expect(appShell?.className).not.toContain('lg:grid-cols-[minmax(0,1fr)_320px]');
    expect(appShell?.className).toContain('grid-cols-1');
    expect(monitorGrid?.className).toContain('sm:grid-cols-2');
    expect(screen.getAllByRole('button', { name: /CH-0[1-4]/ })).toHaveLength(4);
    expect(monitorRegion.compareDocumentPosition(telemetryHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

    expect(screen.getByText('CH-02 굴착기 구역 B')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '위험 이벤트 상세' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '로그 보기' }));

    const logsDialog = screen.getByRole('dialog', { name: '로그 뷰어' });
    expect(within(logsDialog).getByText('CH-01 프레임 수신')).toBeInTheDocument();
    expect(within(logsDialog).getByText('현장 상태 스냅샷 수신')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '로그 닫기' }));
    fireEvent.click(screen.getByRole('button', { name: '위험 보기' }));

    const hazardDialog = screen.getByRole('dialog', { name: '위험 이벤트 상세' });
    expect(within(hazardDialog).getByText('CH-02')).toBeInTheDocument();
    expect(within(hazardDialog).getAllByText('주의: 작업 반경 감시').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: '위험 보기 닫기' }));
    fireEvent.click(screen.getByRole('button', { name: '현장 상태' }));

    const fieldStateDialog = screen.getByRole('dialog', { name: '현장 상태 스냅샷' });
    expect(within(fieldStateDialog).getAllByText('worker_9')).toHaveLength(2);
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
    expect(within(dialog).getByText('작업자 위험 접근 지속')).toBeInTheDocument();

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
    expect(within(stickyDialog).getByText('작업자 위험 접근 지속')).toBeInTheDocument();
    expect(within(stickyDialog).queryByText('프레임 세부 요약이 수신되면 여기에 표시됩니다.')).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: '적용' }));

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
              approved: true,
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
});
