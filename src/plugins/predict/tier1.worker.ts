/**
 * Tier 1 worker — runs a small causal LM (via transformers.js) off the main
 * thread so token generation never blocks typing. WebGPU-accelerated; the
 * model is downloaded once and cached by the browser (Cache API), never put
 * in the document URL.
 *
 * Protocol: `init` once to load the pipeline (replies `ready` or `error`),
 * then `suggest` per request (replies `result` with the same id). The
 * controller ignores stale ids, so we don't need to abort in-flight runs.
 */

import { pipeline, env, type TextGenerationPipeline } from '@huggingface/transformers';
import type { FromWorker, ToWorker } from './tier1-protocol';

// Browser build: we only ever load remote models from the HF hub and let the
// browser cache them — no local model directory.
env.allowLocalModels = false;

const ctx = self as unknown as {
  postMessage: (m: FromWorker) => void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};

let generator: TextGenerationPipeline | null = null;
let maxNewTokens = 12;

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

async function init(model: string, dtype: string, maxTokens: number): Promise<void> {
  maxNewTokens = maxTokens;
  generator = (await pipeline('text-generation', model, {
    device: 'webgpu',
    dtype: dtype as never,
    progress_callback: onProgress as never,
  })) as TextGenerationPipeline;
  // Warm up the kernels so the first real suggestion isn't pathologically slow.
  await generator('.', { max_new_tokens: 1 } as never);
}

async function suggest(context: string): Promise<string> {
  if (!generator) return '';
  const out = (await generator(context, {
    max_new_tokens: maxNewTokens,
    do_sample: false,
    repetition_penalty: 1.3,
    return_full_text: false,
  } as never)) as Array<{ generated_text: string }>;
  return out?.[0]?.generated_text ?? '';
}

ctx.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    init(msg.model, msg.dtype, msg.maxNewTokens)
      .then(() => ctx.postMessage({ type: 'ready' }))
      .catch((err) =>
        ctx.postMessage({ type: 'error', message: String(err?.message ?? err) }),
      );
    return;
  }
  if (msg.type === 'suggest') {
    suggest(msg.context)
      .then((text) => ctx.postMessage({ type: 'result', id: msg.id, text }))
      .catch(() => ctx.postMessage({ type: 'result', id: msg.id, text: '' }));
  }
};
