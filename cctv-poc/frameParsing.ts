import type { AlertTier, BBox, DetectedObject, FrameSnapshot, HazardTone, HighlightedHazard } from './types';

const BASE_COORDINATE_SIZE: [number, number] = [1920, 1080];

function toNonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toImageSize(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const width = toFiniteNumber(value[0]);
  const height = toFiniteNumber(value[1]);
  if (!width || !height) return null;
  return [width, height];
}

function toBBox(value: unknown): BBox | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const bbox = value.map((item) => toFiniteNumber(item));
  if (bbox.some((item) => item == null)) return null;
  return bbox as BBox;
}

function normalizeEvents(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => toNonEmptyString(item)).filter(Boolean);
  }
  const single = toNonEmptyString(raw);
  return single ? [single] : [];
}

function extractZoneName(payload: Record<string, unknown>) {
  const candidates = [
    payload.zone_name,
    payload.zoneName,
    payload.area_name,
    payload.areaName,
    payload.camera_zone_name,
    payload.cameraZoneName,
    payload.location_name,
    payload.locationName,
  ];

  for (const candidate of candidates) {
    const value = toNonEmptyString(candidate);
    if (value) return value;
  }

  return null;
}

function translateObjectLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'person') return '사람 (Person)';
  if (normalized === 'machinery' || normalized === 'excavator') return '장비 (Machinery)';
  if (normalized === 'worker') return '작업자 (Worker)';
  return `${label} (${label})`;
}

function extractTargetLabel(payload: Record<string, unknown>, objects: DetectedObject[], highlight: HighlightedHazard | null) {
  const directLabel =
    toNonEmptyString(payload.target_label ?? payload.targetLabel ?? payload.detected_target ?? payload.detectedTarget);
  if (directLabel) return translateObjectLabel(directLabel) ?? directLabel;

  if (highlight?.personTrackId != null) {
    return '사람 (Person)';
  }

  const firstObjectLabel = objects[0]?.label ?? '';
  if (firstObjectLabel) {
    return translateObjectLabel(firstObjectLabel) ?? firstObjectLabel;
  }

  return null;
}

function extractEstimatedDistanceText(payload: Record<string, unknown>) {
  const directText = toNonEmptyString(
    payload.distance_text ?? payload.distanceText ?? payload.estimated_distance_text ?? payload.estimatedDistanceText
  );
  if (directText) return directText;

  const distanceMeters = [
    payload.distance_m,
    payload.distanceMeters,
    payload.distance_meter,
    payload.estimated_distance_m,
    payload.estimatedDistanceM,
    payload.nearest_distance_m,
    payload.nearestDistanceM,
  ]
    .map((item) => toFiniteNumber(item))
    .find((item) => item != null);

  if (distanceMeters != null) {
    return `약 ${distanceMeters.toFixed(1)}m`;
  }

  return null;
}

function normalizeImageSource(imageBase64: string): string {
  if (!imageBase64) return '';
  return imageBase64.startsWith('data:image/') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
}

function extractImageRaw(payload: Record<string, unknown>) {
  const directKeys = [
    payload.image_jpeg_base64,
    payload.image_base64,
    payload.image,
    payload.frame_base64,
    payload.frame_jpeg_base64,
    payload.jpeg_base64,
    payload.snapshot_base64,
  ];

  for (const candidate of directKeys) {
    const text = toNonEmptyString(candidate);
    if (text) return text;
  }

  return '';
}

function extractSourceId(payload: Record<string, unknown>) {
  return (
    toNonEmptyString(payload.sourceID ?? payload.sourceId ?? payload.source_id) ||
    toNonEmptyString(payload.cameraKey ?? payload.camera_key) ||
    '-'
  );
}

function normalizeAlertTier(value: unknown, message = ''): AlertTier {
  const normalized = toNonEmptyString(value).toUpperCase();
  if (normalized === 'RISK' || message.startsWith('경고:')) return 'risk';
  if (normalized === 'CAUTION' || normalized === 'WARN' || message.startsWith('주의:')) return 'caution';
  return 'normal';
}

function compareAlertTier(a: AlertTier, b: AlertTier) {
  const rank: Record<AlertTier, number> = { normal: 0, caution: 1, risk: 2 };
  return rank[a] - rank[b];
}

function parseObjects(raw: unknown): DetectedObject[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const typedItem = item as Record<string, unknown>;
      const bbox = toBBox(typedItem.bbox_xyxy);
      if (!bbox) return null;
      return {
        trackId: toFiniteNumber(typedItem.track_id),
        label: toNonEmptyString(typedItem.label) || 'object',
        bbox,
      };
    })
    .filter((item): item is DetectedObject => item !== null);
}

function extractOverlayTrackIds(payload: Record<string, unknown>) {
  const ids = new Set<number>();
  const groups = Array.isArray(payload.event_object_groups) ? payload.event_object_groups : [];

  for (const group of groups) {
    if (!group || typeof group !== 'object') continue;
    const typedGroup = group as Record<string, unknown>;
    const trackIds = Array.isArray(typedGroup.track_ids) ? typedGroup.track_ids : [];
    for (const trackId of trackIds) {
      const parsed = toFiniteNumber(trackId);
      if (parsed != null) ids.add(parsed);
    }
  }

  const relations = Array.isArray(payload.relations) ? payload.relations : [];
  for (const relation of relations) {
    if (!relation || typeof relation !== 'object') continue;
    const typedRelation = relation as Record<string, unknown>;
    const aId = toFiniteNumber(typedRelation.a_id);
    const bId = toFiniteNumber(typedRelation.b_id);
    if (aId != null) ids.add(aId);
    if (bId != null) ids.add(bId);
  }

  return Array.from(ids);
}

function getHazardToneFromScore(score: number | null, tier: AlertTier): HazardTone {
  if (score == null) return tier === 'risk' ? 'red' : tier === 'caution' ? 'orange' : 'yellow';
  if (score <= 0.8) return 'red';
  if (score <= 1.25) return 'orange';
  return tier === 'risk' ? 'orange' : 'yellow';
}

function extractPrimaryHazard(payload: Record<string, unknown>) {
  const groups = Array.isArray(payload.event_object_groups) ? payload.event_object_groups : [];
  let highestTier: AlertTier = 'normal';
  let bestHighlight: HighlightedHazard | null = null;
  let bestScore: number | null = null;

  for (const group of groups) {
    if (!group || typeof group !== 'object') continue;
    const typedGroup = group as Record<string, unknown>;
    const event = typedGroup.event as Record<string, unknown> | undefined;
    const message = toNonEmptyString(event?.message_ko);
    const tier = normalizeAlertTier(event?.level, message);
    if (compareAlertTier(tier, highestTier) > 0) highestTier = tier;

    const relations = Array.isArray(typedGroup.relations) ? typedGroup.relations : [];
    for (const relation of relations) {
      if (!relation || typeof relation !== 'object') continue;
      const typedRelation = relation as Record<string, unknown>;
      if (toNonEmptyString(typedRelation.a_label).toLowerCase() !== 'person') continue;
      if (toNonEmptyString(typedRelation.b_label).toLowerCase() !== 'machinery') continue;
      const score = toFiniteNumber(typedRelation.d_over_person_height) ?? toFiniteNumber(typedRelation.d_min_norm);
      if (bestHighlight && score != null && bestScore != null && score >= bestScore) continue;
      bestScore = score;
      bestHighlight = {
        personTrackId: toFiniteNumber(typedRelation.a_id),
        machineryTrackId: toFiniteNumber(typedRelation.b_id),
        label: tier === 'risk' ? 'DANGER' : 'CAUTION',
        tone: getHazardToneFromScore(score, tier),
      };
    }
  }

  return { tier: highestTier, highlight: bestHighlight };
}

function normalizeSocketText(raw: string) {
  return raw.replace(/^\uFEFF/, '').trim();
}

function replaceNonStandardJsonLiterals(raw: string) {
  return raw.replace(/\bNaN\b/g, 'null').replace(/\bInfinity\b/g, 'null').replace(/\b-Infinity\b/g, 'null');
}

function tryParseObjectPayload(candidate: string): Record<string, unknown>[] {
  const normalized = normalizeSocketText(candidate);
  if (!normalized) return [];

  for (const target of [normalized, replaceNonStandardJsonLiterals(normalized)]) {
    try {
      const parsed: unknown = JSON.parse(target);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
      }
      if (parsed && typeof parsed === 'object') {
        return [parsed as Record<string, unknown>];
      }
    } catch {
      continue;
    }
  }

  return [];
}

export function extractJsonPayloadsFromText(raw: string): Record<string, unknown>[] {
  const direct = tryParseObjectPayload(raw);
  if (direct.length > 0) return direct;

  const payloads: Record<string, unknown>[] = [];
  const text = normalizeSocketText(raw);
  let depth = 0;
  let startIndex = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === '{') {
      if (depth === 0) startIndex = index;
      depth += 1;
      continue;
    }

    if (character === '}') {
      depth -= 1;
      if (depth === 0 && startIndex >= 0) {
        payloads.push(...tryParseObjectPayload(text.slice(startIndex, index + 1)));
        startIndex = -1;
      }
    }
  }

  return payloads;
}

export function parseCameraKey(sourceId: string): string | null {
  const match = sourceId.match(/cam(\d+)/i);
  return match ? `cam${match[1]}` : null;
}

export function parseFramePayload(payload: Record<string, unknown>): { frame: FrameSnapshot; imageSrc: string | null } {
  const { tier, highlight } = extractPrimaryHazard(payload);
  const imageRaw = extractImageRaw(payload);
  const objects = parseObjects(payload.objects);

  return {
    frame: {
      sourceId: extractSourceId(payload),
      frameIndex: toFiniteNumber(payload.frame_index),
      reportWallTsMs: toFiniteNumber(payload.report_wall_ts_ms),
      wsSentTsMs: toFiniteNumber(payload.ws_sent_ts_ms),
      objects,
      combinedKo: toNonEmptyString(payload.combined_ko),
      topEventKo: toNonEmptyString(payload.top_event_ko ?? payload.topEventKo),
      eventsKo: normalizeEvents(payload.events_ko ?? payload.event_ko ?? payload.event),
      imageSize: toImageSize(payload.image_size),
      overlayTrackIds: extractOverlayTrackIds(payload),
      alertTier: tier,
      highlight,
      zoneName: extractZoneName(payload),
      detectedTargetLabel: extractTargetLabel(payload, objects, highlight),
      estimatedDistanceText: extractEstimatedDistanceText(payload),
    },
    imageSrc: imageRaw ? normalizeImageSource(imageRaw) : null,
  };
}

export function normalizeBBoxForImage(bbox: BBox, imageSize: [number, number] | null): BBox {
  if (!imageSize) return bbox;
  const [width, height] = imageSize;
  const [baseWidth, baseHeight] = BASE_COORDINATE_SIZE;
  return [
    Math.min(width, Math.max(0, (bbox[0] / baseWidth) * width)),
    Math.min(height, Math.max(0, (bbox[1] / baseHeight) * height)),
    Math.min(width, Math.max(0, (bbox[2] / baseWidth) * width)),
    Math.min(height, Math.max(0, (bbox[3] / baseHeight) * height)),
  ];
}

export function validateWsUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return '멀티카메라 WebSocket 주소를 입력해주세요.';

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
      return 'WebSocket 주소는 ws:// 또는 wss:// 형식이어야 합니다.';
    }
    return null;
  } catch {
    return '올바른 WebSocket 주소를 입력해주세요.';
  }
}
