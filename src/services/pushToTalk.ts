export type AudioLevelCallback = (level: number) => void;

export interface PushToTalkController {
  stop: () => Promise<string>;
  cancel: () => void;
}

function getHttpTranscribeUrl(): string {
  const wsUrl = import.meta.env.VITE_ASR_WS_URL;
  if (wsUrl) {
    return wsUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:') + '/transcribe';
  }
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

/**
 * Records audio locally and transcribes via HTTP POST on stop().
 * Audio is buffered in memory during recording, then sent to the
 * server-side ASR endpoint which connects to DashScope internally.
 */
export async function startRecording(language: 'zh' | 'en' = 'zh', onAudioLevel?: AudioLevelCallback): Promise<PushToTalkController> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  const audioContext = new AudioContext({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(2048, 1, 1);

  let stopped = false;
  const allAudio: string[] = [];

  const t0 = Date.now();
  const log = (...args: any[]) => console.log(`[PTT +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...args);

  processor.onaudioprocess = (e) => {
    if (stopped) return;
    const channelData = e.inputBuffer.getChannelData(0);
    allAudio.push(encodeFloat32ToBase64(channelData));
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
    stop: async () => {
      cleanup();
      const combined = allAudio.join('');
      log('stop() called, audio chunks:', allAudio.length, 'total base64 chars:', combined.length);

      if (!combined) {
        log('no audio captured');
        return '';
      }

      const url = getHttpTranscribeUrl();
      log('posting to', url);

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: combined, language }),
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${errBody}`);
        }
        const data = await res.json();
        log('result:', `"${(data.text || '').slice(-40)}"`, `(${((Date.now() - t0) / 1000).toFixed(1)}s total)`);
        return data.text || '';
      } catch (e: any) {
        log('transcribe failed:', e.message);
        return '';
      }
    },
    cancel: () => {
      cleanup();
    },
  };
}
