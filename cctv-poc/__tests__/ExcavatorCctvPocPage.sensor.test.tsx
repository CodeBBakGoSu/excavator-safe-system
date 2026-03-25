import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { useIndustrialMonitorRuntime } from '../../src/features/industrial-command/runtime/useIndustrialMonitorRuntime';

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
  deferCloseNotification = false;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    if (this.deferCloseNotification) {
      this.readyState = MockWebSocket.CLOSING;
      return;
    }
    this.emitClose();
  }

  emitOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  emitMessage(data: string) {
    this.onmessage?.({ data } as MessageEvent<string>);
  }

  emitClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

function IndustrialMonitorRuntimeHarness() {
  const runtime = useIndustrialMonitorRuntime();

  return (
    <div>
      <output data-testid="cctv-url">{runtime.wsUrl}</output>
      <output data-testid="sensor-url">{runtime.sensorBridgeUrl}</output>
      <output data-testid="popup-channel-id">{runtime.popupChannelId ?? 'closed'}</output>
      <output data-testid="sensor-popup-state">{runtime.sensorPopupOpen ? 'open' : 'closed'}</output>
      <button type="button" onClick={() => runtime.connectSocket(runtime.wsUrl)}>
        Connect CCTV Runtime
      </button>
      <button type="button" onClick={() => runtime.updateWsDraft('ws://localhost:9998/frames')}>
        Draft CCTV Apply URL
      </button>
      <button type="button" onClick={runtime.applyWsUrl}>
        Apply CCTV Runtime URL
      </button>
      <button type="button" onClick={runtime.disconnectSocket}>
        Disconnect CCTV Runtime
      </button>
      <button type="button" onClick={() => runtime.connectSensorSocket(runtime.sensorBridgeUrl)}>
        Connect Sensor Runtime
      </button>
      <button type="button" onClick={() => runtime.updateSensorBridgeDraft('ws://localhost:8788')}>
        Draft Sensor Apply URL
      </button>
      <button type="button" onClick={runtime.applySensorBridgeUrl}>
        Apply Sensor Runtime URL
      </button>
      <button type="button" onClick={runtime.disconnectSensorSocket}>
        Disconnect Sensor Runtime
      </button>
      <button type="button" onClick={() => runtime.openChannelPopup(1)}>
        Open Channel Popup
      </button>
      <ul aria-label="sensor runtime logs">
        {runtime.sensorLogs.map((entry) => (
          <li key={entry.id}>{entry.summary}</li>
        ))}
      </ul>
    </div>
  );
}

describe('IndustrialCommandApp sensor flow', () => {
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

  it('applies the stored sensor url and updates manual-preview/log runtime state from frontend snapshots', () => {
    window.localStorage.setItem('excavator-safe-system:sensor-bridge-ws-url', 'ws://localhost:8787');

    render(<IndustrialMonitorRuntimeHarness />);

    expect(screen.getByTestId('sensor-url')).toHaveTextContent('ws://localhost:8787');

    fireEvent.click(screen.getByRole('button', { name: 'Connect Sensor Runtime' }));

    act(() => {
      MockWebSocket.instances[0].emitOpen();
      MockWebSocket.instances[0].emitMessage(
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
          workers: [],
        })
      );
    });

    expect(screen.getByTestId('sensor-popup-state')).toHaveTextContent('closed');
    expect(screen.getByRole('list', { name: 'sensor runtime logs' })).toHaveTextContent('현장 상태 스냅샷 수신');
  });

  it('does not auto-reconnect the sensor socket after a manual disconnect', () => {
    window.localStorage.setItem('excavator-safe-system:sensor-bridge-ws-url', 'ws://localhost:8787');

    render(<IndustrialMonitorRuntimeHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect Sensor Runtime' }));

    act(() => {
      MockWebSocket.instances[0].emitOpen();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Sensor Runtime' }));

    act(() => {
      vi.runAllTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('does not auto-reconnect the cctv socket after a manual disconnect', () => {
    window.localStorage.setItem('excavator-safe-system:cctv-poc-ws-url', 'ws://localhost:9999/frames');

    render(<IndustrialMonitorRuntimeHarness />);

    expect(screen.getByTestId('cctv-url')).toHaveTextContent('ws://localhost:9999/frames');

    fireEvent.click(screen.getByRole('button', { name: 'Connect CCTV Runtime' }));

    act(() => {
      MockWebSocket.instances[0].emitOpen();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect CCTV Runtime' }));

    act(() => {
      vi.runAllTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('keeps a manually reopened channel popup open when an old auto-close timer expires', () => {
    window.localStorage.setItem('excavator-safe-system:cctv-poc-ws-url', 'ws://localhost:9999/frames');

    render(<IndustrialMonitorRuntimeHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect CCTV Runtime' }));

    act(() => {
      MockWebSocket.instances[0].emitOpen();
      MockWebSocket.instances[0].emitMessage(
        JSON.stringify({
          source_id: 'cam1',
          frame_index: 33,
          event_object_groups: [
            {
              event: {
                level: 'RISK',
                message_ko: '경고: 위험 접근',
              },
              relations: [
                {
                  a_label: 'person',
                  b_label: 'machinery',
                  a_id: 1,
                  b_id: 2,
                  d_over_person_height: 0.5,
                },
              ],
            },
          ],
          objects: [],
          image_jpeg_base64: 'abc123',
        })
      );
    });

    expect(screen.getByTestId('popup-channel-id')).toHaveTextContent('1');

    act(() => {
      vi.advanceTimersByTime(1900);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Channel Popup' }));

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByTestId('popup-channel-id')).toHaveTextContent('1');
  });

  it('keeps the active cctv socket reference when the old socket closes late after apply', () => {
    window.localStorage.setItem('excavator-safe-system:cctv-poc-ws-url', 'ws://localhost:9999/frames');

    render(<IndustrialMonitorRuntimeHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect CCTV Runtime' }));

    act(() => {
      MockWebSocket.instances[0].emitOpen();
    });

    const originalSocket = MockWebSocket.instances[0];
    originalSocket.deferCloseNotification = true;

    fireEvent.click(screen.getByRole('button', { name: 'Draft CCTV Apply URL' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply CCTV Runtime URL' }));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.instances[1].url).toBe('ws://localhost:9998/frames');

    act(() => {
      originalSocket.emitClose();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect CCTV Runtime' }));

    expect(MockWebSocket.instances[1].readyState).toBe(MockWebSocket.CLOSED);

    act(() => {
      vi.runAllTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('keeps the active sensor socket reference when the old socket closes late after apply', () => {
    window.localStorage.setItem('excavator-safe-system:sensor-bridge-ws-url', 'ws://localhost:8787');

    render(<IndustrialMonitorRuntimeHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect Sensor Runtime' }));

    act(() => {
      MockWebSocket.instances[0].emitOpen();
    });

    const originalSocket = MockWebSocket.instances[0];
    originalSocket.deferCloseNotification = true;

    fireEvent.click(screen.getByRole('button', { name: 'Draft Sensor Apply URL' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply Sensor Runtime URL' }));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.instances[1].url).toBe('ws://localhost:8788');

    act(() => {
      originalSocket.emitClose();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Sensor Runtime' }));

    expect(MockWebSocket.instances[1].readyState).toBe(MockWebSocket.CLOSED);

    act(() => {
      vi.runAllTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('shows sensor logs in a modal and saves them through the bridge server after a frontend_state payload arrives', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fileName: 'sensor-log-2026-03-24_00-41-12.txt',
        savedPath: 'runtime-logs/sensor-log-2026-03-24_00-41-12.txt',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByPlaceholderText('ws://localhost:8787'), {
      target: { value: 'ws://localhost:8787' },
    });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    fireEvent.click(screen.getByRole('button', { name: '센서 연결' }));

    act(() => {
      vi.runOnlyPendingTimers();
      MockWebSocket.instances[0].emitOpen();
      MockWebSocket.instances[0].emitMessage(
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
          workers: [],
        })
      );
    });

    fireEvent.click(screen.getByRole('button', { name: '로그 보기' }));

    expect(screen.getByRole('heading', { name: '로그 뷰어', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('현장 상태 스냅샷 수신')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '센서 로그 저장' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8787/logs');
    expect(screen.getByText(/sensor-log-2026-03-24_00-41-12\.txt/)).toBeInTheDocument();
  });

  it('shows CCTV logs in a modal after a frame payload arrives', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByPlaceholderText('ws://host:port/path'), {
      target: { value: 'ws://localhost:9999/frames' },
    });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    fireEvent.click(screen.getByRole('button', { name: '카메라 연결' }));

    act(() => {
      vi.runOnlyPendingTimers();
      MockWebSocket.instances[0].emitOpen();
      MockWebSocket.instances[0].emitMessage(
        JSON.stringify({
          source_id: 'cam1',
          frame_index: 12,
          message_ko: '정상',
          objects: [],
          image_jpeg_base64: 'abc123',
        })
      );
    });

    fireEvent.click(screen.getByRole('button', { name: '로그 보기' }));

    expect(screen.getByRole('heading', { name: '로그 뷰어', level: 2 })).toBeInTheDocument();
    expect(screen.getAllByText('CH-01 프레임 수신').length).toBeGreaterThan(0);
  });

  it('stores the sensor bridge URL and lets operators open the latest frontend state snapshot manually', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByPlaceholderText('ws://localhost:8787'), {
      target: { value: 'ws://localhost:8787' },
    });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    fireEvent.click(screen.getByRole('button', { name: '센서 연결' }));
    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(window.localStorage.getItem('excavator-safe-system:sensor-bridge-ws-url')).toBe('ws://localhost:8787');
    expect(MockWebSocket.instances).toHaveLength(1);

    act(() => {
      MockWebSocket.instances[0].emitOpen();
      MockWebSocket.instances[0].emitMessage(
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
              tag_id: 7,
              name: 'worker_7',
              approved: false,
              connected: true,
              x: 8,
              y: 13,
              distance_m: 15.26,
              zone_status: 'danger',
              is_warning: true,
              is_emergency: true,
              last_update: '2026-03-22T20:30:15.080+09:00',
            },
          ],
        })
      );
    });

    expect(screen.queryByText('현장 상태 스냅샷')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '현장 상태' }));

    expect(screen.getByText('현장 상태 스냅샷')).toBeInTheDocument();
    expect(screen.getAllByText('worker_7')).toHaveLength(2);
    expect(screen.getByText('위험 작업자 1명')).toBeInTheDocument();
  });

  it('opens the latest frontend state popup from the manual preview button', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByPlaceholderText('ws://localhost:8787'), {
      target: { value: 'ws://localhost:8787' },
    });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    fireEvent.click(screen.getByRole('button', { name: '센서 연결' }));

    act(() => {
      vi.runOnlyPendingTimers();
      MockWebSocket.instances[0].emitOpen();
      MockWebSocket.instances[0].emitMessage(
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
              last_update: '2026-03-22T20:30:15.080+09:00',
            },
          ],
        })
      );
    });

    fireEvent.click(screen.getByRole('button', { name: '현장 상태' }));

    expect(screen.getByText('현장 상태 스냅샷')).toBeInTheDocument();
    expect(screen.getAllByText('worker_9')).toHaveLength(2);
  });

  it('shows an inline message when the manual snapshot button is pressed before any snapshot arrives', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '현장 상태' }));

    expect(screen.getByText('현장 상태 스냅샷')).toBeInTheDocument();
    expect(screen.getByText('아직 수신된 작업자 위치 데이터가 없습니다.')).toBeInTheDocument();
  });
});
