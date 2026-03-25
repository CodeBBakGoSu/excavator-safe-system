import styled from '@emotion/styled';
import { Activity, AlertTriangle, Cable, HardHat, Radar, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  parseFrontendStatePayload,
  projectWorkerPoint,
  projectZoneRadius,
  sortWorkersForDisplay,
  validateFrontendStateSocketUrl,
} from './frontendStateParsing';
import type { FrontendStateConnectionStatus, FrontendStateSnapshot, FrontendStateWorker } from './frontendStateTypes';

const STORAGE_KEY = 'excavator-safe-system:frontend-state-ws-url';
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAYS_MS = [1000, 2000, 4000];

function loadStoredWsUrl(defaultValue = '') {
  if (typeof window === 'undefined') return defaultValue;
  return window.localStorage.getItem(STORAGE_KEY)?.trim() || defaultValue;
}

function getConnectionLabel(status: FrontendStateConnectionStatus) {
  if (status === 'connected') return '연결됨';
  if (status === 'connecting') return '연결 중';
  if (status === 'reconnecting') return '재연결 중';
  if (status === 'failed') return '실패';
  return '대기';
}

function getZoneTone(worker: FrontendStateWorker) {
  if (!worker.connected) return 'offline';
  if (worker.zoneStatus === 'danger') return 'danger';
  if (worker.zoneStatus === 'caution') return 'caution';
  return 'safe';
}

export default function FrontendStateDashboard({ embedded = false }: { embedded?: boolean }) {
  const [wsUrl, setWsUrl] = useState(() => loadStoredWsUrl(''));
  const [wsDraft, setWsDraft] = useState(() => loadStoredWsUrl(''));
  const [connectionStatus, setConnectionStatus] = useState<FrontendStateConnectionStatus>('idle');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<FrontendStateSnapshot | null>(null);
  const [lastReceivedAt, setLastReceivedAt] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current != null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const disconnectSocket = useCallback(() => {
    clearReconnectTimer();
    reconnectAttemptRef.current = 0;
    setReconnectAttempt(0);
    setConnectionStatus('idle');
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close(1000, 'manual disconnect');
    }
  }, [clearReconnectTimer]);

  const connectSocket = useCallback(
    (targetUrl: string, mode: 'manual' | 'retry' = 'manual') => {
      if (!targetUrl) return;
      const active = wsRef.current;
      if (active && (active.readyState === WebSocket.CONNECTING || active.readyState === WebSocket.OPEN)) return;

      setConnectionStatus(mode === 'manual' ? 'connecting' : 'reconnecting');
      setConfigMessage(null);

      const ws = new WebSocket(targetUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setReconnectAttempt(0);
        setConnectionStatus('connected');
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return;

        try {
          const nextSnapshot = parseFrontendStatePayload(JSON.parse(event.data) as Record<string, unknown>);
          setSnapshot(nextSnapshot);
          setLastReceivedAt(nextSnapshot.timestamp);
          setConnectionStatus('connected');
          setConfigMessage(null);
        } catch (error) {
          setConfigMessage(error instanceof Error ? error.message : '스냅샷 파싱에 실패했습니다.');
        }
      };

      ws.onerror = () => {
        setConfigMessage('브리지 연결 중 오류가 발생했습니다.');
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!mountedRef.current) return;
        const nextAttempt = reconnectAttemptRef.current + 1;
        if (nextAttempt > MAX_RECONNECT_ATTEMPTS) {
          setReconnectAttempt(MAX_RECONNECT_ATTEMPTS);
          setConnectionStatus('failed');
          setConfigMessage('브리지 자동 재연결에 실패했습니다.');
          return;
        }

        reconnectAttemptRef.current = nextAttempt;
        setReconnectAttempt(nextAttempt);
        setConnectionStatus('reconnecting');
        clearReconnectTimer();
        reconnectTimerRef.current = window.setTimeout(() => {
          if (!mountedRef.current) return;
          connectSocket(targetUrl, 'retry');
        }, RECONNECT_DELAYS_MS[nextAttempt - 1] ?? RECONNECT_DELAYS_MS[RECONNECT_DELAYS_MS.length - 1]);
      };
    },
    [clearReconnectTimer]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearReconnectTimer();
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        wsRef.current.close(1000, 'component unmount');
      }
    };
  }, [clearReconnectTimer]);

  const applyWsUrl = useCallback(() => {
    const error = validateFrontendStateSocketUrl(wsDraft);
    if (error) {
      setConfigMessage(error);
      return;
    }

    const nextUrl = wsDraft.trim();
    window.localStorage.setItem(STORAGE_KEY, nextUrl);
    disconnectSocket();
    setWsUrl(nextUrl);
    setConfigMessage('브리지 주소를 저장했습니다.');
    window.setTimeout(() => connectSocket(nextUrl), 0);
  }, [connectSocket, disconnectSocket, wsDraft]);

  const workers = useMemo(() => sortWorkersForDisplay(snapshot?.workers ?? []), [snapshot]);
  const dangerCount = workers.filter((worker) => worker.zoneStatus === 'danger').length;
  const cautionCount = workers.filter((worker) => worker.zoneStatus === 'caution').length;

  return (
    <PageShell $embedded={embedded}>
      <Hero $embedded={embedded}>
        <HeroText>
          <Eyebrow>FRONTEND STATE MONITOR</Eyebrow>
          <Title>{embedded ? '현장 상태 스냅샷' : '굴착기 작업자 안전 대시보드'}</Title>
          <Subtitle>UDP에서 넘어온 실시간 스냅샷을 WebSocket으로 수신해 작업자 위치와 위험 구역을 한 화면에 표시합니다.</Subtitle>
        </HeroText>

        <ActionPanel>
          <Input
            aria-label="브리지 WebSocket 주소"
            placeholder="ws://localhost:8787"
            value={wsDraft}
            onChange={(event) => setWsDraft(event.target.value)}
          />
          <Button type="button" onClick={applyWsUrl}>
            저장 후 연결
          </Button>
          <Button type="button" onClick={() => connectSocket(wsUrl)} disabled={!wsUrl} $secondary>
            다시 연결
          </Button>
          <Button type="button" onClick={disconnectSocket} $secondary>
            연결 해제
          </Button>
          {configMessage ? <ConfigMessage>{configMessage}</ConfigMessage> : null}
        </ActionPanel>
      </Hero>

      <SummaryGrid>
        <SummaryCard>
          <SummaryLabel>
            <Cable size={16} />
            연결 상태
          </SummaryLabel>
          <SummaryValue>{getConnectionLabel(connectionStatus)}</SummaryValue>
          <SummaryMeta>{connectionStatus === 'reconnecting' ? `재시도 ${reconnectAttempt}` : lastReceivedAt ?? '수신 대기'}</SummaryMeta>
        </SummaryCard>

        <SummaryCard>
          <SummaryLabel>
            <Radar size={16} />
            센서 서버
          </SummaryLabel>
          <SummaryValue>{snapshot?.system.sensorServerOnline ? 'ONLINE' : 'OFFLINE'}</SummaryValue>
          <SummaryMeta>{snapshot ? '브릿지 수신 기준' : '데이터 없음'}</SummaryMeta>
        </SummaryCard>

        <SummaryCard>
          <SummaryLabel>
            <AlertTriangle size={16} />
            Zone Rule
          </SummaryLabel>
          <SummaryValue>{snapshot ? `주의 ${snapshot.system.zoneRule.cautionDistanceM}m / 경고 ${snapshot.system.zoneRule.dangerDistanceM}m` : '-'}</SummaryValue>
          <SummaryMetaStack>
            <SummaryMeta>{snapshot ? `주의 반경 ${snapshot.system.zoneRule.cautionDistanceM}m` : '주의 반경 미수신'}</SummaryMeta>
            <SummaryMeta>{snapshot ? `경고 반경 ${snapshot.system.zoneRule.dangerDistanceM}m` : '경고 반경 미수신'}</SummaryMeta>
          </SummaryMetaStack>
        </SummaryCard>

        <SummaryCard $danger={dangerCount > 0}>
          <SummaryLabel>
            <Activity size={16} />
            현장 요약
          </SummaryLabel>
          <SummaryValue>{dangerCount > 0 ? `위험 ${dangerCount}명` : cautionCount > 0 ? `주의 ${cautionCount}명` : '정상'}</SummaryValue>
          <SummaryMeta>{`총 작업자 ${workers.length}명`}</SummaryMeta>
        </SummaryCard>
      </SummaryGrid>

      <MainGrid>
        <MapCard>
          <SectionTitle>상대 좌표 맵</SectionTitle>
          <MapPanel>
            <GridBackdrop />
            <CenterCross />
            <ExcavatorMarker>
              <HardHat size={18} />
              굴착기 (0, 0)
            </ExcavatorMarker>

            {snapshot ? (
              <>
                <ZoneGuide
                  data-testid="caution-zone-guide"
                  style={{
                    width: projectZoneRadius(snapshot.system.zoneRule.cautionDistanceM),
                    height: projectZoneRadius(snapshot.system.zoneRule.cautionDistanceM),
                  }}
                  $tone="caution"
                />
                <ZoneGuide
                  data-testid="danger-zone-guide"
                  style={{
                    width: projectZoneRadius(snapshot.system.zoneRule.dangerDistanceM),
                    height: projectZoneRadius(snapshot.system.zoneRule.dangerDistanceM),
                  }}
                  $tone="danger"
                />
              </>
            ) : null}

            {workers.map((worker) => (
              <WorkerMarker
                key={worker.tagId}
                data-testid={`worker-marker-${worker.tagId}`}
                style={projectWorkerPoint(worker)}
                $tone={getZoneTone(worker)}
              >
                <MarkerDot />
                <MarkerLabel>{worker.name}</MarkerLabel>
              </WorkerMarker>
            ))}
          </MapPanel>
          <MapLegend>고정 범위: X/Y 각각 -25m ~ 25m</MapLegend>
        </MapCard>

        <WorkerCard>
          <SectionTitle>작업자 상태</SectionTitle>
          <WorkerList>
            {workers.map((worker) => (
              <WorkerListItem key={worker.tagId} $tone={getZoneTone(worker)}>
                <WorkerHeader>
                  <div>
                    <WorkerName>{worker.name}</WorkerName>
                    <WorkerMeta>{`태그 ${worker.tagId} · ${worker.distanceM.toFixed(2)}m`}</WorkerMeta>
                  </div>
                  <ZoneBadge $tone={getZoneTone(worker)}>{worker.zoneStatus.toUpperCase()}</ZoneBadge>
                </WorkerHeader>

                <WorkerBadges>
                  {worker.approved ? (
                    <StatusBadge>
                      <ShieldCheck size={14} />
                      승인됨
                    </StatusBadge>
                  ) : null}
                  <StatusBadge>{worker.connected ? '연결 유지' : '연결 끊김'}</StatusBadge>
                  <StatusBadge>{`(${worker.x}, ${worker.y})`}</StatusBadge>
                </WorkerBadges>
              </WorkerListItem>
            ))}
          </WorkerList>
        </WorkerCard>
      </MainGrid>

      {snapshot ? <FooterNote>{`마지막 스냅샷 ${snapshot.timestamp} · 경고 반경 ${snapshot.system.zoneRule.dangerDistanceM}m`}</FooterNote> : null}
    </PageShell>
  );
}

const PageShell = styled.div<{ $embedded: boolean }>`
  min-height: ${({ $embedded }) => ($embedded ? 'auto' : '100vh')};
  padding: ${({ $embedded }) => ($embedded ? '24px' : '32px')};
  background: ${({ $embedded }) =>
    $embedded
      ? 'transparent'
      : `
    radial-gradient(circle at top, rgba(249, 115, 22, 0.18), transparent 34%),
    linear-gradient(180deg, #08111e 0%, #050913 100%)
  `};
  color: #f8fafc;
`;

const Hero = styled.header<{ $embedded: boolean }>`
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
  gap: 20px;
  align-items: end;
  margin-bottom: ${({ $embedded }) => ($embedded ? '18px' : '24px')};

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`;

const HeroText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Eyebrow = styled.div`
  color: #fdba74;
  font-size: 12px;
  letter-spacing: 0.16em;
`;

const Title = styled.h1`
  margin: 0;
  font-size: clamp(34px, 4vw, 52px);
  line-height: 1.04;
`;

const Subtitle = styled.p`
  max-width: 760px;
  margin: 0;
  color: rgba(226, 232, 240, 0.76);
  font-size: 15px;
`;

const ActionPanel = styled.div`
  display: grid;
  gap: 10px;
  padding: 18px;
  border-radius: 24px;
  background: rgba(8, 15, 29, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.24);
`;

const Input = styled.input`
  width: 100%;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(15, 23, 42, 0.9);
  color: inherit;
`;

const Button = styled.button<{ $secondary?: boolean }>`
  border: 0;
  border-radius: 14px;
  padding: 12px 16px;
  background: ${({ $secondary }) => ($secondary ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #f97316, #fb923c)')};
  color: white;
  cursor: pointer;
  opacity: ${({ disabled }) => (disabled ? 0.45 : 1)};
`;

const ConfigMessage = styled.div`
  color: #cbd5e1;
  font-size: 13px;
`;

const SummaryGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 24px;

  @media (max-width: 960px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const SummaryCard = styled.article<{ $danger?: boolean }>`
  padding: 18px;
  border-radius: 24px;
  background: ${({ $danger }) => ($danger ? 'rgba(127, 29, 29, 0.56)' : 'rgba(8, 15, 29, 0.78)')};
  border: 1px solid ${({ $danger }) => ($danger ? 'rgba(248, 113, 113, 0.3)' : 'rgba(255, 255, 255, 0.08)')};
`;

const SummaryLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(226, 232, 240, 0.74);
  font-size: 13px;
`;

const SummaryValue = styled.div`
  margin-top: 12px;
  font-size: 26px;
  font-weight: 700;
`;

const SummaryMeta = styled.div`
  color: rgba(226, 232, 240, 0.68);
  font-size: 13px;
`;

const SummaryMetaStack = styled.div`
  display: grid;
  gap: 4px;
  margin-top: 8px;
`;

const MainGrid = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
  gap: 18px;

  @media (max-width: 1120px) {
    grid-template-columns: 1fr;
  }
`;

const PanelCard = styled.article`
  padding: 20px;
  border-radius: 28px;
  background: rgba(8, 15, 29, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.22);
`;

const MapCard = styled(PanelCard)``;

const WorkerCard = styled(PanelCard)``;

const SectionTitle = styled.h2`
  margin: 0 0 14px;
  font-size: 20px;
`;

const MapPanel = styled.div`
  position: relative;
  min-height: 540px;
  border-radius: 26px;
  overflow: hidden;
  background:
    radial-gradient(circle at center, rgba(245, 158, 11, 0.12), transparent 30%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(2, 6, 23, 0.98));
  border: 1px solid rgba(255, 255, 255, 0.08);
`;

const GridBackdrop = styled.div`
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
  background-size: 52px 52px;
`;

const CenterCross = styled.div`
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1px;
  height: 100%;
  background: rgba(251, 191, 36, 0.28);
  transform: translateX(-50%);

  &::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 100vw;
    height: 1px;
    background: rgba(251, 191, 36, 0.28);
    transform: translate(-50%, -50%);
  }
`;

const ExcavatorMarker = styled.div`
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 4;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(251, 191, 36, 0.18);
  border: 1px solid rgba(251, 191, 36, 0.32);
  color: #fde68a;
  font-size: 13px;
`;

const ZoneGuide = styled.div<{ $tone: 'danger' | 'caution' }>`
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 2px dashed ${({ $tone }) => ($tone === 'danger' ? 'rgba(248, 113, 113, 0.9)' : 'rgba(250, 204, 21, 0.88)')};
  background: ${({ $tone }) => ($tone === 'danger' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(250, 204, 21, 0.06)')};
`;

const WorkerMarker = styled.div<{ $tone: 'danger' | 'caution' | 'safe' | 'offline' }>`
  position: absolute;
  transform: translate(-50%, -50%);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  z-index: 5;
  color: #fff;
`;

const MarkerDot = styled.div`
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #f8fafc;
  box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.12);
`;

const MarkerLabel = styled.div`
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 12px;
`;

const MapLegend = styled.div`
  margin-top: 12px;
  color: rgba(226, 232, 240, 0.7);
  font-size: 13px;
`;

const WorkerList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
`;

const WorkerListItem = styled.li<{ $tone: 'danger' | 'caution' | 'safe' | 'offline' }>`
  padding: 16px;
  border-radius: 20px;
  background: ${({ $tone }) =>
    $tone === 'danger'
      ? 'rgba(127, 29, 29, 0.52)'
      : $tone === 'caution'
        ? 'rgba(120, 53, 15, 0.48)'
        : $tone === 'offline'
          ? 'rgba(51, 65, 85, 0.58)'
          : 'rgba(15, 23, 42, 0.82)'};
  border: 1px solid
    ${({ $tone }) =>
      $tone === 'danger'
        ? 'rgba(248, 113, 113, 0.32)'
        : $tone === 'caution'
          ? 'rgba(251, 191, 36, 0.26)'
          : 'rgba(255, 255, 255, 0.08)'};
`;

const WorkerHeader = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
`;

const WorkerName = styled.div`
  font-size: 18px;
  font-weight: 700;
`;

const WorkerMeta = styled.div`
  margin-top: 6px;
  color: rgba(226, 232, 240, 0.74);
  font-size: 13px;
`;

const WorkerBadges = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
`;

const StatusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 12px;
`;

const ZoneBadge = styled.span<{ $tone: 'danger' | 'caution' | 'safe' | 'offline' }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 84px;
  padding: 8px 12px;
  border-radius: 999px;
  background: ${({ $tone }) =>
    $tone === 'danger'
      ? 'rgba(248, 113, 113, 0.18)'
      : $tone === 'caution'
        ? 'rgba(251, 191, 36, 0.18)'
        : $tone === 'offline'
          ? 'rgba(148, 163, 184, 0.18)'
          : 'rgba(34, 197, 94, 0.18)'};
  color: #fff;
  font-size: 12px;
  letter-spacing: 0.08em;
`;

const FooterNote = styled.div`
  margin-top: 18px;
  color: rgba(226, 232, 240, 0.68);
  font-size: 13px;
`;
