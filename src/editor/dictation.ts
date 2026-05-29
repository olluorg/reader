/**
 * Editor-global dictation flag.
 *
 * A neutral seam in the core so cross-cutting "voice is dictating right now"
 * state isn't owned by either optional plugin: the voice plugin sets it while
 * recording, and predict reads it to suppress its ghost-text completion so the
 * two ghosts never overlap at the caret. Either plugin can be absent from a
 * build — this module has no dependency on either.
 */

let active = false;

export function isDictating(): boolean {
  return active;
}

export function setDictating(v: boolean): void {
  active = v;
}
