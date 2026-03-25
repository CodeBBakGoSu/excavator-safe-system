# Excavator Safe System

굴착기 작업 현장의 안전 상태를 시각화하는 Vite + React 기반 프로젝트입니다.

## Run

```bash
pnpm install
pnpm dev
```

프런트엔드와 센서 브리지를 함께 실행하려면 아래 명령을 사용합니다.

```bash
pnpm dev:all
```

## Scripts

- `pnpm dev`: 프런트엔드 개발 서버 실행
- `pnpm dev:all`: 프런트엔드와 센서 브리지 동시 실행
- `pnpm build`: 타입 검사 후 프로덕션 빌드
- `pnpm test`: 테스트 실행
- `pnpm sensor:bridge`: UDP to WebSocket 센서 브리지 실행

센서 브리지 상세 설명은 [sensor-bridge/README.md](./sensor-bridge/README.md) 를 참고하세요.
