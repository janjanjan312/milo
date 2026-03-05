type TranscriptCallback = (text: string, isFinal: boolean) => void;
type StatusCallback = (status: 'connecting' | 'connected' | 'error' | 'closed') => void;

interface RealtimeSession {
  stop: () => Promise<string>;
  flush: () => Promise<string>;
}

// TODO: re-enable after testing WebSocket ASR
const BrowserSpeechRecognition: any = false
  ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  : null;

export async function startRealtimeASR(
  onTranscript: TranscriptCallback,
  onStatus: StatusCallback,
  language: 'zh' | 'en' = 'zh',
): Promise<RealtimeSession> {
  if (BrowserSpeechRecognition) {
    try {
      return await startBrowserASR(onTranscript, onStatus, language);
    } catch (e) {
      console.warn('[ASR] Browser SpeechRecognition failed, falling back to WebSocket ASR:', e);
    }
  }
  return startWebSocketASR(onTranscript, onStatus, language);
}

// ---------------------------------------------------------------------------
// Browser Web Speech API (original approach, works in Chrome / Edge / Android)
// ---------------------------------------------------------------------------
function startBrowserASR(
  onTranscript: TranscriptCallback,
  onStatus: StatusCallback,
  language: 'zh' | 'en' = 'zh',
): Promise<RealtimeSession> {
  return new Promise<RealtimeSession>((resolve, reject) => {
    onStatus('connecting');

    const recognition = new BrowserSpeechRecognition();
    recognition.lang = language === 'zh' ? 'zh-CN' : 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let stopped = false;
    let finalTranscript = '';
    let settled = false;

    recognition.onstart = () => {
      if (!settled) {
        settled = true;
        onStatus('connected');
        resolve({
          stop: async () => {
            if (stopped) return finalTranscript;
            stopped = true;
            recognition.stop();
            onStatus('closed');
            return finalTranscript;
          },
          flush: async () => {
            const text = finalTranscript;
            finalTranscript = '';
            return text;
          },
        });
      }
    };

    recognition.onresult = (event: any) => {
      if (stopped) return;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text) {
            finalTranscript += text;
            onTranscript(finalTranscript, true);
          }
        } else {
          interim += result[0].transcript;
        }
      }
      if (interim) {
        onTranscript(interim, false);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      if (!settled) {
        settled = true;
        reject(new Error(`SpeechRecognition error: ${event.error}`));
        return;
      }
      if (!stopped) onStatus('error');
    };

    recognition.onend = () => {
      if (!settled) {
        settled = true;
        reject(new Error('SpeechRecognition ended before starting'));
        return;
      }
      if (!stopped) {
        try {
          recognition.start();
        } catch {
          onStatus('closed');
        }
      }
    };

    try {
      recognition.start();
    } catch (e) {
      if (!settled) {
        settled = true;
        reject(e);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// WebSocket ASR: browser → Vite proxy (/ws/asr) → DashScope realtime API
// Real-time streaming with full context. Works in all browsers & PWA.
// ---------------------------------------------------------------------------
function getWsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws/asr`;
}

function startWebSocketASR(
  onTranscript: TranscriptCallback,
  onStatus: StatusCallback,
  language: 'zh' | 'en' = 'zh',
): Promise<RealtimeSession> {
  onStatus('connecting');

  // Launch mic request and WebSocket connection in parallel
  const ws = new WebSocket(getWsUrl());
  const micPromise = navigator.mediaDevices.getUserMedia({ audio: true });

  let stopped = false;
  let audioContext: AudioContext | null = null;
  let processor: ScriptProcessorNode | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let lastSpeechDetected = 0;
  let currentDisplayText = '';
  let stream: MediaStream | null = null;

  const cleanup = () => {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (processor) { processor.disconnect(); processor = null; }
    if (audioContext) { audioContext.close().catch(() => {}); audioContext = null; }
    stream?.getTracks().forEach((t) => t.stop());
  };

  let accumulated = '';
  let finalizeResolve: ((text: string) => void) | null = null;
  let micReady = false;
  let sessionReady = false;

  return new Promise<RealtimeSession>((resolve, reject) => {
    let settled = false;

    micPromise.then((s) => {
      stream = s;
      micReady = true;
      // Show "listening" immediately and start buffering audio
      if (!settled) {
        onStatus('connected');
        startAudioCapture();
      }
      tryStart();
    }).catch((e) => {
      if (!settled) {
        settled = true;
        if (ws.readyState <= WebSocket.OPEN) ws.close();
        onStatus('error');
        reject(e);
      }
    });

    ws.onopen = () => {
      ws.send(JSON.stringify({
        event_id: 'evt_session',
        type: 'session.update',
        session: {
          modalities: ['text'],
          input_audio_format: 'pcm',
          sample_rate: 16000,
          input_audio_transcription: { language },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.2,
            silence_duration_ms: 1000,
          },
        },
      }));
    };

    ws.onmessage = (evt) => {
      let msg: any;
      try { msg = JSON.parse(evt.data); } catch { return; }

      if (msg.type === 'session.updated') {
        sessionReady = true;
        tryStart();
      }

      if (msg.type === 'conversation.item.input_audio_transcription.text') {
        if (stopped) return;
        const confirmed = msg.text || '';
        const pending = msg.stash || '';
        const segmentText = (confirmed + pending).trim();
        const full = (accumulated + segmentText).trim();
        if (full) {
          currentDisplayText = full;
          onTranscript(full, false);
        }
      }

      if (msg.type === 'conversation.item.input_audio_transcription.completed') {
        const text = (msg.transcript || '').trim();
        if (text) accumulated += text;
        if (finalizeResolve) {
          const res = finalizeResolve;
          finalizeResolve = null;
          const result = accumulated;
          if (stopped) {
            // Full stop: close connection
            onTranscript(result, false);
            res(result);
            if (ws.readyState === WebSocket.OPEN) ws.close();
            onStatus('closed');
          } else {
            // Flush: reset and keep going
            accumulated = '';
            currentDisplayText = '';
            res(result);
          }
        } else {
          onTranscript(accumulated, false);
        }
      }

      if (msg.type === 'error') {
        console.error('[WS ASR] server error:', msg);
      }
    };

    ws.onerror = () => {
      if (!settled) {
        settled = true;
        stream?.getTracks().forEach((t) => t.stop());
        reject(new Error('WebSocket connection failed'));
      }
    };

    ws.onclose = () => {
      if (!settled) {
        settled = true;
        stream?.getTracks().forEach((t) => t.stop());
        reject(new Error('WebSocket closed before session started'));
        return;
      }
      if (!stopped) {
        cleanup();
        onStatus('closed');
      }
    };

    function tryStart() {
      if (!micReady || !sessionReady || settled) return;
      settled = true;
      // Flush any audio captured while WebSocket wasn't ready
      flushBufferedAudio();
      resolve({
        stop: () => {
          if (stopped) return Promise.resolve(accumulated);
          stopped = true;
          cleanup();

          if (ws.readyState !== WebSocket.OPEN) {
            onStatus('closed');
            return Promise.resolve(accumulated);
          }

          return new Promise<string>((res) => {
            finalizeResolve = res;
            ws.send(JSON.stringify({
              event_id: 'evt_commit',
              type: 'input_audio_buffer.commit',
            }));
            setTimeout(() => {
              if (finalizeResolve) {
                finalizeResolve = null;
                res(accumulated);
                if (ws.readyState === WebSocket.OPEN) ws.close();
                onStatus('closed');
              }
            }, 3000);
          });
        },
        flush: () => {
          if (stopped || ws.readyState !== WebSocket.OPEN) {
            const text = accumulated;
            accumulated = '';
            currentDisplayText = '';
            return Promise.resolve(text);
          }

          return new Promise<string>((res) => {
            finalizeResolve = res;
            ws.send(JSON.stringify({
              event_id: 'evt_flush',
              type: 'input_audio_buffer.commit',
            }));
            setTimeout(() => {
              if (finalizeResolve) {
                finalizeResolve = null;
                const text = accumulated;
                accumulated = '';
                currentDisplayText = '';
                res(text);
              }
            }, 2000);
          });
        },
      });
    }

    // Buffer audio while WebSocket isn't ready yet
    const audioBuffer: string[] = [];

    function flushBufferedAudio() {
      for (const b64 of audioBuffer) {
        ws.send(JSON.stringify({
          event_id: `evt_a_${Date.now()}`,
          type: 'input_audio_buffer.append',
          audio: b64,
        }));
      }
      audioBuffer.length = 0;
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

    function startAudioCapture() {
      audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream!);
      processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (stopped) return;
        const float32 = e.inputBuffer.getChannelData(0);

        let sum = 0;
        for (let i = 0; i < float32.length; i++) sum += float32[i] * float32[i];
        if (Math.sqrt(sum / float32.length) > 0.008) {
          lastSpeechDetected = Date.now();
        }

        const b64 = encodeFloat32ToBase64(float32);

        if (sessionReady && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            event_id: `evt_a_${Date.now()}`,
            type: 'input_audio_buffer.append',
            audio: b64,
          }));
        } else {
          audioBuffer.push(b64);
        }
      };

      heartbeatTimer = setInterval(() => {
        if (stopped) return;
        if (Date.now() - lastSpeechDetected < 800 && currentDisplayText) {
          onTranscript(currentDisplayText, false);
        }
      }, 500);

      source.connect(processor);
      processor.connect(audioContext.destination);
    }
  });
}
