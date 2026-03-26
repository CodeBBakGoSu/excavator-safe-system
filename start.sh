#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_PID=""
BRIDGE_PID=""
VITE_PORT="${VITE_PORT:-5173}"
BRIDGE_WS_PORT="${SENSOR_BRIDGE_WS_PORT:-8787}"

detect_access_ip() {
  local candidates=""

  if command -v hostname >/dev/null 2>&1; then
    candidates="$(hostname -I 2>/dev/null || true)"
  fi

  if [[ -z "${candidates// }" ]] && command -v ip >/dev/null 2>&1; then
    candidates="$(ip -o -4 addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | tr '\n' ' ')"
  fi

  if [[ -n "${candidates// }" ]]; then
    local preferred_ip=""
    preferred_ip="$(printf '%s\n' ${candidates} | awk '/^10\./ {print; exit}')"
    if [[ -n "${preferred_ip}" ]]; then
      echo "${preferred_ip}"
      return
    fi

    preferred_ip="$(printf '%s\n' ${candidates} | awk '/^192\.168\./ {print; exit}')"
    if [[ -n "${preferred_ip}" ]]; then
      echo "${preferred_ip}"
      return
    fi

    preferred_ip="$(printf '%s\n' ${candidates} | awk 'NF {print; exit}')"
    if [[ -n "${preferred_ip}" ]]; then
      echo "${preferred_ip}"
      return
    fi
  fi

  echo "127.0.0.1"
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

ACCESS_IP="$(detect_access_ip)"
BIND_IP="${VITE_HOST:-0.0.0.0}"

echo "[start] binding frontend host ${BIND_IP}"

echo "[start] starting sensor bridge..."
pnpm sensor:bridge &
BRIDGE_PID=$!

echo "[start] starting frontend dev server..."
pnpm exec vite --host "${BIND_IP}" --port "${VITE_PORT}" --strictPort &
FRONTEND_PID=$!

echo "[start] frontend pid=${FRONTEND_PID}, bridge pid=${BRIDGE_PID}"
echo "[start] app:             http://${ACCESS_IP}:${VITE_PORT}"
echo "[start] bridge api:      http://${ACCESS_IP}:${BRIDGE_WS_PORT}"
echo "[start] press Ctrl+C to stop both processes"

wait -n "${BRIDGE_PID}" "${FRONTEND_PID}"
