# Sensor UDP Alert Bridge Design

## Goal
CCTV 중심의 2분할 관제 POC에 센서 이벤트 흐름을 추가한다. 브라우저가 직접 UDP를 받을 수 없으므로, 작은 UDP-to-WebSocket 브리지를 두고 프론트는 그 브리지에 연결한다. 센서 UI는 상시 노출하지 않고, 특정 센서 이벤트가 들어왔을 때만 센서 위치 파악용 자동 팝업을 띄운다.

## Architecture
- 브리지 프로세스
  - Node 기반 로컬 브리지 서버를 프로젝트 안에 추가한다.
  - UDP 소켓으로 센서 데이터를 수신한다.
  - 수신한 메시지를 브라우저에서 읽을 수 있는 WebSocket으로 브로드캐스트한다.
  - UDP listen host/port, 브리지 WebSocket host/port는 환경변수 또는 실행 인자로 쉽게 바꿀 수 있게 한다.
- 프론트엔드
  - 기존 CCTV WebSocket 흐름과 별도로 센서 브리지 WebSocket 연결을 추가한다.
  - 센서 브리지 주소는 웹 UI에서 쉽게 수정하고 localStorage에 저장한다.
  - 센서 이벤트가 오면 전체 화면 위에 자동 센서 위치 팝업을 띄운다.

## Data Flow
1. 센서 시스템이 UDP 패킷으로 이벤트를 보낸다.
2. 브리지 서버가 UDP 패킷을 수신하고 JSON으로 파싱한다.
3. 브리지가 모든 프론트 클라이언트에 WebSocket 메시지로 센서 이벤트를 브로드캐스트한다.
4. 프론트는 이벤트를 정규화한다.
5. 이벤트가 actionable이면 센서 위치 팝업을 즉시 띄운다.
6. 팝업은 몇 초 후 자동으로 닫히고, 최신 이벤트 기준으로 갱신된다.

## Sensor Popup UX
- 팝업은 CCTV 시연을 방해하지 않으면서도 즉시 주목되도록 중앙 오버레이로 띄운다.
- 팝업 내부는 2D 탑뷰 상대좌표 맵을 사용한다.
- 굴착기 센서 좌표와 주변 센서 좌표를 함께 표시한다.
- 이벤트를 발생시킨 센서는 강한 강조색으로 표시한다.
- 위험도나 이벤트 종류가 있다면 상단 배지와 짧은 메시지로 노출한다.
- 좌표축은 과한 공학 UI 대신 직관적인 현장 맵 스타일로 표현한다.
- 팝업은 자동 표시 후 자동 닫힘을 기본값으로 하고, 연속 이벤트가 들어오면 최신 이벤트로 갱신한다.

## Frontend State
- sensorBridgeUrl
- sensorConnectionStatus
- sensorReconnectAttempt
- latestSensorEvent
- sensorPopupVisible
- sensorPopupAutoCloseTimer
- sensorFlashState

## Event Shape Assumptions
브리지와 프론트는 아래 형태를 수용하도록 느슨하게 설계한다.
- event_id 또는 sequence
- event_type
- severity 또는 level
- excavator position/sensor points
- nearby sensor points
- triggered sensor ids
- timestamp

예시 정규화 모델:
- `eventId: string`
- `eventType: string`
- `level: 'info' | 'caution' | 'risk'`
- `anchor: { x: number, y: number } | null`
- `excavatorSensors: Array<{ id: string, x: number, y: number }>`
- `externalSensors: Array<{ id: string, x: number, y: number }>`
- `triggeredSensorIds: string[]`
- `message: string`
- `receivedAt: number`

## Error Handling
- UDP 브리지에서 잘못된 JSON은 버리고 로그만 남긴다.
- 프론트는 파싱 실패 시 UI 전체를 깨뜨리지 않고 해당 메시지만 무시한다.
- 센서 브리지 연결 실패 시 상단 상태줄에 실패 상태를 노출한다.
- 센서 이벤트 좌표가 일부 누락되어도 사용 가능한 점만 렌더링한다.

## Testing
- 브리지 유닛 테스트
  - UDP payload JSON 파싱
  - 메시지 정규화
  - WebSocket 브로드캐스트
- 프론트 유닛 테스트
  - 센서 이벤트 정규화
  - 좌표 bounds 계산
  - triggered sensor 강조 로직
  - auto popup open/refresh/close 흐름
- 수동 확인
  - CCTV 2분할은 유지되는지
  - 센서 이벤트 수신 시 자동 팝업이 뜨는지
  - 설정 패널에서 센서 브리지 주소 변경 후 재연결되는지

## Files To Add Or Change
- Add: `sensor-bridge/server.js`
- Add: `sensor-bridge/README.md`
- Add: `cctv-poc/sensorParsing.ts`
- Add: `cctv-poc/SensorAlertModal.tsx`
- Add: `cctv-poc/sensorTypes.ts`
- Modify: `ExcavatorCctvPocPage.tsx`
- Modify: `src/App.tsx` only if entry wiring needs cleanup
- Modify: `package.json` to add bridge scripts if needed

## Non-Goals
- 센서 상시 관제용 독립 대시보드
- 3D 맵 또는 실시간 궤적 재생
- CCTV와 센서의 복잡한 상관 분석 엔진
