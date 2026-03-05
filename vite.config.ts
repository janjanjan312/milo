import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import type {Plugin} from 'vite';

const ASR_MODEL = 'qwen3-asr-flash-realtime-2026-02-10';
const ASR_WS_URL = `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=${ASR_MODEL}`;

function asrProxyPlugin(apiKey: string): Plugin {
  return {
    name: 'asr-ws-proxy',
    configureServer(server) {
      server.httpServer?.on('upgrade', async (req, socket, head) => {
        if (req.url !== '/ws/asr') return;

        const {default: WebSocket, WebSocketServer} = await import('ws');
        const wss = new WebSocketServer({noServer: true});

        wss.handleUpgrade(req, socket, head, (browserWs) => {
          console.log('[ASR proxy] browser connected');

          const pendingMessages: Array<{data: any; binary: boolean}> = [];
          let upstreamReady = false;

          const dashscopeWs = new WebSocket(ASR_WS_URL, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'OpenAI-Beta': 'realtime=v1',
            },
          });

          dashscopeWs.on('open', () => {
            console.log('[ASR proxy] DashScope connected, flushing', pendingMessages.length, 'buffered messages');
            upstreamReady = true;
            for (const msg of pendingMessages) {
              dashscopeWs.send(msg.data, {binary: msg.binary});
            }
            pendingMessages.length = 0;
          });

          // Browser → DashScope (buffer until upstream is ready, preserve frame type)
          browserWs.on('message', (data: any, isBinary: boolean) => {
            if (upstreamReady && dashscopeWs.readyState === WebSocket.OPEN) {
              dashscopeWs.send(data, {binary: isBinary});
            } else {
              pendingMessages.push({data, binary: isBinary});
            }
          });

          // DashScope → Browser (preserve frame type)
          const sessionStart = Date.now();
          dashscopeWs.on('message', (data: any, isBinary: boolean) => {
            if (!isBinary) {
              try {
                const msg = JSON.parse(data.toString());
                const elapsed = ((Date.now() - sessionStart) / 1000).toFixed(1);
                if (msg.type === 'conversation.item.input_audio_transcription.text') {
                  const txt = (msg.text || '') + (msg.stash || '');
                  console.log(`[ASR +${elapsed}s] text: "${txt.slice(-30)}"`);
                } else if (msg.type === 'conversation.item.input_audio_transcription.completed') {
                  console.log(`[ASR +${elapsed}s] completed: "${(msg.transcript || '').slice(-40)}"`);
                } else {
                  console.log(`[ASR +${elapsed}s] ${msg.type}`);
                }
              } catch {}
            }
            if (browserWs.readyState === WebSocket.OPEN) {
              browserWs.send(data, {binary: isBinary});
            }
          });

          dashscopeWs.on('error', (err) => {
            console.error('[ASR proxy] DashScope error:', err.message);
            if (browserWs.readyState === WebSocket.OPEN) {
              browserWs.close(1011, 'Upstream error');
            }
          });

          dashscopeWs.on('close', (code, reason) => {
            console.log('[ASR proxy] DashScope closed:', code, reason?.toString());
            if (browserWs.readyState === WebSocket.OPEN) {
              browserWs.close(code, reason?.toString());
            }
          });

          browserWs.on('close', () => {
            console.log('[ASR proxy] browser disconnected');
            if (dashscopeWs.readyState === WebSocket.OPEN) {
              dashscopeWs.close();
            }
          });

          browserWs.on('error', (err) => {
            console.error('[ASR proxy] browser error:', err.message);
            if (dashscopeWs.readyState === WebSocket.OPEN) {
              dashscopeWs.close();
            }
          });
        });
      });
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const dashscopeKey =
    env.DASHSCOPE_API_KEY ??
    env.VITE_DASHSCOPE_API_KEY ??
    process.env.DASHSCOPE_API_KEY ??
    process.env.VITE_DASHSCOPE_API_KEY ??
    '';
  const arkKey =
    env.ARK_API_KEY ??
    env.VITE_ARK_API_KEY ??
    process.env.ARK_API_KEY ??
    process.env.VITE_ARK_API_KEY ??
    '';
  return {
    plugins: [react(), tailwindcss(), asrProxyPlugin(dashscopeKey)],
    define: {
      'import.meta.env.VITE_DASHSCOPE_API_KEY': JSON.stringify(dashscopeKey),
      'import.meta.env.VITE_ARK_API_KEY': JSON.stringify(arkKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
