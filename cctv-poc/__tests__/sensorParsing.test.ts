import { describe, expect, it } from 'vitest';
import { computeSensorPlotBounds, parseSensorPayload, validateSocketUrl } from '../sensorParsing';

describe('parseSensorPayload', () => {
  it('normalizes excavator and external sensors from loose UDP payloads', () => {
    const result = parseSensorPayload({
      event_id: 'evt-17',
      event_type: 'sensor_proximity',
      level: 'RISK',
      message_ko: '근접 위험 감지',
      excavator_position: { x: 12, y: -4 },
      excavator_sensors: [
        { sensor_id: 'boom-left', x: 10, y: -2 },
        { sensor_id: 'boom-right', x: 14, y: -2 },
      ],
      sensors: [
        { id: 'worker-tag-1', x: 24, y: 11 },
        { id: 'worker-tag-2', x: -11, y: 9 },
      ],
      triggered_sensor_ids: ['worker-tag-1'],
      ts_ms: 1773300130685,
      excavator_name: '굴착기 A',
    });

    expect(result.eventId).toBe('evt-17');
    expect(result.level).toBe('risk');
    expect(result.anchor).toEqual({ x: 12, y: -4 });
    expect(result.excavatorSensors).toHaveLength(2);
    expect(result.externalSensors).toHaveLength(2);
    expect(result.excavatorSensors[0]).toMatchObject({ id: 'boom-left', role: 'excavator' });
    expect(result.externalSensors[0]).toMatchObject({ id: 'worker-tag-1', role: 'external' });
    expect(result.triggeredSensorIds).toEqual(['worker-tag-1']);
    expect(result.sourceLabel).toBe('굴착기 A');
  });

  it('falls back gracefully when optional fields are missing', () => {
    const result = parseSensorPayload({
      sequence: 77,
      type: 'sensor_notice',
      severity: 'warn',
      sensors: [{ sensor_id: 'tag-3', rel_x: 4, rel_y: 8 }],
    });

    expect(result.eventId).toBe('77');
    expect(result.level).toBe('caution');
    expect(result.message).toBe('센서 이벤트 수신');
    expect(result.anchor).toBeNull();
    expect(result.excavatorSensors).toEqual([]);
    expect(result.externalSensors[0]).toMatchObject({ id: 'tag-3', x: 4, y: 8 });
  });
});

describe('computeSensorPlotBounds', () => {
  it('creates balanced plot bounds around all sensor points', () => {
    const bounds = computeSensorPlotBounds({
      eventId: 'evt',
      eventType: 'sensor_proximity',
      level: 'risk',
      message: 'test',
      anchor: { x: 0, y: 0 },
      excavatorSensors: [{ id: 'exc-1', x: -5, y: -4, role: 'excavator', label: 'exc-1' }],
      externalSensors: [{ id: 'ext-1', x: 17, y: 9, role: 'external', label: 'ext-1' }],
      triggeredSensorIds: ['ext-1'],
      receivedAt: 1,
      sourceLabel: '굴착기',
    });

    expect(bounds.minX).toBeLessThanOrEqual(-13);
    expect(bounds.maxX).toBeGreaterThanOrEqual(25);
    expect(bounds.minY).toBeLessThanOrEqual(-12);
    expect(bounds.maxY).toBeGreaterThanOrEqual(17);
  });
});

describe('validateSocketUrl', () => {
  it('accepts ws and wss urls', () => {
    expect(validateSocketUrl('ws://localhost:8787')).toBeNull();
    expect(validateSocketUrl('wss://sensor.example.com/ws')).toBeNull();
  });

  it('rejects non websocket urls', () => {
    expect(validateSocketUrl('udp://127.0.0.1:9000')).toContain('ws://');
  });
});
