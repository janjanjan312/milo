import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';
import type {Plugin} from 'vite';

const ASR_MODEL = 'qwen3-asr-flash-realtime-2026-02-10';
const ASR_WS_URL = `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=${ASR_MODEL}`;

function transcribePCM(pcmBase64: string, apiKey: string, language: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const {default: WebSocket} = await import('ws');
    const texts: string[] = [];
    const audioBytes = pcmBase64.length * 3 / 4;
    const audioDurationSec = audioBytes / 2 / 16000;
    const timeoutMs = Math.max(15000, audioDurationSec * 3000 + 10000);
    console.log(`[transcribe] connecting to DashScope... audio ~${audioDurationSec.toFixed(1)}s, timeout ${(timeoutMs/1000).toFixed(0)}s`);
    const ws = new WebSocket(ASR_WS_URL, {
      headers: {Authorization: `Bearer ${apiKey}`, 'OpenAI-Beta': 'realtime=v1'},
    });
    const timeout = setTimeout(() => { console.log('[transcribe] timeout'); ws.close(); reject(new Error('timeout')); }, timeoutMs);
    ws.on('open', () => {
      console.log('[transcribe] ws open, sending session + audio');
      ws.send(JSON.stringify({
        type: 'session.update',
        session: {modalities: ['text'], input_audio_format: 'pcm', sample_rate: 16000, input_audio_transcription: {language}, turn_detection: null},
      }));
      const chunk = 64000;
      for (let i = 0; i < pcmBase64.length; i += chunk) {
        ws.send(JSON.stringify({type: 'input_audio_buffer.append', audio: pcmBase64.slice(i, i + chunk)}));
      }
      ws.send(JSON.stringify({type: 'input_audio_buffer.commit'}));
      ws.send(JSON.stringify({type: 'session.finish'}));
      console.log('[transcribe] all data sent');
    });
    ws.on('message', (data: any) => {
      const msg = JSON.parse(data.toString());
      console.log('[transcribe] msg:', msg.type, msg.transcript ? `"${msg.transcript.slice(-30)}"` : '');
      if (msg.type === 'conversation.item.input_audio_transcription.completed') {
        const t = msg.transcript || '';
        if (t) texts.push(t);
      }
      if (msg.type === 'session.finished') {
        console.log('[transcribe] session finished, closing');
        clearTimeout(timeout);
        ws.close();
        resolve(texts.join(''));
      }
      if (msg.type === 'error') {
        console.error('[transcribe] DashScope error:', JSON.stringify(msg.error));
        clearTimeout(timeout);
        ws.close();
        reject(new Error(msg.error?.message || 'DashScope error'));
      }
    });
    ws.on('close', (code: number) => { console.log('[transcribe] ws closed, code:', code); clearTimeout(timeout); resolve(texts.join('')); });
    ws.on('error', (err: Error) => { console.error('[transcribe] ws error:', err.message); clearTimeout(timeout); reject(err); });
  });
}

function asrProxyPlugin(apiKey: string): Plugin {
  return {
    name: 'asr-ws-proxy',
    configureServer(server) {
      server.middlewares.use('/api/transcribe', (req: any, res: any) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type'});
          res.end();
          return;
        }
        let body = '';
        req.on('data', (c: string) => { body += c; });
        req.on('end', async () => {
          try {
            const {audio, language = 'zh'} = JSON.parse(body);
            console.log('[transcribe] received audio, length:', audio?.length);
            const text = await transcribePCM(audio, apiKey, language);
            console.log('[transcribe] result:', text);
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({text}));
          } catch (e: any) {
            console.error('[transcribe] error:', e.message);
            res.writeHead(500, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({error: e.message}));
          }
        });
      });
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
    plugins: [
      react(),
      tailwindcss(),
      asrProxyPlugin(dashscopeKey),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['apple-touch-icon.png'],
        manifest: {
          name: '麦粒',
          short_name: '麦粒',
          description: 'AI 智能饮食记录与分析助手',
          theme_color: '#FFFFFF',
          background_color: '#FAFAF9',
          display: 'standalone',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\/.*/i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /^https:\/\/dashscope\.aliyuncs\.com\/.*/i,
              handler: 'NetworkOnly',
            },
          ],
        },
      }),
    ],
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
