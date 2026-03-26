export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
export type AlertTier = 'normal' | 'caution' | 'risk';
export type HazardTone = 'yellow' | 'orange' | 'red';
export type BBox = [number, number, number, number];

export interface DetectedObject {
  trackId: number | null;
  label: string;
  bbox: BBox;
}

export interface HighlightedHazard {
  personTrackId: number | null;
  machineryTrackId: number | null;
  label: string;
  tone: HazardTone;
}

export interface FrameSnapshot {
  sourceId: string;
  frameIndex: number | null;
  reportWallTsMs: number | null;
  wsSentTsMs: number | null;
  objects: DetectedObject[];
  combinedKo: string;
  topEventKo: string;
  eventsKo: string[];
  imageSize: [number, number] | null;
  overlayTrackIds: number[];
  relationTrackIds: number[];
  alertTier: AlertTier;
  highlight: HighlightedHazard | null;
  zoneName: string | null;
  detectedTargetLabel: string | null;
  estimatedDistanceText: string | null;
}

export interface ChannelConfig {
  id: number;
  cameraKey: string;
  channel: string;
  title: string;
  sourceType?: 'cctv' | 'rtsp';
}

export interface ChannelRuntimeState {
  connectionStatus: ConnectionStatus;
  reconnectAttempt: number;
  errorMessage: string | null;
  currentImage: string | null;
  latestFrame: FrameSnapshot;
  visualFrame: FrameSnapshot;
  imageNaturalSize: [number, number] | null;
  alertTier: AlertTier;
  alertEligible: boolean;
  incomingFps: number;
  lastMessageAt: Date | null;
  topEventFlash: boolean;
}
