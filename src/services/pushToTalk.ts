export type AudioLevelCallback = (level: number) => void;

export interface PushToTalkController {
  stop: () => Promise<string>;
  cancel: () => void;
}

function getWsUrl(): string {
  const envUrl = import.meta.env.VITE_ASR_WS_URL;
  if (envUrl) return envUrl;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws/asr`;
}

function getHttpTranscribeUrl(): string {
  const httpUrl = import.meta.env.VITE_ASR_HTTP_URL;
  if (httpUrl) return httpUrl;
  return `${location.origin}/api/transcribe`;
}

function encodeFloat32ToBase64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(parts.join(''));
}

function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

function encodeToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(parts.join(''));
}

async function httpTranscribe(pcmChunks: Int16Array[], language: string, log: (...args: any[]) => void): Promise<string> {
  const totalSamples = pcmChunks.reduce((sum, c) => sum + c.length, 0);
  if (totalSamples === 0) return '';

  const merged = new Int16Array(totalSamples);
  let offset = 0;
  for (const chunk of pcmChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  const b64 = encodeToBase64(new Uint8Array(merged.buffer));
  const url = getHttpTranscribeUrl();
  log(`[HTTP fallback] posting ${b64.length} base64 chars to ${url}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio: b64, language }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${errBody}`);
  }
  const data = await res.json();
  log(`[HTTP fallback] result: "${(data.text || '').slice(-40)}"`);
  return data.text || '';
}

/**
 * Streams audio to ASR proxy via WebSocket while recording.
 * On stop(), sends commit + finish and waits for the final transcript.
 * Falls back to HTTP POST if WebSocket fails or times out.
 */
export async function startRecording(language: 'zh' | 'en' = 'zh', onAudioLevel?: AudioLevelCallback): Promise<PushToTalkController> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  const ws = new WebSocket(getWsUrl());
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(2048, 1, 1);

  let stopped = false;
  let sessionReady = false;
  const pendingAudio: string[] = [];
  const pcmChunks: Int16Array[] = [];
  let accumulated = '';
  let resolveStop: ((text: string) => void) | null = null;
  let wsFailed = false;

  const t0 = Date.now();
  const log = (...args: any[]) => console.log(`[PTT +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...args);

  ws.onopen = () => {
    log('ws open, sending session.update');
    ws.send(JSON.stringify({
      type: 'session.update',
      session: {
        modalities: ['text'],
        input_audio_format: 'pcm',
        sample_rate: 16000,
        input_audio_transcription: { language },
        turn_detection: null,
      },
    }));
  };

  ws.onmessage = (evt) => {
    let msg: any;
    try { msg = JSON.parse(evt.data); } catch { return; }

    if (msg.type === 'session.updated') {
      log('session ready, pending audio chunks:', pendingAudio.length);
      sessionReady = true;
      for (const b64 of pendingAudio) {
        ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: b64 }));
      }
      pendingAudio.length = 0;
      if (stopped) {
        log('session ready after stop, but already using HTTP fallback');
      }
    }

    if (msg.type === 'conversation.item.input_audio_transcription.completed') {
      const t = (msg.transcript || '').trim();
      if (t) accumulated += t;
      log('completed:', accumulated.slice(-40));
    }

    if (msg.type === 'session.finished' && resolveStop) {
      log('session.finished, resolving with', accumulated.length, 'chars');
      resolveStop(accumulated);
    }

    if (msg.type === 'error') {
      log('DashScope error:', msg.error);
    }
  };

  ws.onerror = (e) => { log('ws error', e); wsFailed = true; };
  ws.onclose = (e) => {
    log('ws closed, code:', e.code, 'reason:', e.reason);
    if (resolveStop && accumulated) {
      log('ws closed with partial result, resolving with', accumulated.length, 'chars');
      resolveStop(accumulated);
    }
  };

  processor.onaudioprocess = (e) => {
    if (stopped) return;
    const channelData = e.inputBuffer.getChannelData(0);
    const b64 = encodeFloat32ToBase64(channelData);
    pcmChunks.push(float32ToInt16(channelData));
    if (sessionReady && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: b64 }));
    } else {
      pendingAudio.push(b64);
    }
    if (onAudioLevel) {
      let sum = 0;
      for (let i = 0; i < channelData.length; i++) {
        sum += channelData[i] * channelData[i];
      }
      onAudioLevel(Math.sqrt(sum / channelData.length));
    }
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  const cleanup = () => {
    stopped = true;
    processor.disconnect();
    audioContext.close().catch(() => {});
    stream.getTracks().forEach((t) => t.stop());
  };

  return {
    stop: () => {
      cleanup();
      log('stop() called, wsState:', ws.readyState, 'sessionReady:', sessionReady, 'pending:', pendingAudio.length, 'wsFailed:', wsFailed);

      return new Promise<string>((resolve) => {
        let settled = false;
        const settle = (text: string, via: string) => {
          if (settled) return;
          settled = true;
          resolveStop = null;
          log(`resolved via ${via}: "${text.slice(-40)}" (${text.length} chars)`);
          if (ws.readyState <= WebSocket.OPEN) ws.close();
          resolve(text);
        };

        resolveStop = (text: string) => settle(text, 'WS');

        const fireHttp = () => {
          if (settled) return;
          log('firing HTTP');
          httpTranscribe(pcmChunks, language, log)
            .then((text) => settle(text, 'HTTP'))
            .catch((e) => {
              log('HTTP failed:', e.message);
              if (!settled) settle(accumulated, 'HTTP-error');
            });
        };

        if (sessionReady && ws.readyState === WebSocket.OPEN) {
          for (const b64 of pendingAudio) {
            ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: b64 }));
          }
          pendingAudio.length = 0;
          ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
          ws.send(JSON.stringify({ type: 'session.finish' }));
          log('WS commit+finish sent, HTTP fires in 500ms if no WS response');
          setTimeout(fireHttp, 500);
        } else {
          log('WS not ready, firing HTTP immediately');
          fireHttp();
        }
      });
    },
    cancel: () => {
      cleanup();
      if (ws.readyState <= WebSocket.OPEN) ws.close();
    },
  };
}
