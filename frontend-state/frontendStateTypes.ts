export type ZoneStatus = 'safe' | 'caution' | 'danger';

export interface FrontendStateSystem {
  sensorServerOnline: boolean;
  zoneRule: {
    cautionDistanceM: number;
    dangerDistanceM: number;
  };
}

export interface FrontendStateWorker {
  tagId: number;
  name: string;
  approved: boolean;
  connected: boolean;
  x: number;
  y: number;
  distanceM: number;
  zoneStatus: ZoneStatus;
  isWarning: boolean;
  isEmergency: boolean;
  lastUpdate: string;
}

export interface FrontendStateSnapshot {
  type: 'frontend_state';
  timestamp: string;
  system: FrontendStateSystem;
  workers: FrontendStateWorker[];
}

export type FrontendStateConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
