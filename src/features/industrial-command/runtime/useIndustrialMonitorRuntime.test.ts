import { describe, expect, it } from 'vitest';
import {
  createSensorPopupRuntime,
  deriveHazardControlState,
  evaluateHazardQualification,
  getBridgeApiUrl,
  getBridgeHttpBase,
  getLightControlWsUrl,
  type HazardRiskSample,
  type HazardPopupDebounceMode,
  getRtspApiBase,
  getRtspPlaybackSrc,
  normalizeRtspPlaybackUrl,
  selectHazardPopupChannelId,
} from './useIndustrialMonitorRuntime';
import type { FrontendStateSnapshot } from '../../../../frontend-state/frontendStateTypes';
import type { ChannelRuntimeState } from '../../../../cctv-poc/types';

function sample(atMs: number, isRisk: boolean): HazardRiskSample {
  return {
    atMs,
    isRisk,
    severity: isRisk ? 'risk' : 'normal',
  };
}

function createSnapshot(
  workers: FrontendStateSnapshot['workers']
): FrontendStateSnapshot {
  return {
    type: 'frontend_state',
    timestamp: '2026-03-27T09:00:00+09:00',
    system: {
      sensorServerOnline: true,
      zoneRule: {
        cautionDistanceM: 5,
        dangerDistanceM: 3,
      },
    },
    workers,
  };
}

function createChannelRuntime(overrides: Partial<ChannelRuntimeState> = {}): ChannelRuntimeState {
  return {
    connectionStatus: 'connected',
    reconnectAttempt: 0,
    errorMessage: null,
    currentImage: 'data:image/gif;base64,abc',
    latestFrame: {
      sourceId: 'cam1',
      frameIndex: 11,
      reportWallTsMs: null,
      wsSentTsMs: null,
      objects: [
        { trackId: 7, label: 'person', bbox: [10, 20, 110, 220] },
        { trackId: 8, label: 'machinery', bbox: [200, 120, 360, 420] },
      ],
      combinedKo: '위험 이벤트',
      topEventKo: '작업자 접근',
      eventsKo: ['작업자 접근'],
      imageSize: [640, 480],
      overlayTrackIds: [7],
      relationTrackIds: [7],
      alertTier: 'risk',
      highlight: null,
      zoneName: '굴착기 구역 A',
      detectedTargetLabel: 'person',
      estimatedDistanceText: '1.2m',
    },
    visualFrame: {
      sourceId: 'cam1',
      frameIndex: 11,
      reportWallTsMs: null,
      wsSentTsMs: null,
      objects: [
        { trackId: 7, label: 'person', bbox: [10, 20, 110, 220] },
        { trackId: 8, label: 'machinery', bbox: [200, 120, 360, 420] },
      ],
      combinedKo: '위험 이벤트',
      topEventKo: '작업자 접근',
      eventsKo: ['작업자 접근'],
      imageSize: [640, 480],
      overlayTrackIds: [7],
      relationTrackIds: [7],
      alertTier: 'risk',
      highlight: null,
      zoneName: '굴착기 구역 A',
      detectedTargetLabel: 'person',
      estimatedDistanceText: '1.2m',
    },
    imageNaturalSize: [640, 480],
    alertTier: 'risk',
    alertEligible: true,
    incomingFps: 8,
    lastMessageAt: null,
    topEventFlash: true,
    ...overrides,
  };
}

describe('getBridgeHttpBase', () => {
  it('derives the http base from a ws sensor bridge url', () => {
    expect(getBridgeHttpBase('ws://192.168.0.20:8787', '')).toBe('http://192.168.0.20:8787');
  });

  it('derives the https base from a wss sensor bridge url', () => {
    expect(getBridgeHttpBase('wss://sensor.example.com:9443', '')).toBe('https://sensor.example.com:9443');
  });

  it('uses the current page protocol when no bridge url has been saved', () => {
    expect(
      getBridgeHttpBase('', '', {
        hostname: 'frontend.example.com',
        origin: 'https://frontend.example.com',
        port: '',
        protocol: 'https:',
      })
    ).toBe('https://frontend.example.com:8787');
  });
});

describe('getBridgeApiUrl', () => {
  it('uses a same-origin proxy for cross-origin bridge requests during local development', () => {
    expect(
      getBridgeApiUrl('/logs', 'ws://192.168.1.151:10000', '', {
        hostname: '192.168.1.206',
        origin: 'http://192.168.1.206:5173',
        port: '5173',
        protocol: 'http:',
      })
    ).toBe('/__bridge_proxy__?path=%2Flogs&target=http%3A%2F%2F192.168.1.151%3A10000');
  });

  it('calls the bridge directly when the current page already shares the bridge origin', () => {
    expect(
      getBridgeApiUrl('/logs', 'ws://192.168.1.151:10000', '', {
        hostname: '192.168.1.151',
        origin: 'http://192.168.1.151:10000',
        port: '10000',
        protocol: 'http:',
      })
    ).toBe('http://192.168.1.151:10000/logs');
  });
});

describe('getLightControlWsUrl', () => {
  it('derives a websocket endpoint from the rtsp control api base', () => {
    expect(getLightControlWsUrl('http://192.168.1.206:8787')).toBe('ws://192.168.1.206:8787/ws/light-control');
  });

  it('preserves secure protocol when the bridge api is https', () => {
    expect(getLightControlWsUrl('https://bridge.example.com')).toBe('wss://bridge.example.com/ws/light-control');
  });
});

describe('normalizeRtspPlaybackUrl', () => {
  it('rewrites localhost playback urls to the configured rtsp control host', () => {
    expect(
      normalizeRtspPlaybackUrl(
        'http://localhost:8787/rtsp/frame.jpg?session=1',
        'http://192.168.1.206:8787'
      )
    ).toBe('http://192.168.1.206:8787/rtsp/frame.jpg?session=1');
  });

  it('keeps playback urls that already use a remote host', () => {
    expect(
      normalizeRtspPlaybackUrl(
        'http://192.168.1.206:8787/rtsp/frame.jpg?session=1',
        'http://192.168.1.206:8787'
      )
    ).toBe('http://192.168.1.206:8787/rtsp/frame.jpg?session=1');
  });
});

describe('getRtspPlaybackSrc', () => {
  it('returns a direct rtsp frame image url for remote access', () => {
    expect(
      getRtspPlaybackSrc(
        'http://192.168.1.206:8787/rtsp/frame.jpg?session=1',
        'http://192.168.1.206:8787',
        {
          hostname: '192.168.1.206',
          origin: 'http://192.168.1.206:5173',
          port: '5173',
          protocol: 'http:',
        }
      )
    ).toBe('http://192.168.1.206:8787/rtsp/frame.jpg?session=1');
  });

  it('keeps same-origin rtsp playback urls untouched', () => {
    expect(
      getRtspPlaybackSrc(
        'http://192.168.1.206:8787/rtsp/frame.jpg?session=1',
        'http://192.168.1.206:8787',
        {
          hostname: '192.168.1.206',
          origin: 'http://192.168.1.206:8787',
          port: '8787',
          protocol: 'http:',
        }
      )
    ).toBe('http://192.168.1.206:8787/rtsp/frame.jpg?session=1');
  });
});

describe('getRtspApiBase', () => {
  it('rewrites a loopback rtsp control url to the current page host for remote access', () => {
    expect(
      getRtspApiBase('http://127.0.0.1:8787', '', '', '', {
        hostname: '192.168.1.206',
        origin: 'http://192.168.1.206:5173',
        port: '5173',
        protocol: 'http:',
      })
    ).toBe('http://192.168.1.206:8787');
  });

  it('keeps a loopback rtsp control url when the page itself is on loopback', () => {
    expect(
      getRtspApiBase('http://127.0.0.1:8787', '', '', '', {
        hostname: '127.0.0.1',
        origin: 'http://127.0.0.1:5173',
        port: '5173',
        protocol: 'http:',
      })
    ).toBe('http://127.0.0.1:8787');
  });

  it('converts websocket rtsp control urls to http before using them', () => {
    expect(
      getRtspApiBase('ws://192.168.1.206:8787', '', '', '', {
        hostname: '192.168.1.206',
        origin: 'http://192.168.1.206:5173',
        port: '5173',
        protocol: 'http:',
      })
    ).toBe('http://192.168.1.206:8787');
  });
});

describe('evaluateHazardQualification', () => {
  it('opens under the default recent-3-frame mode when 2 of the last 3 samples are risk', () => {
    const mode: HazardPopupDebounceMode = 'recent_three_frames_two_risks';

    expect(
      evaluateHazardQualification(
        [
          sample(0, false),
          sample(400, true),
          sample(800, false),
          sample(1100, true),
        ],
        mode,
        1500
      )
    ).toBe(true);
  });

  it('does not open under consecutive mode when the risk samples are split by a normal frame', () => {
    const mode: HazardPopupDebounceMode = 'consecutive_two_risks';

    expect(
      evaluateHazardQualification(
        [
          sample(0, false),
          sample(400, true),
          sample(800, false),
          sample(1100, true),
        ],
        mode,
        1500
      )
    ).toBe(false);
  });

  it('opens under consecutive mode only when two recent risk samples are back-to-back', () => {
    const mode: HazardPopupDebounceMode = 'consecutive_two_risks';

    expect(
      evaluateHazardQualification(
        [
          sample(0, false),
          sample(500, true),
          sample(900, true),
        ],
        mode,
        1500
      )
    ).toBe(true);
  });
});

describe('selectHazardPopupChannelId', () => {
  it('prefers the most recent risk camera when available', () => {
    expect(selectHazardPopupChannelId(2, 1)).toBe(2);
  });

  it('falls back to the most recent frame camera when there is no recent risk camera', () => {
    expect(selectHazardPopupChannelId(null, 1)).toBe(1);
  });
});

describe('deriveHazardControlState', () => {
  it('blocks all popups and turns the light off when the nearest sensor worker is approved', () => {
    const result = deriveHazardControlState({
      sensorSnapshot: createSnapshot([
        {
          tagId: 1,
          name: 'approved-nearest',
          approved: true,
          connected: true,
          x: 0,
          y: 0,
          distanceM: 1.1,
          zoneStatus: 'danger',
          isWarning: true,
          isEmergency: true,
          lastUpdate: '2026-03-27T09:00:00+09:00',
        },
        {
          tagId: 2,
          name: 'far-unapproved',
          approved: false,
          connected: true,
          x: 0,
          y: 0,
          distanceM: 2.4,
          zoneStatus: 'danger',
          isWarning: true,
          isEmergency: false,
          lastUpdate: '2026-03-27T09:00:00+09:00',
        },
      ]),
      aiHazardDetected: true,
      latestRiskChannelId: 2,
      latestFrameChannelId: 1,
    });

    expect(result.sensorGateState).toBe('approved_nearest');
    expect(result.effectiveHazardState).toBe('safe');
    expect(result.popupBlocked).toBe(true);
    expect(result.lightCommand).toBe('off');
  });

  it('opens popups and turns the light on when the nearest sensor worker is risky and unapproved', () => {
    const result = deriveHazardControlState({
      sensorSnapshot: createSnapshot([
        {
          tagId: 9,
          name: 'unapproved-nearest',
          approved: false,
          connected: true,
          x: 0,
          y: 0,
          distanceM: 1.2,
          zoneStatus: 'danger',
          isWarning: true,
          isEmergency: false,
          lastUpdate: '2026-03-27T09:00:00+09:00',
        },
      ]),
      aiHazardDetected: false,
      latestRiskChannelId: 2,
      latestFrameChannelId: 1,
    });

    expect(result.sensorGateState).toBe('unapproved_nearest');
    expect(result.effectiveHazardState).toBe('hazardous');
    expect(result.popupBlocked).toBe(false);
    expect(result.lightCommand).toBe('on');
    expect(result.selectedPopupChannelId).toBe(2);
    expect(result.popupReason).toBe('nearest_unapproved_sensor');
  });

  it('allows ai popups only when no sensor worker is present', () => {
    const result = deriveHazardControlState({
      sensorSnapshot: createSnapshot([]),
      aiHazardDetected: true,
      latestRiskChannelId: null,
      latestFrameChannelId: 1,
    });

    expect(result.sensorGateState).toBe('no_sensor');
    expect(result.effectiveHazardState).toBe('hazardous');
    expect(result.popupBlocked).toBe(false);
    expect(result.lightCommand).toBe('on');
    expect(result.selectedPopupChannelId).toBe(1);
    expect(result.popupReason).toBe('ai_only');
  });
});

describe('createSensorPopupRuntime', () => {
  it('renders all bounding boxes without relation-only emphasis for sensor-triggered popups', () => {
    const runtime = createSensorPopupRuntime(createChannelRuntime());

    expect(runtime.visualFrame.overlayTrackIds).toEqual([7, 8]);
    expect(runtime.visualFrame.relationTrackIds).toEqual([]);
  });
});
