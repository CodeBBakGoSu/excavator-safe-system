import type { SensorAlertLevel, SensorEventSnapshot, SensorPoint } from './sensorTypes';

function toText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toPoint(input: unknown, role: SensorPoint['role']): SensorPoint | null {
  const record = asRecord(input);
  if (!record) return null;

  const id = toText(record.id ?? record.sensor_id ?? record.sensorId);
  const x = toNumber(record.x ?? record.rel_x ?? record.relative_x);
  const y = toNumber(record.y ?? record.rel_y ?? record.relative_y);
  if (!id || x == null || y == null) return null;

  return {
    id,
    x,
    y,
    role,
    label: toText(record.label ?? record.name) || id,
  };
}

function normalizeLevel(value: unknown): SensorAlertLevel {
  const normalized = toText(value).toLowerCase();
  if (normalized === 'risk' || normalized === 'danger' || normalized === 'critical') return 'risk';
  if (normalized === 'warn' || normalized === 'warning' || normalized === 'caution') return 'caution';
  return 'info';
}

function collectPoints(value: unknown, role: SensorPoint['role']) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => toPoint(item, role)).filter((item): item is SensorPoint => item !== null);
}

function toAnchor(value: unknown) {
  const record = asRecord(value);
  if (!record) return null;
  const x = toNumber(record.x ?? record.rel_x);
  const y = toNumber(record.y ?? record.rel_y);
  if (x == null || y == null) return null;
  return { x, y };
}

export function parseSensorPayload(payload: Record<string, unknown>): SensorEventSnapshot {
  return {
    eventId: toText(payload.event_id ?? payload.eventId) || String(payload.sequence ?? payload.seq ?? 'sensor-event'),
    eventType: toText(payload.event_type ?? payload.type) || 'sensor_event',
    level: normalizeLevel(payload.level ?? payload.severity),
    message: toText(payload.message ?? payload.message_ko ?? payload.alert_message) || '센서 이벤트 수신',
    anchor: toAnchor(payload.excavator_position ?? payload.anchor ?? payload.origin),
    excavatorSensors: collectPoints(payload.excavator_sensors ?? payload.machine_sensors, 'excavator'),
    externalSensors: collectPoints(payload.sensors ?? payload.external_sensors ?? payload.targets, 'external'),
    triggeredSensorIds: Array.isArray(payload.triggered_sensor_ids)
      ? payload.triggered_sensor_ids.map((item) => toText(item)).filter(Boolean)
      : [],
    receivedAt: toNumber(payload.ts_ms ?? payload.timestamp ?? Date.now()) ?? Date.now(),
    sourceLabel: toText(payload.excavator_name ?? payload.source_label ?? payload.source) || '굴착기 센서',
  };
}

export function computeSensorPlotBounds(event: SensorEventSnapshot) {
  const points = [
    ...(event.anchor ? [event.anchor] : []),
    ...event.excavatorSensors,
    ...event.externalSensors,
  ];

  if (points.length === 0) {
    return { minX: -10, maxX: 10, minY: -10, maxY: 10, width: 20, height: 20 };
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const padding = 8;
  const minX = Math.min(...xs) - padding;
  const maxX = Math.max(...xs) + padding;
  const minY = Math.min(...ys) - padding;
  const maxY = Math.max(...ys) + padding;

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function validateSocketUrl(value: string) {
  const normalized = value.trim();
  if (!normalized) return '센서 브리지 주소를 입력해주세요.';
  if (!/^wss?:\/\//i.test(normalized)) return '센서 브리지 주소는 ws:// 또는 wss:// 형식이어야 합니다.';
  try {
    new URL(normalized);
    return null;
  } catch {
    return '센서 브리지 주소 형식이 올바르지 않습니다.';
  }
}
