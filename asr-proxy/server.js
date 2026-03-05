import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = process.env.PORT || 8080;
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || '';
const ASR_MODEL = process.env.ASR_MODEL || 'qwen3-asr-flash-realtime';
const ASR_WS_URL = `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=${ASR_MODEL}`;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isOriginAllowed(origin) {
  if (ALLOWED_ORIGINS.length === 0) return true;
  return ALLOWED_ORIGINS.some(
    (ao) => origin === ao || origin.endsWith(ao.replace(/^\*/, '')),
  );
}

function transcribePCM(pcmBase64, language = 'zh') {
  return new Promise((resolve, reject) => {
    const texts = [];
    const audioBytes = pcmBase64.length * 3 / 4;
    const audioDurationSec = audioBytes / 2 / 16000;
    const timeoutMs = Math.max(15000, audioDurationSec * 3000 + 10000);
    const ws = new WebSocket(ASR_WS_URL, {
      headers: { Authorization: `Bearer ${DASHSCOPE_API_KEY}`, 'OpenAI-Beta': 'realtime=v1' },
    });
    const timeout = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, timeoutMs);
    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'session.update',
        session: { modalities: ['text'], input_audio_format: 'pcm', sample_rate: 16000, input_audio_transcription: { language }, turn_detection: null },
      }));
      const chunk = 64000;
      for (let i = 0; i < pcmBase64.length; i += chunk) {
        ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: pcmBase64.slice(i, i + chunk) }));
      }
      ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      ws.send(JSON.stringify({ type: 'session.finish' }));
    });
    let resolved = false;
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'conversation.item.input_audio_transcription.completed') {
        const t = msg.transcript || '';
        if (t) texts.push(t);
      }
      if (msg.type === 'session.finished' && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        ws.close();
        resolve(texts.join(''));
      }
      if (msg.type === 'error' && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        ws.close();
        reject(new Error(msg.error?.message || 'DashScope error'));
      }
    });
    ws.on('close', () => { if (!resolved) { resolved = true; clearTimeout(timeout); resolve(texts.join('')); } });
    ws.on('error', (err) => { if (!resolved) { resolved = true; clearTimeout(timeout); reject(err); } });
  });
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', isOriginAllowed(origin) ? origin : '');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && req.url === '/transcribe') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      try {
        const { audio, language = 'zh' } = JSON.parse(body);
        if (!audio) { res.writeHead(400); res.end(JSON.stringify({ error: 'no audio' })); return; }
        const text = await transcribePCM(audio, language);
        console.log(`[transcribe] result: "${text.slice(-40)}"`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text }));
      } catch (e) {
        console.error('[transcribe] error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ASR proxy is running');
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin || '';
  if (!isOriginAllowed(origin)) {
    console.log(`[proxy] rejected origin: ${origin}`);
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (browserWs) => {
    console.log(`[proxy] browser connected from ${origin}`);

    const pendingMessages = [];
    let upstreamReady = false;

    const dashscopeWs = new WebSocket(ASR_WS_URL, {
      headers: {
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });

    dashscopeWs.on('open', () => {
      console.log('[proxy] DashScope connected, flushing', pendingMessages.length, 'buffered msgs');
      upstreamReady = true;
      for (const msg of pendingMessages) {
        dashscopeWs.send(msg.data, { binary: msg.binary });
      }
      pendingMessages.length = 0;
    });

    browserWs.on('message', (data, isBinary) => {
      if (upstreamReady && dashscopeWs.readyState === WebSocket.OPEN) {
        dashscopeWs.send(data, { binary: isBinary });
      } else {
        pendingMessages.push({ data, binary: isBinary });
      }
    });

    const sessionStart = Date.now();
    dashscopeWs.on('message', (data, isBinary) => {
      if (!isBinary) {
        try {
          const msg = JSON.parse(data.toString());
          const elapsed = ((Date.now() - sessionStart) / 1000).toFixed(1);
          if (msg.type === 'conversation.item.input_audio_transcription.completed') {
            console.log(`[proxy +${elapsed}s] completed: "${(msg.transcript || '').slice(-40)}"`);
          }
        } catch {}
      }
      if (browserWs.readyState === WebSocket.OPEN) {
        browserWs.send(data, { binary: isBinary });
      }
    });

    dashscopeWs.on('error', (err) => {
      console.error('[proxy] DashScope error:', err.message);
      if (browserWs.readyState === WebSocket.OPEN) browserWs.close(1011, 'Upstream error');
    });

    dashscopeWs.on('close', (code, reason) => {
      console.log('[proxy] DashScope closed:', code, reason?.toString());
      if (browserWs.readyState === WebSocket.OPEN) browserWs.close(code, reason?.toString());
    });

    browserWs.on('close', () => {
      console.log('[proxy] browser disconnected');
      if (dashscopeWs.readyState === WebSocket.OPEN) dashscopeWs.close();
    });

    browserWs.on('error', (err) => {
      console.error('[proxy] browser error:', err.message);
      if (dashscopeWs.readyState === WebSocket.OPEN) dashscopeWs.close();
    });
  });
});

server.listen(PORT, () => {
  console.log(`ASR proxy listening on port ${PORT}`);
  console.log(`API key: ${DASHSCOPE_API_KEY ? 'loaded' : 'MISSING'}`);
  console.log(`Model: ${ASR_MODEL}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS.join(', ') : '(all)'}`);
});
