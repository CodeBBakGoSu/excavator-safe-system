# Sensor Bridge API

로컬 브리지는 더 이상 센서/AI UDP를 수신하지 않습니다.

현재 역할은 아래 두 가지입니다.

- 프런트에서 릴레이한 센서 위험 스냅샷과 CCTV `RISK` 이벤트를 텔레그램으로 전송
- RTSP 제어 및 프레임 이미지 제공

## Run

```bash
pnpm sensor:bridge
```

프런트와 브리지를 같이 띄우려면 프로젝트 루트에서 아래 둘 중 하나를 실행하면 됩니다.

```bash
bash ./start.sh
```

```bash
pnpm dev:all
```

환경변수 예시:

```bash
SENSOR_BRIDGE_WS_PORT=8787
TELEGRAM_BOT_TOKEN=123456:abcde
TELEGRAM_CHAT_ID=-1001234567890
SENSOR_ALERT_COOLDOWN_MS=30000
pnpm sensor:bridge
```

## Telegram Relay APIs

브리지는 프런트가 보낸 JSON payload를 받아 텔레그램 전송만 담당합니다.

- `POST /telegram/alerts/sensor`
  센서 WebSocket에서 받은 원본 `frontend_state` payload 전달
- `POST /telegram/alerts/cctv`
  CCTV WebSocket에서 받은 원본 프레임 payload 전달

센서 위험 알림은 기본적으로 30초 쿨다운(`SENSOR_ALERT_COOLDOWN_MS`)을 적용합니다.
CCTV 알림은 전달된 이벤트가 `RISK` 이상일 때만 전송합니다.

## Settings APIs

- `GET /telegram/settings`
- `POST /telegram/settings`
- `POST /telegram/settings/recommended`
- `POST /telegram/chats/sync`

텔레그램은 공식적으로 봇 없이 서버가 임의 채팅방에 바로 쓰는 방식을 제공하지 않으므로, 봇 토큰과 대상 `chat_id` 가 필요합니다.
`TELEGRAM_CHAT_ID` 는 하나만 넣어도 되고, `-100123,-100456` 처럼 여러 개를 쉼표로 넣어도 됩니다.
`TELEGRAM_CHAT_ID` 를 비워 두더라도, 사용자가 봇과 대화를 시작하거나 그룹에 봇을 추가한 뒤 메시지를 1개 보내면 브리지가 `getUpdates` 로 `chat_id` 를 자동 수집합니다.

웹 UI에서는 Bot Token 저장, 채팅방 동기화, 알림 대상 선택, 추천 설정 적용을 할 수 있습니다.
