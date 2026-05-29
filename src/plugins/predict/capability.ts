/**
 * Device-capability probe for Tier 1 (the on-device LM).
 *
 * Tier 1 runs a small quantised transformer via WebGPU in a worker. That's
 * only worth attempting where the platform can actually carry it — otherwise
 * we silently stay on Tier 0 (the instant n-gram completion), which works
 * everywhere. The gate is deliberately conservative: WebGPU is mandatory
 * (the WASM fallback is too slow for keystroke-latency phrase suggestions on
 * a phone), plus a soft memory floor for the model weights.
 */

export interface Capability {
  webgpu: boolean;
  /** navigator.deviceMemory in GB, or 0 when the browser doesn't expose it. */
  deviceMemory: number;
  concurrency: number;
  /** True when it's reasonable to try loading the Tier 1 model. */
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

  const deviceMemory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 0;
  const concurrency = nav.hardwareConcurrency ?? 0;

  // deviceMemory === 0 means "unknown" (Safari/Firefox don't report it) — don't
  // hold WebGPU-capable devices back on a value they refuse to disclose.
  const capable = webgpu && (deviceMemory === 0 || deviceMemory >= MIN_MEMORY_GB);

  return { webgpu, deviceMemory, concurrency, capable };
}
