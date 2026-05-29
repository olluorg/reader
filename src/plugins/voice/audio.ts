/**
 * Microphone capture for dictation.
 *
 * Whisper wants mono 16 kHz PCM. We open the mic, accumulate raw samples at
 * the audio context's native rate, and expose a `snapshot()` that returns the
 * captured tail resampled to 16 kHz — called repeatedly by the interim loop
 * while the key is held, and once more on release for the final pass.
 *
 * Uses a ScriptProcessorNode: it's deprecated but universally available and
 * dead simple for "give me the raw input frames", which is all we need. The
 * node is connected to the destination (required for it to fire) but never
 * writes to its output buffer, so nothing is played back.
 */

const TARGET_RATE = 16000;

export class AudioCapture {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private sampleRate = TARGET_RATE;

  /** Open the mic and begin accumulating. Rejects if permission is denied. */
  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.context = new Ctor();
    // A context can start suspended until a user gesture; the key-hold that got
    // us here is one, so resuming is allowed and makes capture start reliably.
    if (this.context.state === 'suspended') await this.context.resume().catch(() => {});
    this.sampleRate = this.context.sampleRate;
    this.source = this.context.createMediaStreamSource(this.stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      // Copy — the event buffer is reused across callbacks.
      this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    this.source.connect(this.processor);
    this.processor.connect(this.context.destination);
  }

  /**
   * The captured audio (optionally only the last `maxSeconds`) as mono 16 kHz.
   * Returns an empty array when nothing has been captured yet.
   */
  snapshot(maxSeconds?: number): Float32Array {
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    if (total === 0) return new Float32Array(0);

    const keep =
      maxSeconds && maxSeconds * this.sampleRate < total
        ? Math.floor(maxSeconds * this.sampleRate)
        : total;

    // Flatten the tail of `keep` samples into one buffer.
    const flat = new Float32Array(keep);
    let need = keep;
    let pos = keep;
    for (let i = this.chunks.length - 1; i >= 0 && need > 0; i--) {
      const c = this.chunks[i]!;
      const take = Math.min(need, c.length);
      pos -= take;
      flat.set(c.subarray(c.length - take), pos);
      need -= take;
    }

    return this.resample(flat);
  }

  /** Linear-interpolation downsample to 16 kHz (no-op when already 16 kHz). */
  private resample(input: Float32Array): Float32Array {
    if (this.sampleRate === TARGET_RATE || input.length === 0) return input;
    const ratio = this.sampleRate / TARGET_RATE;
    const outLen = Math.floor(input.length / ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const src = i * ratio;
      const i0 = Math.floor(src);
      const i1 = Math.min(i0 + 1, input.length - 1);
      const frac = src - i0;
      out[i] = input[i0]! * (1 - frac) + input[i1]! * frac;
    }
    return out;
  }

  /** Stop the mic and release everything. */
  stop(): void {
    this.processor?.disconnect();
    this.source?.disconnect();
    if (this.processor) this.processor.onaudioprocess = null;
    void this.context?.close().catch(() => {});
    this.stream?.getTracks().forEach((tr) => tr.stop());
    this.processor = null;
    this.source = null;
    this.context = null;
    this.stream = null;
    this.chunks = [];
  }
}
