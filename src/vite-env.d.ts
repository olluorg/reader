/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OLLU_SERVER?: string;
  readonly VITE_OLLU_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
