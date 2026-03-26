import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelRuntimeState } from '../../../../cctv-poc/types';
import App from '../../../App';
import { IndustrialCommandShell } from '../components/IndustrialCommandShell';
import type { IndustrialMonitorRuntime } from '../runtime/useIndustrialMonitorRuntime';

function noop() {}

async function noopAsync() {}

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
}

function createRuntimeState(overrides: Partial<ChannelRuntimeState> = {}): ChannelRuntimeState {
  return {
    connectionStatus: 'idle',
    reconnectAttempt: 0,
    errorMessage: null,
    currentImage: null,
    latestFrame: {
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
    },
    visualFrame: {
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
    },
    imageNaturalSize: null,
    alertTier: 'normal',
    alertEligible: false,
    incomingFps: 0,
    lastMessageAt: null,
    topEventFlash: false,
    ...overrides,
  };
}

function createCallbackRecorder() {
  return {
    updateWsDraft: vi.fn(),
    updateSensorBridgeDraft: vi.fn(),
    updateRtspControlDraft: vi.fn(),
    updateRtspUrlDraft: vi.fn(),
    updateOverlayDisplayMode: vi.fn(),
    setPopupDurationMs: vi.fn(),
    setSensorPopupDurationMs: vi.fn(),
    applyWsUrl: vi.fn(),
    applySensorBridgeUrl: vi.fn(),
    applyRtspControlUrl: vi.fn(),
    applyRtspUrl: vi.fn(),
    startRtspStream: vi.fn().mockResolvedValue(undefined),
    stopRtspStream: vi.fn().mockResolvedValue(undefined),
  };
}

function SettingsWorkflowHarness({
  recorder,
}: {
  recorder: ReturnType<typeof createCallbackRecorder>;
}) {
  const [wsDraft, setWsDraft] = useState('ws://initial-cctv');
  const [sensorBridgeDraft, setSensorBridgeDraft] = useState('ws://initial-sensor');
  const [rtspControlDraft, setRtspControlDraft] = useState('http://initial-rtsp-control');
  const [rtspUrlDraft, setRtspUrlDraft] = useState('rtsp://initial-camera/stream');
  const [overlayDisplayMode, setOverlayDisplayMode] = useState<'always' | 'alert' | 'risk'>('always');
  const [popupDurationMs, setPopupDurationMs] = useState(2000);
  const [sensorPopupDurationMs, setSensorPopupDurationMs] = useState(3200);

  const runtime = {
    wsUrl: 'ws://saved-cctv',
    wsDraft,
    sensorBridgeUrl: 'ws://saved-sensor',
    sensorBridgeDraft,
    rtspControlUrl: 'http://saved-rtsp-control',
    rtspControlDraft,
    rtspUrl: 'rtsp://saved-camera/stream',
    rtspUrlDraft,
    rtspStreamStatus: 'idle',
    rtspStreamMessage: null,
    rtspPlaybackUrl: null,
    bboxVisible: true,
    overlayDisplayMode,
    popupDurationMs,
    sensorPopupDurationMs,
    runtimeMap: {
      1: createRuntimeState(),
      2: createRuntimeState(),
      3: createRuntimeState(),
      4: createRuntimeState(),
    },
    configMessage: null,
    focusedChannelId: 1,
    popupChannelId: null,
    sensorConnectionStatus: 'idle',
    sensorReconnectAttempt: 0,
    sensorSettingsMessage: null,
    fieldStateMessage: null,
    sensorSnapshot: null,
    sensorPopupOpen: false,
    sensorLogs: [],
    cctvLogs: [],
    logActionMessage: null,
    savingLogType: null,
    updateWsDraft: (value: string) => {
      recorder.updateWsDraft(value);
      setWsDraft(value);
    },
    updateSensorBridgeDraft: (value: string) => {
      recorder.updateSensorBridgeDraft(value);
      setSensorBridgeDraft(value);
    },
    updateRtspUrlDraft: (value: string) => {
      recorder.updateRtspUrlDraft(value);
      setRtspUrlDraft(value);
    },
    updateRtspControlDraft: (value: string) => {
      recorder.updateRtspControlDraft(value);
      setRtspControlDraft(value);
    },
    updateBboxVisible: noop,
    updateOverlayDisplayMode: (value: 'always' | 'alert' | 'risk') => {
      recorder.updateOverlayDisplayMode(value);
      setOverlayDisplayMode(value);
    },
    setPopupDurationMs: (value: number) => {
      recorder.setPopupDurationMs(value);
      setPopupDurationMs(value);
    },
    setSensorPopupDurationMs: (value: number) => {
      recorder.setSensorPopupDurationMs(value);
      setSensorPopupDurationMs(value);
    },
    focusChannel: noop,
    connectSocket: noop,
    disconnectSocket: noop,
    connectSensorSocket: noop,
    disconnectSensorSocket: noop,
    applyWsUrl: recorder.applyWsUrl,
    applySensorBridgeUrl: recorder.applySensorBridgeUrl,
    applyRtspControlUrl: recorder.applyRtspControlUrl,
    applyRtspUrl: recorder.applyRtspUrl,
    startRtspStream: recorder.startRtspStream,
    stopRtspStream: recorder.stopRtspStream,
    openChannelPopup: noop,
    closeChannelPopup: noop,
    openSensorSnapshotPreview: noop,
    closeSensorPopup: noop,
    updateChannelImageNaturalSize: noop,
    saveLogsToServer: noopAsync,
  } satisfies IndustrialMonitorRuntime;

  return <IndustrialCommandShell runtime={runtime} />;
}

describe('SettingsModal', () => {
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

  it('opens settings from the gear icon, keeps drafts editable, and applies runtime callbacks', () => {
    const recorder = createCallbackRecorder();

    render(<SettingsWorkflowHarness recorder={recorder} />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(screen.getByRole('dialog', { name: '설정' })).toBeInTheDocument();
    expect(screen.getByLabelText('CCTV WebSocket URL')).toHaveValue('ws://initial-cctv');
    expect(screen.getByLabelText('Sensor Bridge WebSocket URL')).toHaveValue('ws://initial-sensor');
    expect(screen.getByLabelText('RTSP Control API URL')).toHaveValue('http://initial-rtsp-control');
    expect(screen.getByLabelText('RTSP URL')).toHaveValue('rtsp://initial-camera/stream');
    expect(screen.getByLabelText('BBOX 표시 여부')).toHaveValue('true');
    expect(screen.getByLabelText('박스 표시 조건')).toHaveValue('always');
    expect(screen.getByLabelText('위험 팝업 시간(ms)')).toHaveValue(2000);
    expect(screen.getByLabelText('현장 상태 팝업 시간(ms)')).toHaveValue(3200);

    fireEvent.change(screen.getByLabelText('CCTV WebSocket URL'), {
      target: { value: 'ws://localhost:9999/frames' },
    });
    fireEvent.change(screen.getByLabelText('Sensor Bridge WebSocket URL'), {
      target: { value: 'ws://localhost:8787' },
    });
    fireEvent.change(screen.getByLabelText('RTSP Control API URL'), {
      target: { value: 'http://192.168.1.7:10000' },
    });
    fireEvent.change(screen.getByLabelText('RTSP URL'), {
      target: { value: 'rtsp://10.0.0.5/live.sdp' },
    });
    fireEvent.change(screen.getByLabelText('박스 표시 조건'), {
      target: { value: 'risk' },
    });
    fireEvent.change(screen.getByLabelText('위험 팝업 시간(ms)'), {
      target: { value: '4500' },
    });
    fireEvent.change(screen.getByLabelText('현장 상태 팝업 시간(ms)'), {
      target: { value: '6200' },
    });

    expect(recorder.updateWsDraft).toHaveBeenLastCalledWith('ws://localhost:9999/frames');
    expect(recorder.updateSensorBridgeDraft).toHaveBeenLastCalledWith('ws://localhost:8787');
    expect(recorder.updateRtspControlDraft).toHaveBeenLastCalledWith('http://192.168.1.7:10000');
    expect(recorder.updateRtspUrlDraft).toHaveBeenLastCalledWith('rtsp://10.0.0.5/live.sdp');
    expect(recorder.updateOverlayDisplayMode).toHaveBeenLastCalledWith('risk');
    expect(screen.getByLabelText('CCTV WebSocket URL')).toHaveValue('ws://localhost:9999/frames');
    expect(screen.getByLabelText('Sensor Bridge WebSocket URL')).toHaveValue('ws://localhost:8787');
    expect(screen.getByLabelText('RTSP Control API URL')).toHaveValue('http://192.168.1.7:10000');
    expect(screen.getByLabelText('RTSP URL')).toHaveValue('rtsp://10.0.0.5/live.sdp');
    expect(screen.getByLabelText('박스 표시 조건')).toHaveValue('risk');
    expect(screen.getByLabelText('위험 팝업 시간(ms)')).toHaveValue(4500);
    expect(screen.getByLabelText('현장 상태 팝업 시간(ms)')).toHaveValue(6200);
    expect(recorder.setPopupDurationMs).not.toHaveBeenCalled();
    expect(recorder.setSensorPopupDurationMs).not.toHaveBeenCalled();
    expect(recorder.applyWsUrl).not.toHaveBeenCalled();
    expect(recorder.applySensorBridgeUrl).not.toHaveBeenCalled();
    expect(recorder.applyRtspControlUrl).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '적용' }));

    expect(recorder.setPopupDurationMs).toHaveBeenCalledWith(4500);
    expect(recorder.setSensorPopupDurationMs).toHaveBeenCalledWith(6200);
    expect(recorder.applyWsUrl).toHaveBeenCalledOnce();
    expect(recorder.applySensorBridgeUrl).toHaveBeenCalledOnce();
    expect(recorder.applyRtspControlUrl).toHaveBeenCalledOnce();
    expect(recorder.applyRtspUrl).toHaveBeenCalledOnce();
    expect(recorder.startRtspStream).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'RTSP 시작' }));
    fireEvent.click(screen.getByRole('button', { name: 'RTSP 중지' }));

    expect(recorder.startRtspStream).toHaveBeenCalledOnce();
    expect(recorder.stopRtspStream).toHaveBeenCalledOnce();
  });

  it('persists popup duration edits to localStorage through the real runtime path', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    fireEvent.change(screen.getByLabelText('CCTV WebSocket URL'), {
      target: { value: 'ws://localhost:9999/frames' },
    });
    fireEvent.change(screen.getByLabelText('Sensor Bridge WebSocket URL'), {
      target: { value: 'ws://localhost:8787' },
    });
    fireEvent.change(screen.getByLabelText('RTSP Control API URL'), {
      target: { value: 'http://192.168.1.7:10000' },
    });
    fireEvent.change(screen.getByLabelText('위험 팝업 시간(ms)'), {
      target: { value: '4500' },
    });
    fireEvent.change(screen.getByLabelText('현장 상태 팝업 시간(ms)'), {
      target: { value: '6200' },
    });

    fireEvent.click(screen.getByRole('button', { name: '적용' }));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(window.localStorage.getItem('excavator-safe-system:hazard-popup-duration-ms')).toBe('4500');
    expect(window.localStorage.getItem('excavator-safe-system:field-state-popup-duration-ms')).toBe('6200');
    expect(window.localStorage.getItem('excavator-safe-system:rtsp-control-api-url')).toBe('http://192.168.1.7:10000');
  });
});
