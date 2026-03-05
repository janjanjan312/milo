import base64
import io
import json
import os
import threading
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from pydub import AudioSegment
import websocket

env_path = Path(__file__).resolve().parent.parent / ".env.local"
load_dotenv(env_path)

app = Flask(__name__)
CORS(app)

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "")
WS_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime"


def webm_to_pcm(webm_bytes: bytes) -> bytes:
    audio = AudioSegment.from_file(io.BytesIO(webm_bytes), format="webm")
    audio = audio.set_frame_rate(16000).set_channels(1).set_sample_width(2)
    return audio.raw_data


def transcribe_pcm(pcm_data: bytes, language: str = "zh") -> str:
    texts = []
    error_holder = [None]
    done_event = threading.Event()

    def on_open(ws):
        def send_all():
            ws.send(json.dumps({
                "type": "session.update",
                "session": {
                    "modalities": ["text"],
                    "input_audio_format": "pcm",
                    "sample_rate": 16000,
                    "input_audio_transcription": {"language": language},
                    "turn_detection": None,
                },
            }))

            b64 = base64.b64encode(pcm_data).decode()
            ws.send(json.dumps({
                "type": "input_audio_buffer.append",
                "audio": b64,
            }))

            ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
            ws.send(json.dumps({"type": "session.finish"}))

        threading.Thread(target=send_all, daemon=True).start()

    def on_message(_ws, message):
        data = json.loads(message)
        msg_type = data.get("type", "")
        if msg_type == "conversation.item.input_audio_transcription.completed":
            t = data.get("transcript", "")
            if t:
                texts.append(t)

    def on_error(_ws, error):
        error_holder[0] = str(error)
        done_event.set()

    def on_close(_ws, _code, _msg):
        done_event.set()

    ws = websocket.WebSocketApp(
        WS_URL,
        header={
            "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
            "OpenAI-Beta": "realtime=v1",
        },
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close,
    )

    wst = threading.Thread(target=ws.run_forever, daemon=True)
    wst.start()
    done_event.wait(timeout=10)

    if error_holder[0]:
        raise RuntimeError(f"WebSocket error: {error_holder[0]}")

    result = "".join(texts)
    print(f"[ASR] result: '{result}'", flush=True)
    return result


@app.post("/v1/audio/transcriptions")
def transcribe():
    audio = request.files.get("file")
    if not audio:
        return jsonify({"error": "no file"}), 400

    try:
        webm_bytes = audio.read()
        pcm_data = webm_to_pcm(webm_bytes)
        text = transcribe_pcm(pcm_data)
        return jsonify({"text": text})
    except Exception as e:
        print(f"[ASR] error: {e}", flush=True)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    print(f"ASR server on http://localhost:5001", flush=True)
    print(f"API key: {'loaded' if DASHSCOPE_API_KEY else 'MISSING'}", flush=True)
    app.run(port=5001, debug=False)
