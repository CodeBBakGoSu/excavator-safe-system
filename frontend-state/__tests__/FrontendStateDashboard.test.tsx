import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FrontendStateDashboard from '../FrontendStateDashboard';

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

const snapshot = {
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
      tag_id: 2,
      name: 'worker_2',
      approved: true,
      connected: true,
      x: 4.2,
      y: 1.1,
      distance_m: 4.34,
      zone_status: 'caution',
      is_warning: true,
      is_emergency: false,
      last_update: '2026-03-22T20:30:15.080+09:00',
    },
    {
      tag_id: 1,
      name: 'worker_1',
      approved: false,
      connected: false,
      x: 1.25,
      y: -0.85,
      distance_m: 1.51,
      zone_status: 'danger',
      is_warning: true,
      is_emergency: true,
      last_update: '2026-03-22T20:30:15.080+09:00',
    },
  ],
};

describe('FrontendStateDashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stores the bridge URL, connects, and renders prioritized workers from incoming snapshots', () => {
    render(<FrontendStateDashboard />);

    fireEvent.change(screen.getByPlaceholderText('ws://localhost:8787'), {
      target: { value: 'ws://localhost:8787' },
    });
    fireEvent.click(screen.getByRole('button', { name: '저장 후 연결' }));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(window.localStorage.getItem('excavator-safe-system:frontend-state-ws-url')).toBe('ws://localhost:8787');
    expect(MockWebSocket.instances).toHaveLength(1);

    act(() => {
      MockWebSocket.instances[0].emitOpen();
      MockWebSocket.instances[0].emitMessage(JSON.stringify(snapshot));
    });

    expect(screen.getByText('연결됨')).toBeInTheDocument();
    expect(screen.getByText('ONLINE')).toBeInTheDocument();
    expect(screen.getByText('주의 반경 5m')).toBeInTheDocument();
    expect(screen.getByText('경고 반경 3m')).toBeInTheDocument();

    const workerItems = screen.getAllByRole('listitem');
    expect(within(workerItems[0]).getByText('worker_1')).toBeInTheDocument();
    expect(within(workerItems[0]).getByText('연결 끊김')).toBeInTheDocument();
    expect(within(workerItems[1]).getByText('승인됨')).toBeInTheDocument();
  });

  it('renders fixed plot markers and zone guides for incoming worker coordinates', () => {
    render(<FrontendStateDashboard />);

    fireEvent.change(screen.getByPlaceholderText('ws://localhost:8787'), {
      target: { value: 'ws://localhost:8787' },
    });
    fireEvent.click(screen.getByRole('button', { name: '저장 후 연결' }));

    act(() => {
      vi.runOnlyPendingTimers();
      MockWebSocket.instances[0].emitOpen();
      MockWebSocket.instances[0].emitMessage(JSON.stringify(snapshot));
    });

    expect(screen.getByTestId('danger-zone-guide')).toBeInTheDocument();
    expect(screen.getByTestId('caution-zone-guide')).toBeInTheDocument();
    expect(screen.getByTestId('worker-marker-1')).toHaveStyle({ left: '52.5%', top: '51.7%' });
    expect(screen.getByTestId('worker-marker-2')).toHaveStyle({ left: '58.4%', top: '47.8%' });
  });
});
