/** Message protocol shared between the recognizer (main thread) and worker. */

export interface InitMsg {
  type: 'init';
  model: string;
  /** transformers.js dtype, e.g. 'q4' | 'q8' | 'fp16' | 'fp32'. */
  dtype: string;
}

export interface TranscribeMsg {
  type: 'transcribe';
  id: number;
  /** Mono 16 kHz PCM samples, transferred (not copied). */
  audio: Float32Array;
  /** Whisper language hint, or null to auto-detect. */
  language: string | null;
  /** Emit `partial` messages as tokens decode (used for the final pass). */
  stream: boolean;
}

export type ToWorker = InitMsg | TranscribeMsg;

export interface ProgressMsg {
  type: 'progress';
  loaded: number;
  total: number;
  /** 0..1 across all model files being fetched. */
  pct: number;
}
export interface ReadyMsg {
  type: 'ready';
}
export interface ErrorMsg {
  type: 'error';
  message: string;
}
export interface ResultMsg {
  type: 'result';
  id: number;
  text: string;
}
/** Running transcript while tokens decode, for live progress feedback. */
export interface PartialMsg {
  type: 'partial';
  id: number;
  text: string;
}

export type FromWorker = ProgressMsg | ReadyMsg | ErrorMsg | ResultMsg | PartialMsg;
