import type { ChannelRuntimeState, DetectedObject, FrameSnapshot } from '../../../../cctv-poc/types';

export function shouldRenderBoxes(mode: 'always' | 'alert' | 'risk', alertTier: ChannelRuntimeState['alertTier']) {
  if (mode === 'always') return true;
  if (mode === 'alert') return alertTier !== 'normal';
  return alertTier === 'risk';
}

export function isRelationHighlighted(frame: FrameSnapshot, object: DetectedObject, alertTier: ChannelRuntimeState['alertTier']) {
  if (alertTier === 'normal' || object.trackId == null) return false;
  return frame.relationTrackIds.includes(object.trackId);
}

export function getOverlayObjects(runtime: ChannelRuntimeState, mode: 'always' | 'alert' | 'risk') {
  const highlightTrackIds = new Set(runtime.visualFrame.overlayTrackIds);
  const relationTrackIds = new Set(runtime.visualFrame.relationTrackIds);
  const sourceObjects =
    mode === 'always'
      ? runtime.visualFrame.objects
      : runtime.visualFrame.objects.filter(
          (object) => object.trackId != null && (highlightTrackIds.has(object.trackId) || relationTrackIds.has(object.trackId))
        );

  return sourceObjects.map((object) => ({
    object,
    highlighted: object.trackId != null && highlightTrackIds.has(object.trackId),
    relationHighlighted: isRelationHighlighted(runtime.visualFrame, object, runtime.alertTier),
  }));
}
