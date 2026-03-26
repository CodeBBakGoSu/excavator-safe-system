import { describe, expect, it } from 'vitest';
import {
  evaluateHazardQualification,
  getBridgeApiUrl,
  getBridgeHttpBase,
  type HazardRiskSample,
  type HazardPopupDebounceMode,
  getRtspApiBase,
  getRtspPlaybackSrc,
  normalizeRtspPlaybackUrl,
} from './useIndustrialMonitorRuntime';

function sample(atMs: number, isRisk: boolean): HazardRiskSample {
  return {
    atMs,
    isRisk,
    severity: isRisk ? 'risk' : 'normal',
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
