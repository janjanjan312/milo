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

/**
 * Streams audio to DashScope via WebSocket while recording.
 * On stop(), sends commit + finish and waits for the final transcript.
 * Most processing happens during recording, so stop() returns almost instantly.
 */
export async function startRecording(language: 'zh' | 'en' = 'zh'): Promise<PushToTalkController> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  const ws = new WebSocket(getWsUrl());
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(2048, 1, 1);

  let stopped = false;
  let sessionReady = false;
  const pendingAudio: string[] = [];
  let accumulated = '';
  let resolveStop: ((text: string) => void) | null = null;

  ws.onopen = () => {
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
      sessionReady = true;
      for (const b64 of pendingAudio) {
        ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: b64 }));
      }
      pendingAudio.length = 0;
      if (stopped && resolveStop) {
        ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
        ws.send(JSON.stringify({ type: 'session.finish' }));
      }
    }

    if (msg.type === 'conversation.item.input_audio_transcription.completed') {
      const t = (msg.transcript || '').trim();
      if (t) accumulated += t;
    }

    if (msg.type === 'session.finished' && resolveStop) {
      const resolve = resolveStop;
      resolveStop = null;
      ws.close();
      resolve(accumulated);
    }
  };

  ws.onerror = () => {};
  ws.onclose = () => {
    if (resolveStop) {
      const resolve = resolveStop;
      resolveStop = null;
      resolve(accumulated);
    }
  };

  processor.onaudioprocess = (e) => {
    if (stopped) return;
    const b64 = encodeFloat32ToBase64(e.inputBuffer.getChannelData(0));
    if (sessionReady && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: b64 }));
    } else {
      pendingAudio.push(b64);
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

      if (ws.readyState >= WebSocket.CLOSING) {
        return Promise.resolve(accumulated);
      }

      return new Promise<string>((resolve) => {
        resolveStop = resolve;

        if (sessionReady && ws.readyState === WebSocket.OPEN) {
          for (const b64 of pendingAudio) {
            ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: b64 }));
          }
          pendingAudio.length = 0;
          ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
          ws.send(JSON.stringify({ type: 'session.finish' }));
        }
        // else: ws still CONNECTING or session not ready yet —
        // session.updated handler will flush pending audio + send commit+finish

        setTimeout(() => {
          if (resolveStop) {
            resolveStop = null;
            if (ws.readyState <= WebSocket.OPEN) ws.close();
            resolve(accumulated);
          }
        }, 8000);
      });
    },
    cancel: () => {
      cleanup();
      if (ws.readyState <= WebSocket.OPEN) ws.close();
    },
  };
}
