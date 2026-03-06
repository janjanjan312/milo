/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_DASHSCOPE_API_KEY: string;
  readonly VITE_ARK_API_KEY: string;
  readonly VITE_TEXT_PROVIDER: string;
  readonly VITE_VISION_PROVIDER: string;
  readonly VITE_QWEN_TEXT_MODEL: string;
  readonly VITE_ASR_WS_URL?: string;
  readonly VITE_ASR_HTTP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
