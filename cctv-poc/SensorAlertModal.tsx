import styled from '@emotion/styled';
import { Radar, TriangleAlert } from 'lucide-react';
import { computeSensorPlotBounds } from './sensorParsing';
import type { SensorEventSnapshot, SensorPoint } from './sensorTypes';

interface SensorAlertModalProps {
  open: boolean;
  event: SensorEventSnapshot | null;
  onClose: () => void;
}

function projectPoint(point: { x: number; y: number }, bounds: ReturnType<typeof computeSensorPlotBounds>) {
  return {
    left: `${((point.x - bounds.minX) / bounds.width) * 100}%`,
    top: `${100 - ((point.y - bounds.minY) / bounds.height) * 100}%`,
  };
}

function SensorMarker({ point, triggered, bounds }: { point: SensorPoint; triggered: boolean; bounds: ReturnType<typeof computeSensorPlotBounds> }) {
  const style = projectPoint(point, bounds);

  return (
    <Marker style={style} $role={point.role} $triggered={triggered}>
      <Dot />
      <MarkerLabel>
        <strong>{point.label}</strong>
        {triggered ? <TriggeredTag>Triggered</TriggeredTag> : null}
      </MarkerLabel>
    </Marker>
  );
}

export function SensorAlertModal({ open, event, onClose }: SensorAlertModalProps) {
  if (!open || !event) return null;

  const bounds = computeSensorPlotBounds(event);
  const allPoints = [...event.excavatorSensors, ...event.externalSensors];

  return (
    <Overlay
      onClick={(clickedEvent) => {
        if (clickedEvent.target === clickedEvent.currentTarget) onClose();
      }}
    >
      <Dialog>
        <Header>
          <HeaderCopy>
            <SignalIconWrap>
              <TriangleAlert size={18} />
            </SignalIconWrap>
            <div>
              <Eyebrow>{event.level === 'risk' ? 'AUTOMATIC SENSOR ALERT' : 'SENSOR EVENT'}</Eyebrow>
              <Title>센서 위치 경보</Title>
            </div>
          </HeaderCopy>
          <SourceTag>
            <Radar size={16} />
            {event.sourceLabel}
          </SourceTag>
        </Header>

        <Body>
          <MapPanel>
            <MapBackdrop />
            {event.anchor ? <Anchor style={projectPoint(event.anchor, bounds)}>굴착기 기준점</Anchor> : null}
            {allPoints.map((point) => (
              <SensorMarker key={point.id} point={point} triggered={event.triggeredSensorIds.includes(point.id)} bounds={bounds} />
            ))}
          </MapPanel>

          <SidePanel>
            <Message>{event.message}</Message>
            <MetaList>
              <MetaItem>
                <MetaLabel>이벤트 타입</MetaLabel>
                <MetaValue>{event.eventType}</MetaValue>
              </MetaItem>
              <MetaItem>
                <MetaLabel>트리거 센서</MetaLabel>
                <MetaValue>{event.triggeredSensorIds.join(', ') || '-'}</MetaValue>
              </MetaItem>
              <MetaItem>
                <MetaLabel>센서 수</MetaLabel>
                <MetaValue>{allPoints.length}</MetaValue>
              </MetaItem>
            </MetaList>
          </SidePanel>
        </Body>
      </Dialog>
    </Overlay>
  );
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 95;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(12, 9, 10, 0.82);
  backdrop-filter: blur(10px);
`;

const Dialog = styled.div`
  width: min(960px, 100%);
  border-radius: 28px;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(43, 14, 14, 0.96), rgba(11, 11, 14, 0.98));
  border: 1px solid rgba(248, 113, 113, 0.35);
  box-shadow: 0 0 0 1px rgba(248, 113, 113, 0.12), 0 24px 60px rgba(0, 0, 0, 0.45);
  animation: sensor-alert-pulse 1.2s ease-in-out infinite alternate;

  @keyframes sensor-alert-pulse {
    from {
      box-shadow: 0 0 0 1px rgba(248, 113, 113, 0.12), 0 24px 60px rgba(0, 0, 0, 0.45);
    }
    to {
      box-shadow: 0 0 0 1px rgba(248, 113, 113, 0.28), 0 0 40px rgba(220, 38, 38, 0.24), 0 28px 72px rgba(0, 0, 0, 0.5);
    }
  }
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 24px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
`;

const HeaderCopy = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
`;

const SignalIconWrap = styled.div`
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: rgba(220, 38, 38, 0.18);
  color: #fca5a5;
`;

const Eyebrow = styled.div`
  color: rgba(252, 165, 165, 0.76);
  font-size: 11px;
  letter-spacing: 0.14em;
`;

const Title = styled.h2`
  margin: 4px 0 0;
  font-size: 29px;
  line-height: 1.1;
  color: #fff6f6;
`;

const SourceTag = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  color: #fbcaca;
  font-size: 13px;
`;

const Body = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.65fr);
  gap: 18px;
  padding: 20px 24px 24px;

  @media (max-width: 840px) {
    grid-template-columns: 1fr;
  }
`;

const MapPanel = styled.div`
  position: relative;
  min-height: 420px;
  border-radius: 22px;
  overflow: hidden;
  background:
    radial-gradient(circle at center, rgba(248, 113, 113, 0.18), transparent 42%),
    linear-gradient(180deg, rgba(22, 24, 28, 0.95), rgba(11, 11, 14, 0.96));
  border: 1px solid rgba(255, 255, 255, 0.08);
`;

const MapBackdrop = styled.div`
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.35));
`;

const Anchor = styled.div`
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.18);
  color: #bbf7d0;
  font-size: 12px;
  border: 1px solid rgba(134, 239, 172, 0.3);
`;

const Marker = styled.div<{ $role: SensorPoint['role']; $triggered: boolean }>`
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 10px;
  color: ${({ $role }) => ($role === 'excavator' ? '#c4b5fd' : '#f5f5f5')};
  z-index: ${({ $triggered }) => ($triggered ? 3 : 2)};
`;

const Dot = styled.div`
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #f8fafc;
  box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.08);
`;

const MarkerLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 12px;
  background: rgba(9, 9, 11, 0.84);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 12px;
`;

const TriggeredTag = styled.span`
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(220, 38, 38, 0.22);
  color: #fecaca;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const SidePanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const Message = styled.div`
  padding: 18px 18px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 18px;
  line-height: 1.4;
  color: #fff5f5;
`;

const MetaList = styled.div`
  display: grid;
  gap: 12px;
`;

const MetaItem = styled.div`
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
`;

const MetaLabel = styled.div`
  color: rgba(255, 228, 230, 0.62);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
`;

const MetaValue = styled.div`
  margin-top: 6px;
  color: #fff4f4;
  font-size: 15px;
`;
