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
      relationTrackIds: [],
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
      relationTrackIds: [],
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
    updateCameraDisplayCount: vi.fn(),
    updateOverlayDisplayMode: vi.fn(),
    updateHazardPopupDebounceMode: vi.fn(),
    updateTag3DangerPopupOnly: vi.fn(),
    setPopupDurationMs: vi.fn(),
    setSensorPopupDurationMs: vi.fn(),
    applyWsUrl: vi.fn(),
    applySensorBridgeUrl: vi.fn(),
    applyRtspControlUrl: vi.fn(),
    applyRtspUrl: vi.fn(),
    startRtspStream: vi.fn().mockResolvedValue(undefined),
    stopRtspStream: vi.fn().mockResolvedValue(undefined),
    refreshTelegramSettings: vi.fn().mockResolvedValue(undefined),
    updateTelegramBotTokenDraft: vi.fn(),
    updateTelegramChatSelection: vi.fn(),
    updateTelegramAutoSync: vi.fn(),
    updateTelegramSensorCooldownDraft: vi.fn(),
    syncTelegramChats: vi.fn().mockResolvedValue(undefined),
    applyTelegramSettings: vi.fn().mockResolvedValue(undefined),
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
  const [cameraDisplayCount, setCameraDisplayCount] = useState<2 | 4>(4);
  const [overlayDisplayMode, setOverlayDisplayMode] = useState<'always' | 'alert' | 'risk'>('always');
  const [hazardPopupDebounceMode, setHazardPopupDebounceMode] = useState<
    'recent_three_frames_two_risks' | 'consecutive_two_risks'
  >('recent_three_frames_two_risks');
  const [tag3DangerPopupOnly, setTag3DangerPopupOnly] = useState(false);
  const [popupDurationMs, setPopupDurationMs] = useState(2000);
  const [sensorPopupDurationMs, setSensorPopupDurationMs] = useState(3200);
  const [telegramBotTokenDraft, setTelegramBotTokenDraft] = useState('');
  const [telegramSensorCooldownDraft, setTelegramSensorCooldownDraft] = useState('5');
  const [telegramAutoSync, setTelegramAutoSync] = useState(true);
  const [telegramSelectedChatIds, setTelegramSelectedChatIds] = useState<string[]>(['8477727287']);

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
    cameraDisplayCount,
    hiddenChannelIds: [],
    bboxVisible: true,
    overlayDisplayMode,
    hazardPopupDebounceMode,
    tag3DangerPopupOnly,
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
    popupSnapshot: null,
    nearestSensorWorker: null,
    sensorGateState: 'no_sensor',
    effectiveHazardState: 'safe',
    latestRiskChannelId: null,
    latestFrameChannelId: null,
    sensorConnectionStatus: 'idle',
    sensorReconnectAttempt: 0,
    sensorSettingsMessage: null,
    fieldStateMessage: null,
    sensorSnapshot: null,
    sensorPopupOpen: false,
    telegramSettingsMessage: null,
    telegramBotTokenConfigured: true,
    telegramBotTokenMasked: '8385********AIVk',
    telegramBotTokenDraft,
    telegramKnownChats: [
      {
        id: '8477727287',
        type: 'private',
        title: '기현 홍',
        selected: telegramSelectedChatIds.includes('8477727287'),
      },
    ],
    telegramSelectedChatIds,
    telegramAutoSync,
    telegramSensorAlertCooldownMs: 5000,
    telegramSensorCooldownDraft,
    telegramSyncingChats: false,
    telegramSavingSettings: false,
    sensorLogs: [],
    cctvLogs: [],
    eventFeed: [],
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
    updateCameraDisplayCount: (value: 2 | 4) => {
      recorder.updateCameraDisplayCount(value);
      setCameraDisplayCount(value);
    },
    updateBboxVisible: noop,
    updateOverlayDisplayMode: (value: 'always' | 'alert' | 'risk') => {
      recorder.updateOverlayDisplayMode(value);
      setOverlayDisplayMode(value);
    },
    updateHazardPopupDebounceMode: (value: 'recent_three_frames_two_risks' | 'consecutive_two_risks') => {
      recorder.updateHazardPopupDebounceMode(value);
      setHazardPopupDebounceMode(value);
    },
    updateTag3DangerPopupOnly: (value: boolean) => {
      recorder.updateTag3DangerPopupOnly(value);
      setTag3DangerPopupOnly(value);
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
    refreshTelegramSettings: recorder.refreshTelegramSettings,
    updateTelegramBotTokenDraft: (value: string) => {
      recorder.updateTelegramBotTokenDraft(value);
      setTelegramBotTokenDraft(value);
    },
    updateTelegramChatSelection: (chatId: string, selected: boolean) => {
      recorder.updateTelegramChatSelection(chatId, selected);
      setTelegramSelectedChatIds((prev) =>
        selected ? [...prev, chatId] : prev.filter((entry) => entry !== chatId)
      );
    },
    updateTelegramAutoSync: (value: boolean) => {
      recorder.updateTelegramAutoSync(value);
      setTelegramAutoSync(value);
    },
    updateTelegramSensorCooldownDraft: (value: string) => {
      recorder.updateTelegramSensorCooldownDraft(value);
      setTelegramSensorCooldownDraft(value);
    },
    hideChannel: noop,
    showChannel: noop,
    showAllChannels: noop,
    syncTelegramChats: recorder.syncTelegramChats,
    applyTelegramSettings: recorder.applyTelegramSettings,
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
    expect(screen.getByLabelText('카메라 화면 개수')).toHaveValue('4');
    expect(screen.getByLabelText('BBOX 표시 여부')).toHaveValue('true');
    expect(screen.getByLabelText('박스 표시 조건')).toHaveValue('always');
    expect(screen.getByLabelText('위험 팝업 감지 방식')).toHaveValue('recent_three_frames_two_risks');
    expect(screen.getByRole('checkbox', { name: 'Tag 3 데인저 전용 팝업' })).not.toBeChecked();
    expect(screen.getByLabelText('위험 팝업 시간(초)')).toHaveValue(2);
    expect(screen.getByLabelText('현장 상태 팝업 시간(초)')).toHaveValue(3.2);
    expect(screen.getByLabelText('Telegram Bot Token')).toHaveValue('');
    expect(screen.getByLabelText('센서 알림 쿨다운(초)')).toHaveValue(5);
    expect(screen.getByRole('checkbox', { name: '채팅방 자동 동기화' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '기현 홍 (private)' })).toBeChecked();
    const telegramSummary = screen.getByText('Telegram 알림').closest('summary');
    const telegramDetails = telegramSummary?.parentElement as HTMLDetailsElement | null;

    expect(telegramSummary).toBeTruthy();
    expect(telegramDetails?.open).toBe(true);

    fireEvent.click(telegramSummary as Element);

    expect(telegramDetails?.open).toBe(false);

    fireEvent.click(telegramSummary as Element);

    expect(telegramDetails?.open).toBe(true);
    expect(screen.getByLabelText('Telegram Bot Token')).toBeInTheDocument();

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
    fireEvent.change(screen.getByLabelText('카메라 화면 개수'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('박스 표시 조건'), {
      target: { value: 'risk' },
    });
    fireEvent.change(screen.getByLabelText('위험 팝업 감지 방식'), {
      target: { value: 'consecutive_two_risks' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tag 3 데인저 전용 팝업' }));
    fireEvent.change(screen.getByLabelText('위험 팝업 시간(초)'), {
      target: { value: '4.5' },
    });
    fireEvent.change(screen.getByLabelText('현장 상태 팝업 시간(초)'), {
      target: { value: '6.2' },
    });
    fireEvent.change(screen.getByLabelText('Telegram Bot Token'), {
      target: { value: 'new-token' },
    });
    fireEvent.change(screen.getByLabelText('센서 알림 쿨다운(초)'), {
      target: { value: '' },
    });
    expect(screen.getByLabelText('센서 알림 쿨다운(초)')).toHaveValue(null);
    fireEvent.change(screen.getByLabelText('센서 알림 쿨다운(초)'), {
      target: { value: '45' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: '채팅방 자동 동기화' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '기현 홍 (private)' }));

    expect(recorder.updateWsDraft).toHaveBeenLastCalledWith('ws://localhost:9999/frames');
    expect(recorder.updateSensorBridgeDraft).toHaveBeenLastCalledWith('ws://localhost:8787');
    expect(recorder.updateRtspControlDraft).toHaveBeenLastCalledWith('http://192.168.1.7:10000');
    expect(recorder.updateRtspUrlDraft).toHaveBeenLastCalledWith('rtsp://10.0.0.5/live.sdp');
    expect(recorder.updateTelegramBotTokenDraft).toHaveBeenLastCalledWith('new-token');
    expect(recorder.updateTelegramSensorCooldownDraft).toHaveBeenLastCalledWith('45');
    expect(recorder.updateTelegramAutoSync).toHaveBeenLastCalledWith(false);
    expect(recorder.updateTelegramChatSelection).toHaveBeenLastCalledWith('8477727287', false);
    expect(screen.getByLabelText('CCTV WebSocket URL')).toHaveValue('ws://localhost:9999/frames');
    expect(screen.getByLabelText('Sensor Bridge WebSocket URL')).toHaveValue('ws://localhost:8787');
    expect(screen.getByLabelText('RTSP Control API URL')).toHaveValue('http://192.168.1.7:10000');
    expect(screen.getByLabelText('RTSP URL')).toHaveValue('rtsp://10.0.0.5/live.sdp');
    expect(screen.getByLabelText('카메라 화면 개수')).toHaveValue('2');
    expect(screen.getByLabelText('박스 표시 조건')).toHaveValue('risk');
    expect(screen.getByLabelText('위험 팝업 감지 방식')).toHaveValue('consecutive_two_risks');
    expect(screen.getByRole('checkbox', { name: 'Tag 3 데인저 전용 팝업' })).toBeChecked();
    expect(screen.getByLabelText('위험 팝업 시간(초)')).toHaveValue(4.5);
    expect(screen.getByLabelText('현장 상태 팝업 시간(초)')).toHaveValue(6.2);
    expect(recorder.setPopupDurationMs).not.toHaveBeenCalled();
    expect(recorder.setSensorPopupDurationMs).not.toHaveBeenCalled();
    expect(recorder.applyWsUrl).not.toHaveBeenCalled();
    expect(recorder.applySensorBridgeUrl).not.toHaveBeenCalled();
    expect(recorder.applyRtspControlUrl).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '기본 연결 적용' }));

    expect(recorder.applyWsUrl).toHaveBeenCalledOnce();
    expect(recorder.applySensorBridgeUrl).toHaveBeenCalledOnce();
    expect(recorder.applyRtspControlUrl).toHaveBeenCalledOnce();
    expect(recorder.applyRtspUrl).toHaveBeenCalledOnce();
    expect(recorder.setPopupDurationMs).not.toHaveBeenCalled();
    expect(recorder.setSensorPopupDurationMs).not.toHaveBeenCalled();
    expect(recorder.applyTelegramSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '표시/팝업 적용' }));

    expect(recorder.updateCameraDisplayCount).toHaveBeenCalledWith(2);
    expect(recorder.updateOverlayDisplayMode).toHaveBeenCalledWith('risk');
    expect(recorder.updateHazardPopupDebounceMode).toHaveBeenCalledWith('consecutive_two_risks');
    expect(recorder.updateTag3DangerPopupOnly).toHaveBeenCalledWith(true);
    expect(recorder.setPopupDurationMs).toHaveBeenCalledWith(4500);
    expect(recorder.setSensorPopupDurationMs).toHaveBeenCalledWith(6200);
    expect(recorder.startRtspStream).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '채팅방 찾기' }));
    fireEvent.click(screen.getByRole('button', { name: 'Telegram 적용' }));

    expect(recorder.syncTelegramChats).toHaveBeenCalledOnce();
    expect(recorder.applyTelegramSettings).toHaveBeenCalledOnce();

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
    fireEvent.change(screen.getByLabelText('위험 팝업 감지 방식'), {
      target: { value: 'consecutive_two_risks' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tag 3 데인저 전용 팝업' }));
    fireEvent.change(screen.getByLabelText('위험 팝업 시간(초)'), {
      target: { value: '4.5' },
    });
    fireEvent.change(screen.getByLabelText('현장 상태 팝업 시간(초)'), {
      target: { value: '6.2' },
    });

    fireEvent.click(screen.getByRole('button', { name: '기본 연결 적용' }));
    fireEvent.click(screen.getByRole('button', { name: '표시/팝업 적용' }));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(window.localStorage.getItem('excavator-safe-system:hazard-popup-duration-ms')).toBe('4500');
    expect(window.localStorage.getItem('excavator-safe-system:field-state-popup-duration-ms')).toBe('6200');
    expect(window.localStorage.getItem('excavator-safe-system:hazard-popup-debounce-mode')).toBe('consecutive_two_risks');
    expect(window.localStorage.getItem('excavator-safe-system:tag-3-danger-popup-only')).toBe('true');
    expect(window.localStorage.getItem('excavator-safe-system:rtsp-control-api-url')).toBe('http://192.168.1.7:10000');
  });

  it('uses the field defaults when no saved runtime settings exist', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(screen.getByLabelText('CCTV WebSocket URL')).toHaveValue('ws://10.161.110.223:8876');
    expect(screen.getByLabelText('Sensor Bridge WebSocket URL')).toHaveValue('ws://10.161.110.223:8787');
    expect(screen.getByLabelText('RTSP Control API URL')).toHaveValue('http://10.161.110.223:8787');
    expect(screen.getByLabelText('RTSP URL')).toHaveValue('rtsp://admin:total!23@192.168.1.100:554');
    expect(screen.getByLabelText('카메라 화면 개수')).toHaveValue('4');
    expect(screen.getByLabelText('BBOX 표시 여부')).toHaveValue('true');
    expect(screen.getByLabelText('박스 표시 조건')).toHaveValue('alert');
    expect(screen.getByLabelText('위험 팝업 감지 방식')).toHaveValue('recent_three_frames_two_risks');
    expect(screen.getByRole('checkbox', { name: 'Tag 3 데인저 전용 팝업' })).not.toBeChecked();
    expect(screen.getByLabelText('위험 팝업 시간(초)')).toHaveValue(2);
    expect(screen.getByText(/TOKEN 8385/i)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /기현/ })).not.toBeInTheDocument();
  });

});
