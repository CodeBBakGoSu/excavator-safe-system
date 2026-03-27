import net from 'node:net';
import WebSocket from 'ws';

const SENSOR_WS_URL = process.env.SENSOR_SOURCE_WS_URL || 'ws://192.168.1.7:10000';
const LIGHT_TCP_HOST = process.env.LIGHT_CONTROL_HOST || '192.168.1.7';
const LIGHT_TCP_PORT = Number.parseInt(process.env.LIGHT_CONTROL_PORT || '8888', 10);
const TIMEOUT_MS = Number.parseInt(process.env.CONNECTIVITY_TIMEOUT_MS || '3000', 10);

function log(message) {
  console.log(`[check] ${message}`);
}

function formatError(error) {
  if (!error) return 'unknown_error';
  if (error instanceof Error) return error.message;
  return String(error);
}

async function checkTcp(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (ok, detail) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, detail });
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true, `${host}:${port} connected`));
    socket.once('timeout', () => finish(false, `${host}:${port} timeout after ${timeoutMs}ms`));
    socket.once('error', (error) => finish(false, `${host}:${port} ${formatError(error)}`));
  });
}

async function checkWebSocket(url, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new WebSocket(url);
    let settled = false;
    let timer = null;

    const finish = (ok, detail) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      socket.close();
      resolve({ ok, detail });
    };

    timer = setTimeout(() => finish(false, `${url} timeout after ${timeoutMs}ms`), timeoutMs);
    socket.once('open', () => finish(true, `${url} connected`));
    socket.once('error', (error) => finish(false, `${url} ${formatError(error)}`));
  });
}

async function main() {
  log(`checking sensor websocket: ${SENSOR_WS_URL}`);
  const sensorResult = await checkWebSocket(SENSOR_WS_URL, TIMEOUT_MS);
  log(`sensor websocket ${sensorResult.ok ? 'OK' : 'FAIL'}: ${sensorResult.detail}`);

  log(`checking light tcp: ${LIGHT_TCP_HOST}:${LIGHT_TCP_PORT}`);
  const lightResult = await checkTcp(LIGHT_TCP_HOST, LIGHT_TCP_PORT, TIMEOUT_MS);
  log(`light tcp ${lightResult.ok ? 'OK' : 'FAIL'}: ${lightResult.detail}`);

  process.exitCode = sensorResult.ok && lightResult.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(`[check] unexpected failure: ${formatError(error)}`);
  process.exitCode = 1;
});
