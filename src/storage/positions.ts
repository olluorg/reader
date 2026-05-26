/**
 * Last-known window scroll position per document, keyed by URL hash.
 *
 * Kept out of the main `reader` IndexedDB on purpose: scroll positions get
 * rewritten every few hundred ms while the user reads and have very little
 * cross-device value (different viewports, fonts, zoom levels). Storing
 * them in localStorage keeps them out of the sync outbox entirely.
 *
 * Storage layout: a single localStorage key holding a JSON object
 * `{ [hash]: scrollY }`. Reads parse the whole blob — fine because the
 * dataset is small (history is capped, saved/mine are user-curated).
 *
 * The API is async-shaped so the call sites in main.ts don't need to
 * change when we one day move this back into IDB if it grows.
 */

const KEY = 'reader-positions';

type PositionsMap = Record<string, number>;

function read(): PositionsMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as PositionsMap) : {};
  } catch {
    return {};
  }
}

function write(map: PositionsMap): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // QuotaExceeded — scroll positions are non-critical, drop the write.
  }
}

export async function setPosition(hash: string, scrollY: number): Promise<void> {
  const map = read();
  map[hash] = scrollY;
  write(map);
}

export async function getPosition(hash: string): Promise<number | undefined> {
  return read()[hash];
}

export async function removePosition(hash: string): Promise<void> {
  const map = read();
  if (!(hash in map)) return;
  delete map[hash];
  write(map);
}
