export interface PushToTalkController {
  stop: () => Promise<string>;
  cancel: () => void;
}

export async function startRecording(language: 'zh' | 'en' = 'zh'): Promise<PushToTalkController> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(2048, 1, 1);

  const chunks: Int16Array[] = [];
  let stopped = false;

  processor.onaudioprocess = (e) => {
    if (stopped) return;
    const float32 = e.inputBuffer.getChannelData(0);
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    chunks.push(int16);
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

      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      if (totalLength < 4000) return '';

      const pcm = new Int16Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        pcm.set(chunk, offset);
        offset += chunk.length;
      }

      const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
      const batchSize = 0x8000;
      const parts: string[] = [];
      for (let i = 0; i < bytes.length; i += batchSize) {
        parts.push(String.fromCharCode(...bytes.subarray(i, i + batchSize)));
      }
      const base64 = btoa(parts.join(''));

      const asrBaseUrl = import.meta.env.VITE_ASR_WS_URL?.replace(/^wss?:\/\//, 'https://') || '';
      const transcribeUrl = asrBaseUrl ? `${asrBaseUrl}/transcribe` : '/api/transcribe';

      const response = await fetch(transcribeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64, language }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Transcription failed');
      }

      const data = await response.json();
      return data.text || '';
    },
    cancel: () => {
      cleanup();
    },
  };
}
