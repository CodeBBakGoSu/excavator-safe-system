import { describe, expect, it } from 'vitest';
import { extractJsonPayloadsFromText, parseFramePayload } from '../frameParsing';

describe('parseFramePayload', () => {
  it('reads image data from additional real-world payload keys', () => {
    const { imageSrc } = parseFramePayload({
      source_id: 'cam1',
      frame_base64: 'YWJjZA==',
    });

    expect(imageSrc).toBe('data:image/jpeg;base64,YWJjZA==');
  });

  it('uses camera_key when source id is not present', () => {
    const { frame } = parseFramePayload({
      camera_key: 'cam2',
      image_base64: 'YWJjZA==',
    });

    expect(frame.sourceId).toBe('cam2');
  });

  it('extracts zone, target and distance data for the alert popup from real payload fields', () => {
    const { frame } = parseFramePayload({
      source_id: 'cam1',
      zone_name: '굴착기 작업 구역 A',
      target_label: 'person',
      distance_m: 2.48,
      objects: [
        {
          track_id: 3,
          label: 'person',
          bbox_xyxy: [10, 20, 40, 80],
        },
      ],
    });

    expect(frame.zoneName).toBe('굴착기 작업 구역 A');
    expect(frame.detectedTargetLabel).toBe('사람 (Person)');
    expect(frame.estimatedDistanceText).toBe('약 2.5m');
  });

  it('prefers event-group relations over top-level relations for red relation highlighting', () => {
    const { frame } = parseFramePayload({
      source_id: 'cam1',
      objects: [
        { track_id: 323, label: 'person', bbox_xyxy: [10, 10, 20, 20] },
        { track_id: 325, label: 'person', bbox_xyxy: [30, 30, 40, 40] },
        { track_id: 314, label: 'machinery', bbox_xyxy: [50, 50, 60, 60] },
        { track_id: 326, label: 'machinery', bbox_xyxy: [70, 70, 80, 80] },
      ],
      relations: [
        { a_id: 325, b_id: 314 },
        { a_id: 325, b_id: 326 },
      ],
      event_object_groups: [
        {
          event: { level: 'WARNING', message_ko: '주의: 접근 경고' },
          track_ids: [325, 326],
          relations: [{ a_id: 325, b_id: 326 }],
        },
      ],
    });

    expect(frame.alertTier).toBe('caution');
    expect(frame.overlayTrackIds).toEqual(expect.arrayContaining([314, 325, 326]));
    expect(frame.relationTrackIds).toEqual([325, 326]);
  });
});

describe('extractJsonPayloadsFromText', () => {
  it('extracts two frame payloads delivered in a single websocket message', () => {
    const payloads = extractJsonPayloadsFromText(
      '{"camera_key":"cam1","frame_base64":"aA=="}\n{"camera_key":"cam2","frame_base64":"Yg=="}'
    );

    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toMatchObject({ camera_key: 'cam1' });
    expect(payloads[1]).toMatchObject({ camera_key: 'cam2' });
  });
});
