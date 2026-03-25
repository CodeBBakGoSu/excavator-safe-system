import type { FrontendStateSnapshot, FrontendStateWorker, ZoneStatus } from './frontendStateTypes';

const PLOT_RANGE_M = 25;
const PLOT_SIZE_M = PLOT_RANGE_M * 2;

function asRecord(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value.trim();
}

function requireBoolean(value: unknown, label: string) {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean`);
  }

  return value;
}

function requireNumber(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }

  return value;
}

function requireZoneStatus(value: unknown): ZoneStatus {
  if (value === 'safe' || value === 'caution' || value === 'danger') {
    return value;
  }

  throw new Error('zone_status must be one of safe, caution, danger');
}

function parseWorker(value: unknown): FrontendStateWorker {
  const worker = asRecord(value, 'worker');

  return {
    tagId: requireNumber(worker.tag_id, 'tag_id'),
    name: requireString(worker.name, 'name'),
    approved: requireBoolean(worker.approved, 'approved'),
    connected: requireBoolean(worker.connected, 'connected'),
    x: requireNumber(worker.x, 'x'),
    y: requireNumber(worker.y, 'y'),
    distanceM: requireNumber(worker.distance_m, 'distance_m'),
    zoneStatus: requireZoneStatus(worker.zone_status),
    isWarning: requireBoolean(worker.is_warning, 'is_warning'),
    isEmergency: requireBoolean(worker.is_emergency, 'is_emergency'),
    lastUpdate: requireString(worker.last_update, 'last_update'),
  };
}

export function parseFrontendStatePayload(payload: Record<string, unknown>) {
  const root = asRecord(payload, 'payload');
  const type = requireString(root.type, 'type');
  if (type !== 'frontend_state') {
    throw new Error('type must be frontend_state');
  }

  const system = asRecord(root.system, 'system');
  const zoneRule = asRecord(system.zone_rule, 'zone_rule');
  if (!Array.isArray(root.workers)) {
    throw new Error('workers must be an array');
  }

  return {
    type: 'frontend_state',
    timestamp: requireString(root.timestamp, 'timestamp'),
    system: {
      sensorServerOnline: requireBoolean(system.sensor_server_online, 'sensor_server_online'),
      zoneRule: {
        cautionDistanceM: requireNumber(zoneRule.caution_distance_m, 'caution_distance_m'),
        dangerDistanceM: requireNumber(zoneRule.danger_distance_m, 'danger_distance_m'),
      },
    },
    workers: root.workers.map((worker) => parseWorker(worker)),
  } satisfies FrontendStateSnapshot;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toPercent(value: number) {
  return `${Number(value.toFixed(1))}%`;
}

export function projectWorkerPoint({ x, y }: { x: number; y: number }) {
  const clampedX = clamp(x, -PLOT_RANGE_M, PLOT_RANGE_M);
  const clampedY = clamp(y, -PLOT_RANGE_M, PLOT_RANGE_M);
  const left = ((clampedX + PLOT_RANGE_M) / PLOT_SIZE_M) * 100;
  const top = 100 - ((clampedY + PLOT_RANGE_M) / PLOT_SIZE_M) * 100;

  return {
    left: toPercent(left),
    top: toPercent(top),
  };
}

export function projectZoneRadius(distanceM: number) {
  return `${Number((((distanceM * 2) / PLOT_SIZE_M) * 100).toFixed(1))}%`;
}

export function validateFrontendStateSocketUrl(value: string) {
  const normalized = value.trim();
  if (!normalized) return '브리지 주소를 입력해주세요.';
  if (!/^wss?:\/\//i.test(normalized)) return '브리지 주소는 ws:// 또는 wss:// 형식이어야 합니다.';

  try {
    new URL(normalized);
    return null;
  } catch {
    return '브리지 주소 형식이 올바르지 않습니다.';
  }
}

export function sortWorkersForDisplay(workers: FrontendStateWorker[]) {
  const priority = { danger: 0, caution: 1, safe: 2 };

  return [...workers].sort((left, right) => {
    const zoneDelta = priority[left.zoneStatus] - priority[right.zoneStatus];
    if (zoneDelta !== 0) return zoneDelta;
    if (left.connected !== right.connected) return left.connected ? 1 : -1;
    return left.distanceM - right.distanceM;
  });
}
