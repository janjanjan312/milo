import type { VercelRequest, VercelResponse } from '@vercel/node';
import WebSocket from 'ws';

const ASR_MODEL = 'qwen3-asr-flash-realtime-2026-02-10';
const ASR_WS_URL = `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=${ASR_MODEL}`;

function transcribePCM(pcmBase64: string, apiKey: string, language: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const texts: string[] = [];

    const ws = new WebSocket(ASR_WS_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Transcription timeout'));
    }, 15000);

    ws.on('open', () => {
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

      const chunkSize = 64000;
      for (let i = 0; i < pcmBase64.length; i += chunkSize) {
        ws.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: pcmBase64.slice(i, i + chunkSize),
        }));
      }

      ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      ws.send(JSON.stringify({ type: 'session.finish' }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'conversation.item.input_audio_transcription.completed') {
        const t = msg.transcript || '';
        if (t) texts.push(t);
      }
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      resolve(texts.join(''));
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.VITE_DASHSCOPE_API_KEY || '';
  if (!apiKey) return res.status(500).json({ error: 'Missing API key' });

  const { audio, language = 'zh' } = req.body;
  if (!audio) return res.status(400).json({ error: 'No audio data' });

  try {
    const text = await transcribePCM(audio, apiKey, language);
    return res.status(200).json({ text });
  } catch (e: any) {
    console.error('[transcribe] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
