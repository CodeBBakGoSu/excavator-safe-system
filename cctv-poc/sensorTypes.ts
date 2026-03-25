export type SensorAlertLevel = 'info' | 'caution' | 'risk';

export interface SensorPoint {
  id: string;
  x: number;
  y: number;
  role: 'excavator' | 'external';
  label: string;
}

export interface SensorEventSnapshot {
  eventId: string;
  eventType: string;
  level: SensorAlertLevel;
  message: string;
  anchor: { x: number; y: number } | null;
  excavatorSensors: SensorPoint[];
  externalSensors: SensorPoint[];
  triggeredSensorIds: string[];
  receivedAt: number;
  sourceLabel: string;
}

export type SensorConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
