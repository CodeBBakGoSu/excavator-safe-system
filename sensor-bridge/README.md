# Sensor UDP Bridge

센서 시스템이 보내는 UDP JSON 패킷을 브라우저가 구독할 수 있는 WebSocket으로 중계하는 작은 브리지입니다.

추가로 AI 서버가 보내는 UDP 이벤트를 별도 포트에서 받아, `RISK` 이상일 때만 텔레그램 채팅방으로 알림을 보낼 수 있습니다.

## Run

```bash
pnpm sensor:bridge
```

프론트와 브리지를 같이 띄우려면 프로젝트 루트에서 아래 둘 중 하나를 실행하면 됩니다.

```bash
bash ./start.sh
```

```bash
pnpm dev:all
```

환경변수로 포트를 바꿀 수 있습니다.

```bash
SENSOR_UDP_HOST=0.0.0.0
SENSOR_UDP_PORT=9500
AI_UDP_HOST=0.0.0.0
AI_UDP_PORT=9600
SENSOR_BRIDGE_WS_PORT=8787
TELEGRAM_BOT_TOKEN=123456:abcde
TELEGRAM_CHAT_ID=-1001234567890
pnpm sensor:bridge
```

## Expected UDP payload

```json
{
  "type": "frontend_state",
  "timestamp": "2026-03-22T20:30:15.120+09:00",
  "system": {
    "sensor_server_online": true,
    "zone_rule": {
      "caution_distance_m": 5,
      "danger_distance_m": 3
    }
  },
  "workers": [
    {
      "tag_id": 1,
      "name": "worker_1",
      "approved": false,
      "connected": true,
      "x": 1.25,
      "y": -0.85,
      "distance_m": 1.51,
      "zone_status": "danger",
      "is_warning": true,
      "is_emergency": true,
      "last_update": "2026-03-22T20:30:15.080+09:00"
    }
  ],
  "workers_note": "workers 배열에는 여러 작업자가 들어올 수 있습니다."
}
```

브리지는 유효한 `frontend_state` payload만 WebSocket 클라이언트에 그대로 브로드캐스트합니다.

## AI UDP alert payload

AI 이벤트는 센서 브로드캐스트와 별도 UDP 포트로 받습니다. 브리지는 `event_object_groups[].event.level` 중 최고값을 기준으로 `RISK` 이상일 때만 텔레그램으로 알림을 보냅니다.

전송 메시지에는 아래 정보가 포함됩니다.

- `sourceID`
- 최고 위험도
- `top_event_ko` 또는 `combined_ko`
- 사람 수 / 중장비 수
- `image_jpeg_base64` 가 있으면 JPEG 이미지 첨부

예시 실행:

```bash
SENSOR_UDP_PORT=9500 \
AI_UDP_PORT=9600 \
TELEGRAM_BOT_TOKEN=123456:abcde \
TELEGRAM_CHAT_ID=-1001234567890 \
pnpm sensor:bridge
```

주의사항:

- UDP 발신 측은 반드시 브리지 서버의 실제 내부망 IP와 포트를 목적지로 사용해야 합니다. 예: `192.168.0.20:9600`
- 브리지는 수신 서버이므로 `0.0.0.0:9600` 으로 바인딩해 둘 수 있습니다.
- 텔레그램은 공식적으로 봇 없이 서버가 임의 채팅방에 바로 쓰는 방식을 제공하지 않으므로, 봇 토큰과 대상 `chat_id` 가 필요합니다.
