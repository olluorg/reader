/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OLLU_SERVER?: string;
  readonly VITE_OLLU_GOOGLE_CLIENT_ID?: string;
  readonly VITE_OLLU_SYNC?: string;
  readonly VITE_OLLU_BACKUP?: string;
  readonly VITE_OLLU_APPEARANCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
