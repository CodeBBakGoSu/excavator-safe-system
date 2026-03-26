import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MonitorTile } from '../components/MonitorTile';

describe('MonitorTile', () => {
  it('renders all boxes in always mode even when only some tracks are highlighted', () => {
    render(
      <MonitorTile
        bboxVisible
        channel={{ id: 1, cameraKey: 'cam1', channel: 'CH-01', title: '굴착기 구역 A', sourceType: 'cctv' }}
        isFocused={false}
        onHide={() => {}}
        onImageLoad={() => {}}
        onSelect={() => {}}
        overlayDisplayMode="always"
        rtspPlaybackUrl={null}
        rtspStreamMessage={null}
        rtspStreamStatus="idle"
        runtime={{
          connectionStatus: 'connected',
          reconnectAttempt: 0,
          errorMessage: null,
          currentImage: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
          imageNaturalSize: [1920, 1080],
          alertTier: 'risk',
          alertEligible: true,
          incomingFps: 10,
          lastMessageAt: null,
          topEventFlash: false,
          visualFrame: {
            sourceId: 'cam1',
            frameIndex: 1,
            reportWallTsMs: null,
            wsSentTsMs: null,
            combinedKo: '작업자 위험 접근',
            topEventKo: '경고: 작업자 접근',
            eventsKo: ['작업자 접근'],
            imageSize: [1920, 1080],
            overlayTrackIds: [7],
            relationTrackIds: [7, 8],
            alertTier: 'risk',
            highlight: { personTrackId: 7, machineryTrackId: 8, label: 'DANGER', tone: 'red' },
            zoneName: '굴착기 구역 A',
            detectedTargetLabel: '사람 (Person)',
            estimatedDistanceText: '약 1.8m',
            objects: [
              { trackId: 7, label: 'person', bbox: [240, 120, 560, 920] },
              { trackId: 8, label: 'machinery', bbox: [840, 260, 1550, 1020] },
            ],
          },
          latestFrame: {
            sourceId: 'cam1',
            frameIndex: 1,
            reportWallTsMs: null,
            wsSentTsMs: null,
            combinedKo: '작업자 위험 접근',
            topEventKo: '경고: 작업자 접근',
            eventsKo: ['작업자 접근'],
            imageSize: [1920, 1080],
            overlayTrackIds: [7],
            relationTrackIds: [7, 8],
            alertTier: 'risk',
            highlight: { personTrackId: 7, machineryTrackId: 8, label: 'DANGER', tone: 'red' },
            zoneName: '굴착기 구역 A',
            detectedTargetLabel: '사람 (Person)',
            estimatedDistanceText: '약 1.8m',
            objects: [
              { trackId: 7, label: 'person', bbox: [240, 120, 560, 920] },
              { trackId: 8, label: 'machinery', bbox: [840, 260, 1550, 1020] },
            ],
          },
        }}
      />
    );

    const tile = screen.getByRole('button', { name: 'CH-01 굴착기 구역 A' });
    expect(within(tile).getByText('PERSON #7')).toBeInTheDocument();
    expect(within(tile).getByText('MACHINERY #8')).toBeInTheDocument();
  });

  it('renders every relation-target object in high-contrast red during alerts', () => {
    const { container } = render(
      <MonitorTile
        bboxVisible
        channel={{ id: 1, cameraKey: 'cam1', channel: 'CH-01', title: '굴착기 구역 A', sourceType: 'cctv' }}
        isFocused={false}
        onHide={vi.fn()}
        onImageLoad={vi.fn()}
        onSelect={vi.fn()}
        overlayDisplayMode="always"
        rtspPlaybackUrl={null}
        rtspStreamMessage={null}
        rtspStreamStatus="idle"
        runtime={{
          connectionStatus: 'connected',
          reconnectAttempt: 0,
          errorMessage: null,
          currentImage: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
          imageNaturalSize: [1920, 1080],
          alertTier: 'risk',
          alertEligible: true,
          incomingFps: 10,
          lastMessageAt: null,
          topEventFlash: false,
          visualFrame: {
            sourceId: 'cam1',
            frameIndex: 1,
            reportWallTsMs: null,
            wsSentTsMs: null,
            combinedKo: '작업자 위험 접근',
            topEventKo: '경고: 작업자 접근',
            eventsKo: ['작업자 접근'],
            imageSize: [1920, 1080],
            overlayTrackIds: [7],
            relationTrackIds: [7, 8],
            alertTier: 'risk',
            highlight: { personTrackId: 7, machineryTrackId: 8, label: 'DANGER', tone: 'red' },
            zoneName: '굴착기 구역 A',
            detectedTargetLabel: '사람 (Person)',
            estimatedDistanceText: '약 1.8m',
            objects: [
              { trackId: 7, label: 'person', bbox: [240, 120, 560, 920] },
              { trackId: 8, label: 'machinery', bbox: [840, 260, 1550, 1020] },
            ],
          },
          latestFrame: {
            sourceId: 'cam1',
            frameIndex: 1,
            reportWallTsMs: null,
            wsSentTsMs: null,
            combinedKo: '작업자 위험 접근',
            topEventKo: '경고: 작업자 접근',
            eventsKo: ['작업자 접근'],
            imageSize: [1920, 1080],
            overlayTrackIds: [7],
            relationTrackIds: [7, 8],
            alertTier: 'risk',
            highlight: { personTrackId: 7, machineryTrackId: 8, label: 'DANGER', tone: 'red' },
            zoneName: '굴착기 구역 A',
            detectedTargetLabel: '사람 (Person)',
            estimatedDistanceText: '약 1.8m',
            objects: [
              { trackId: 7, label: 'person', bbox: [240, 120, 560, 920] },
              { trackId: 8, label: 'machinery', bbox: [840, 260, 1550, 1020] },
            ],
          },
        }}
      />
    );

    const redLabelRects = container.querySelectorAll('rect[fill="#ff3b30"]');
    expect(redLabelRects).toHaveLength(2);
  });
});
