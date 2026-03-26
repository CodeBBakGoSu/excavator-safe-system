import type { IncomingMessage, ServerResponse } from 'node:http';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function bridgeProxyPlugin() {
  return {
    configureServer(server: {
      middlewares: {
        use: (handler: (request: IncomingMessage, response: ServerResponse, next: () => void) => void) => void;
      };
    }) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = request.url ? new URL(request.url, 'http://localhost:5173') : null;
        if (!requestUrl) {
          next();
          return;
        }

        if (requestUrl.pathname !== '/__bridge_proxy__') {
          next();
          return;
        }

        try {
          const target = requestUrl.searchParams.get('target');
          const path = requestUrl.searchParams.get('path') || '/';
          if (!target) {
            response.statusCode = 400;
            response.end('missing target');
            return;
          }

          const targetUrl = new URL(path, `${target.replace(/\/$/, '')}/`);
          const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await readRequestBody(request);
          const upstream = await fetch(targetUrl, {
            method: request.method,
            headers: {
              'Content-Type': request.headers['content-type'] || 'application/json',
            },
            body,
          });

          response.statusCode = upstream.status;
          upstream.headers.forEach((value, key) => {
            if (key.toLowerCase() === 'content-encoding' || key.toLowerCase() === 'content-length') return;
            response.setHeader(key, value);
          });
          response.setHeader('Access-Control-Allow-Origin', '*');

          const buffer = Buffer.from(await upstream.arrayBuffer());
          response.end(buffer);
        } catch (error) {
          response.statusCode = 502;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'bridge_proxy_failed',
            })
          );
        }
      });
    },
    name: 'bridge-proxy',
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), bridgeProxyPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      ignored: ['**/runtime-hls/**', '**/runtime-logs/**', '**/runtime-rtsp/**'],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/testSetup.ts',
  },
});
