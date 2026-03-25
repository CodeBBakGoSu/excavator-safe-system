#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT_STATE_FILE="${ROOT_DIR}/.sensor-udp-port"
IP_STATE_FILE="${ROOT_DIR}/.frontend-bind-ip"
FRONTEND_PID=""
BRIDGE_PID=""
VITE_PORT="${VITE_PORT:-5173}"
BRIDGE_WS_PORT="${SENSOR_BRIDGE_WS_PORT:-8787}"
DEFAULT_UDP_PORT="${SENSOR_UDP_PORT:-9500}"
AI_UDP_PORT="${AI_UDP_PORT:-9600}"

detect_primary_ip() {
  if command -v hostname >/dev/null 2>&1; then
    local hostname_ip
    hostname_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
    if [[ -n "${hostname_ip}" ]]; then
      echo "${hostname_ip}"
      return
    fi
  fi

  if command -v ip >/dev/null 2>&1; then
    local ip_addr
    ip_addr="$(ip route get 1.1.1.1 2>/dev/null | awk '/src/ {for (i=1; i<=NF; i++) if ($i == "src") {print $(i+1); exit}}')"
    if [[ -n "${ip_addr}" ]]; then
      echo "${ip_addr}"
      return
    fi
  fi

  if command -v ifconfig >/dev/null 2>&1; then
    local ifconfig_ip
    ifconfig_ip="$(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" {print $2; exit}')"
    if [[ -n "${ifconfig_ip}" ]]; then
      echo "${ifconfig_ip}"
      return
    fi
  fi

  echo "127.0.0.1"
}

read_saved_ip() {
  if [[ -f "${IP_STATE_FILE}" ]]; then
    local saved_ip
    saved_ip="$(tr -d '[:space:]' < "${IP_STATE_FILE}")"
    if [[ -n "${saved_ip}" ]]; then
      echo "${saved_ip}"
      return
    fi
  fi

  detect_primary_ip
}

read_saved_udp_port() {
  if [[ -f "${PORT_STATE_FILE}" ]]; then
    local saved_port
    saved_port="$(tr -d '[:space:]' < "${PORT_STATE_FILE}")"
    if [[ "${saved_port}" =~ ^[0-9]+$ ]] && (( saved_port > 0 && saved_port < 65536 )); then
      echo "${saved_port}"
      return
    fi
  fi

  echo "${DEFAULT_UDP_PORT}"
}

prompt_line() {
  printf '%s\n' "$*" >&2
}

prompt_text() {
  printf '%s' "$*" >&2
}

choose_udp_port() {
  local recent_port="$1"

  if [[ ! -t 0 ]]; then
    echo "${recent_port}"
    return
  fi

  prompt_line "[start] UDP 리스닝 포트를 정합니다."
  prompt_line "[start] Android 보드가 보내는 UDP 데이터를 센서 브리지가 이 포트에서 받습니다."
  prompt_line "  1) 최근 포트 사용 (${recent_port})"
  prompt_line "  2) 새 포트 입력"
  prompt_text "[start] UDP 선택 (기본값 1): "

  local choice=""
  read -r choice || true
  choice="${choice:-1}"

  if [[ "${choice}" == "2" ]]; then
    while true; do
      prompt_text "[start] 새 UDP 포트 입력: "
      local new_port=""
      read -r new_port || true
      if [[ "${new_port}" =~ ^[0-9]+$ ]] && (( new_port > 0 && new_port < 65536 )); then
        echo "${new_port}"
        return
      fi
      prompt_line "[start] 1~65535 사이 숫자를 입력해주세요."
    done
  fi

  echo "${recent_port}"
}

choose_bind_ip() {
  local recent_ip="$1"
  local auto_ip="$2"

  if [[ ! -t 0 ]]; then
    echo "${recent_ip}"
    return
  fi

  prompt_line "[start] 다른 컴퓨터에서 접속할 프론트 주소(IP)를 정합니다."
  prompt_line "[start] 이 IP 하나로만 접속 안내를 출력하고 Vite도 그 IP에 바인딩합니다."
  prompt_line "  1) 최근 IP 사용 (${recent_ip})"
  prompt_line "  2) 자동 감지 IP 사용 (${auto_ip})"
  prompt_line "  3) 직접 IP 입력"
  prompt_text "[start] IP 선택 (기본값 1): "

  local choice=""
  read -r choice || true
  choice="${choice:-1}"

  if [[ "${choice}" == "2" ]]; then
    echo "${auto_ip}"
    return
  fi

  if [[ "${choice}" == "3" ]]; then
    while true; do
      prompt_text "[start] 프론트 바인딩 IP 입력: "
      local custom_ip=""
      read -r custom_ip || true
      custom_ip="$(printf '%s' "${custom_ip}" | tr -d '[:space:]')"
      if [[ -n "${custom_ip}" ]]; then
        echo "${custom_ip}"
        return
      fi
      prompt_line "[start] 비어 있지 않은 IP를 입력해주세요."
    done
  fi

  echo "${recent_ip}"
}

cleanup() {
  local exit_code=$?

  if [[ -n "${FRONTEND_PID}" ]] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
    kill "${FRONTEND_PID}" 2>/dev/null || true
  fi

  if [[ -n "${BRIDGE_PID}" ]] && kill -0 "${BRIDGE_PID}" 2>/dev/null; then
    kill "${BRIDGE_PID}" 2>/dev/null || true
  fi

  wait "${FRONTEND_PID}" 2>/dev/null || true
  wait "${BRIDGE_PID}" 2>/dev/null || true

  exit "${exit_code}"
}

trap cleanup EXIT INT TERM

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[start] pnpm 이 설치되어 있어야 합니다."
  exit 1
fi

cd "${ROOT_DIR}"

RECENT_UDP_PORT="$(read_saved_udp_port)"
SELECTED_UDP_PORT="$(choose_udp_port "${RECENT_UDP_PORT}")"
printf '%s\n' "${SELECTED_UDP_PORT}" > "${PORT_STATE_FILE}"

AUTO_IP="$(detect_primary_ip)"
RECENT_IP="$(read_saved_ip)"
BIND_IP="${VITE_HOST:-$(choose_bind_ip "${RECENT_IP}" "${AUTO_IP}")}"
printf '%s\n' "${BIND_IP}" > "${IP_STATE_FILE}"

echo "[start] using UDP port ${SELECTED_UDP_PORT}"
echo "[start] using AI UDP port ${AI_UDP_PORT}"
echo "[start] binding frontend host ${BIND_IP}"

echo "[start] starting sensor bridge..."
SENSOR_UDP_PORT="${SELECTED_UDP_PORT}" AI_UDP_PORT="${AI_UDP_PORT}" pnpm sensor:bridge &
BRIDGE_PID=$!

echo "[start] starting frontend dev server..."
pnpm exec vite --host "${BIND_IP}" --port "${VITE_PORT}" --strictPort &
FRONTEND_PID=$!

echo "[start] frontend pid=${FRONTEND_PID}, bridge pid=${BRIDGE_PID}"
echo "[start] app:             http://${BIND_IP}:${VITE_PORT}"
echo "[start] bridge udp:      udp://0.0.0.0:${SELECTED_UDP_PORT}"
echo "[start] ai alert udp:    udp://0.0.0.0:${AI_UDP_PORT}"
echo "[start] bridge websocket: ws://${BIND_IP}:${BRIDGE_WS_PORT}"
echo "[start] press Ctrl+C to stop both processes"

wait -n "${BRIDGE_PID}" "${FRONTEND_PID}"
