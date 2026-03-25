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
