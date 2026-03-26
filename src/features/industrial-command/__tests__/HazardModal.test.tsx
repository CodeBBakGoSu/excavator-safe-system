import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HazardModal } from '../components/HazardModal';

describe('HazardModal', () => {
  it('draws relation-target boxes in red and keeps unrelated objects in the normal box tone', () => {
    render(
      <HazardModal
        channelLabel="CH-01"
        channelTitle="굴착기 구역 A"
        bboxVisible
        onClose={() => {}}
        overlayDisplayMode="always"
        open
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
              { trackId: 9, label: 'person', bbox: [1200, 120, 1400, 620] },
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
              { trackId: 9, label: 'person', bbox: [1200, 120, 1400, 620] },
            ],
          },
        }}
        summary="작업자 위험 접근"
      />
    );

    expect(screen.getByTestId('hazard-box-7')).toHaveAttribute('stroke', '#ff3b30');
    expect(screen.getByTestId('hazard-box-8')).toHaveAttribute('stroke', '#ff3b30');
    expect(screen.getByTestId('hazard-box-9')).toHaveAttribute('stroke', '#4b8eff');
  });

  it('adds a flashing red backdrop only for risk popups while keeping the dialog content stable', () => {
    const { container } = render(
      <HazardModal
        channelLabel="CH-01"
        channelTitle="굴착기 구역 A"
        bboxVisible
        onClose={() => {}}
        overlayDisplayMode="always"
        open
        runtime={{
          connectionStatus: 'connected',
          reconnectAttempt: 0,
          errorMessage: null,
          currentImage: null,
          imageNaturalSize: null,
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
            overlayTrackIds: [],
            relationTrackIds: [],
            alertTier: 'risk',
            highlight: null,
            zoneName: '굴착기 구역 A',
            detectedTargetLabel: '사람 (Person)',
            estimatedDistanceText: '약 1.8m',
            objects: [],
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
            overlayTrackIds: [],
            relationTrackIds: [],
            alertTier: 'risk',
            highlight: null,
            zoneName: '굴착기 구역 A',
            detectedTargetLabel: '사람 (Person)',
            estimatedDistanceText: '약 1.8m',
            objects: [],
          },
        }}
        summary="작업자 위험 접근"
      />
    );

    expect(container.firstChild).toHaveClass('hazard-backdrop-flash');
    expect(screen.getByRole('dialog', { name: '위험 이벤트 상세' })).toHaveClass('hazard-modal-shell');
  });

});
