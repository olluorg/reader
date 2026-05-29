/**
 * A small fixed status pill shown while dictating ("Listening…" /
 * "Transcribing…"). One singleton element, created on demand. `busy` adds a
 * spinner so the transcribe step never looks frozen even before the streamed
 * transcript starts arriving.
 */

const ID = 'reader-voice-overlay';

export function showOverlay(text: string, busy = false): void {
  let el = document.getElementById(ID);
  if (!el) {
    el = document.createElement('div');
    el.id = ID;
    el.className = 'voice-overlay';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.innerHTML = '';
  if (busy) {
    const spinner = document.createElement('span');
    spinner.className = 'voice-overlay__spinner';
    el.appendChild(spinner);
  }
  const label = document.createElement('span');
  label.textContent = text;
  el.appendChild(label);
}

export function hideOverlay(): void {
  document.getElementById(ID)?.remove();
}
