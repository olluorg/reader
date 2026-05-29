/**
 * Voice worker — runs Whisper (automatic-speech-recognition via transformers.js)
 * off the main thread so transcription never blocks typing. WebGPU-accelerated;
 * the model is downloaded once and cached by the browser (Cache API), never put
 * in the document URL.
 *
 * Protocol: `init` once to load the pipeline (replies `ready` or `error`), then
 * `transcribe` per request (replies `result` with the same id). The recognizer
 * ignores stale ids, so we don't abort in-flight runs — the latest interim
 * window simply supersedes earlier ones.
 */

import {
  pipeline,
  env,
  WhisperTextStreamer,
  type AutomaticSpeechRecognitionPipeline,
} from '@huggingface/transformers';
import type { FromWorker, ToWorker } from './protocol';

// Browser build: only ever load remote models from the HF hub and let the
// browser cache them — no local model directory.
env.allowLocalModels = false;

const ctx = self as unknown as {
  postMessage: (m: FromWorker) => void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;

// Aggregate per-file download progress into one 0..1 figure for the UI.
const files = new Map<string, { loaded: number; total: number }>();
function onProgress(p: { status?: string; file?: string; loaded?: number; total?: number }): void {
  if (p.status !== 'progress' || !p.file) return;
  files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
  let loaded = 0;
  let total = 0;
  for (const f of files.values()) {
    loaded += f.loaded;
    total += f.total;
  }
  if (total > 0) ctx.postMessage({ type: 'progress', loaded, total, pct: loaded / total });
}

async function init(model: string, dtype: string): Promise<void> {
  transcriber = (await pipeline('automatic-speech-recognition', model, {
    device: 'webgpu',
    dtype: dtype as never,
    progress_callback: onProgress as never,
  })) as AutomaticSpeechRecognitionPipeline;
  // Warm the kernels so the first real window isn't pathologically slow.
  await transcriber(new Float32Array(16000));
}

async function transcribe(
  audio: Float32Array,
  language: string | null,
  id: number,
  stream: boolean,
): Promise<string> {
  if (!transcriber) return '';

  // For the final pass we stream decoded tokens back so the UI can show the
  // transcript filling in — otherwise a long clip looks frozen while decoding.
  let streamer: WhisperTextStreamer | undefined;
  if (stream) {
    let acc = '';
    // The pipeline types `tokenizer` as the base class, but for a Whisper ASR
    // pipeline it's always a WhisperTokenizer at runtime.
    streamer = new WhisperTextStreamer(transcriber.tokenizer as never, {
      skip_prompt: true,
      callback_function: (text: string) => {
        acc += text;
        ctx.postMessage({ type: 'partial', id, text: acc });
      },
    });
  }

  const out = (await transcriber(audio, {
    // Our windows are short (≤ the recognizer's window), so single-pass decode
    // without chunking keeps latency low and avoids stitch artefacts.
    language: language ?? undefined,
    task: 'transcribe',
    streamer,
  } as never)) as { text?: string } | Array<{ text?: string }>;
  const text = Array.isArray(out) ? out[0]?.text : out.text;
  return text ?? '';
}

ctx.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    init(msg.model, msg.dtype)
      .then(() => ctx.postMessage({ type: 'ready' }))
      .catch((err) =>
        ctx.postMessage({ type: 'error', message: String(err?.message ?? err) }),
      );
    return;
  }
  if (msg.type === 'transcribe') {
    transcribe(msg.audio, msg.language, msg.id, msg.stream)
      .then((text) => ctx.postMessage({ type: 'result', id: msg.id, text }))
      .catch(() => ctx.postMessage({ type: 'result', id: msg.id, text: '' }));
  }
};
