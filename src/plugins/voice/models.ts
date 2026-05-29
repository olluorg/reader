/**
 * Selectable on-device Whisper models, smallest → largest.
 *
 * All are the multilingual Xenova ONNX builds (so Russian works on every one);
 * size and accuracy trade off against interim latency. The user picks one in
 * settings — bigger means better Russian but a heavier download and slower
 * per-tick transcription. Sizes are approximate (quantised) and only shown to
 * inform the download warning.
 */

export interface VoiceModel {
  id: string;
  label: string;
  /** Approximate download size in MB (quantised). */
  sizeMB: number;
}

export const MODELS: readonly VoiceModel[] = [
  { id: 'Xenova/whisper-tiny', label: 'Tiny', sizeMB: 40 },
  { id: 'Xenova/whisper-base', label: 'Base', sizeMB: 80 },
  { id: 'Xenova/whisper-small', label: 'Small', sizeMB: 250 },
];

/** Build-time default selection; falls back to the smallest catalog model. */
export const DEFAULT_MODEL_ID =
  (import.meta.env['VITE_OLLU_VOICE_MODEL'] as string | undefined) ?? MODELS[0]!.id;

export function modelById(id: string): VoiceModel {
  return (
    MODELS.find((m) => m.id === id) ?? {
      // A custom env model that's not in the catalog: use it, label by its tail.
      id,
      label: id.split('/').pop() ?? id,
      sizeMB: 0,
    }
  );
}
