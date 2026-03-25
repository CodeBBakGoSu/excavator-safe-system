import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SensorAlertModal } from '../SensorAlertModal';
import type { SensorEventSnapshot } from '../sensorTypes';

const baseEvent: SensorEventSnapshot = {
  eventId: 'evt-301',
  eventType: 'sensor_proximity',
  level: 'risk',
  message: '작업자 태그 접근 감지',
  anchor: { x: 0, y: 0 },
  excavatorSensors: [
    { id: 'exc-front', x: -2, y: 3, role: 'excavator', label: '차체 전방' },
    { id: 'exc-tail', x: 2, y: -3, role: 'excavator', label: '차체 후방' },
  ],
  externalSensors: [
    { id: 'tag-7', x: 11, y: 8, role: 'external', label: '작업자 태그 7' },
  ],
  triggeredSensorIds: ['tag-7'],
  receivedAt: 1773300130685,
  sourceLabel: '굴착기 A',
};

describe('SensorAlertModal', () => {
  it('renders summary and sensor points when open', () => {
    render(<SensorAlertModal open event={baseEvent} onClose={() => undefined} />);

    expect(screen.getByText('센서 위치 경보')).toBeInTheDocument();
    expect(screen.getByText('작업자 태그 접근 감지')).toBeInTheDocument();
    expect(screen.getByText('굴착기 A')).toBeInTheDocument();
    expect(screen.getByText('차체 전방')).toBeInTheDocument();
    expect(screen.getByText('작업자 태그 7')).toBeInTheDocument();
  });

  it('marks triggered sensors in the list', () => {
    render(<SensorAlertModal open event={baseEvent} onClose={() => undefined} />);

    expect(screen.getByText('Triggered')).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<SensorAlertModal open={false} event={baseEvent} onClose={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
