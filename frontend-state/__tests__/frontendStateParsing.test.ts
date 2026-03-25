import { describe, expect, it } from 'vitest';
import { parseFrontendStatePayload, projectWorkerPoint } from '../frontendStateParsing';

const validPayload = {
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
      x: 1.25,
      y: -0.85,
      distance_m: 1.51,
      zone_status: 'danger',
      is_warning: true,
      is_emergency: true,
      last_update: '2026-03-22T20:30:15.080+09:00',
    },
    {
      tag_id: 2,
      name: 'worker_2',
      approved: true,
      connected: false,
      x: 4.2,
      y: 1.1,
      distance_m: 4.34,
      zone_status: 'caution',
      is_warning: true,
      is_emergency: false,
      last_update: '2026-03-22T20:30:15.080+09:00',
    },
  ],
};

describe('parseFrontendStatePayload', () => {
  it('normalizes a valid frontend_state payload', () => {
    const result = parseFrontendStatePayload(validPayload);

    expect(result.type).toBe('frontend_state');
    expect(result.system.zoneRule.cautionDistanceM).toBe(5);
    expect(result.workers[0]).toMatchObject({
      tagId: 1,
      zoneStatus: 'danger',
      isEmergency: true,
    });
  });

  it('rejects worker entries with invalid scalar types', () => {
    expect(() =>
      parseFrontendStatePayload({
        ...validPayload,
        workers: [{ ...validPayload.workers[0], approved: 'false' }],
      })
    ).toThrow(/approved/i);
  });

  it('rejects workers with unsupported zone statuses', () => {
    expect(() =>
      parseFrontendStatePayload({
        ...validPayload,
        workers: [{ ...validPayload.workers[0], zone_status: 'critical' }],
      })
    ).toThrow(/zone_status/i);
  });
});

describe('projectWorkerPoint', () => {
  it('projects worker coordinates into the fixed -25m to 25m plot range', () => {
    expect(projectWorkerPoint({ x: 0, y: 0 })).toEqual({ left: '50%', top: '50%' });
    expect(projectWorkerPoint({ x: 25, y: 25 })).toEqual({ left: '100%', top: '0%' });
    expect(projectWorkerPoint({ x: -25, y: -25 })).toEqual({ left: '0%', top: '100%' });
  });
});
