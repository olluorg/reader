/**
 * Device-capability probe for on-device voice typing.
 *
 * Whisper runs as a quantised transformer via WebGPU in a worker, fed by the
 * microphone. That needs three things present: WebGPU (the WASM fallback is
 * too slow for usable dictation latency), a microphone API, and a secure
 * context — `getUserMedia` only exists on HTTPS / localhost. When any is
 * missing we stay unsupported rather than degrade to a slow or broken path.
 */

export interface Capability {
  webgpu: boolean;
  microphone: boolean;
  secureContext: boolean;
  deviceMemory: number;
  /** True when it's reasonable to try loading the voice model. */
  capable: boolean;
}

const MIN_MEMORY_GB = 4;

export async function detectCapability(): Promise<Capability> {
  const nav = navigator as Navigator & {
    gpu?: { requestAdapter?: () => Promise<unknown> };
    deviceMemory?: number;
  };

  let webgpu = false;
  try {
    if (nav.gpu?.requestAdapter) {
      const adapter = await nav.gpu.requestAdapter();
      webgpu = adapter != null;
    }
  } catch {
    webgpu = false;
  }

  const microphone =
    typeof navigator.mediaDevices?.getUserMedia === 'function';
  const secureContext =
    typeof window !== 'undefined' ? window.isSecureContext !== false : true;
  const deviceMemory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 0;

  // deviceMemory === 0 means "unknown" (Safari/Firefox don't report it) — don't
  // hold WebGPU-capable devices back on a value they refuse to disclose.
  const capable =
    webgpu &&
    microphone &&
    secureContext &&
    (deviceMemory === 0 || deviceMemory >= MIN_MEMORY_GB);

  return { webgpu, microphone, secureContext, deviceMemory, capable };
}
