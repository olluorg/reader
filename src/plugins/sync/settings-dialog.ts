import { showToast } from '../../ui/toast';
import { t } from './i18n';
import { getSdk } from './setup';

/**
 * Sync settings dialog. Shows server URL config, current sign-in state,
 * and a live sync status panel (engine state + outbox size). All actions
 * route through the SDK bundle — if the bundle failed to initialise
 * (no env at build time, IDB error, etc.) the dialog still opens but
 * with most controls disabled and a clear message at the top.
 */
export function openSettingsDialog(): void {
  const sdk = getSdk();

  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'dialog dialog--narrow';
  dialog.innerHTML = `
    <h2 class="dialog__title">${t('dialog.title')}</h2>

    <div class="dialog__field" data-section="unavailable" hidden>
      <p class="dialog__desc" style="color: var(--c-danger, #b00)">${t('unavailable')}</p>
    </div>

    <div class="dialog__field">
      <label class="dialog__label" for="settings-server-url">${t('field.server')}</label>
      <input class="dialog__input" type="url" id="settings-server-url"
             autocomplete="off" inputmode="url" placeholder="https://api.example.com">
      <div class="dialog__hint" data-role="server-hint"></div>
    </div>

    <div class="dialog__field">
      <span class="dialog__label">${t('field.account')}</span>
      <div data-role="account-state"></div>
    </div>

    <div class="dialog__field">
      <span class="dialog__label">${t('field.status')}</span>
      <div data-role="status"></div>
    </div>

    <div class="dialog__actions">
      <button class="btn btn--ghost" data-action="close">${t('btn.close')}</button>
      <button class="btn btn--primary" data-action="save">${t('btn.save')}</button>
    </div>
  `;

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  const serverInput = dialog.querySelector('#settings-server-url') as HTMLInputElement;
  const serverHint = dialog.querySelector('[data-role="server-hint"]') as HTMLElement;
  const accountState = dialog.querySelector('[data-role="account-state"]') as HTMLElement;
  const statusEl = dialog.querySelector('[data-role="status"]') as HTMLElement;
  const saveBtn = dialog.querySelector('[data-action="save"]') as HTMLButtonElement;
  const closeBtn = dialog.querySelector('[data-action="close"]') as HTMLButtonElement;
  const unavailable = dialog.querySelector('[data-section="unavailable"]') as HTMLElement;

  if (!sdk) {
    unavailable.hidden = false;
    serverInput.disabled = true;
    saveBtn.disabled = true;
  } else {
    serverInput.value = sdk.config.get();
    serverHint.textContent = t('server.current', { url: sdk.config.get() });
  }

  let statusTimer: number | null = null;

  function renderAccount() {
    accountState.innerHTML = '';
    if (!sdk) {
      accountState.textContent = '—';
      return;
    }
    const session = sdk.auth.currentSession();
    if (session) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `
        <div>${t('account.signedInAs')} <strong></strong></div>
        <button class="btn btn--ghost btn--small" data-action="logout" style="margin-top: 8px">${t('account.logout')}</button>
      `;
      (wrapper.querySelector('strong') as HTMLElement).textContent = session.user.email || session.user.id;
      wrapper.querySelector('[data-action="logout"]')!.addEventListener('click', async () => {
        try {
          await sdk.engine.stop();
          await sdk.auth.logout();
          showToast(t('account.loggedOut'), { kind: 'info' });
          renderAccount();
          renderStatus();
        } catch (err) {
          showToast(t('account.logoutFailed', { message: (err as Error).message }), { kind: 'error' });
        }
      });
      accountState.appendChild(wrapper);
      return;
    }

    const googleProviderAvailable = (sdk as ReturnType<typeof getSdk>) &&
      !!(import.meta.env['VITE_OLLU_GOOGLE_CLIENT_ID'] as string | undefined);

    if (!googleProviderAvailable) {
      accountState.innerHTML = `
        <div style="color: var(--c-muted, #888)">${t('account.googleUnavailable')}</div>
      `;
      return;
    }

    const btn = document.createElement('button');
    btn.className = 'btn btn--primary';
    btn.textContent = t('account.loginGoogle');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = t('account.openingGoogle');
      try {
        await sdk.auth.loginWith('google');
        await sdk.startIfAuthed();
        showToast(t('account.loggedIn'), { kind: 'success' });
      } catch (err) {
        showToast(t('account.loginFailed', { message: (err as Error).message }), { kind: 'error' });
      } finally {
        btn.disabled = false;
        btn.textContent = t('account.loginGoogle');
        renderAccount();
        renderStatus();
      }
    });
    accountState.appendChild(btn);
  }

  async function renderStatus() {
    if (!sdk) {
      statusEl.textContent = '—';
      return;
    }
    const running = sdk.engine.isRunning();
    const pending = await sdk.proxy.outbox.size().catch(() => -1);
    statusEl.innerHTML = `
      <div>${t('status.engine')} <strong></strong></div>
      <div>${t('status.queue')} <strong></strong></div>
      <div style="margin-top: 8px">
        <button class="btn btn--ghost btn--small" data-action="sync-now">${t('status.syncNow')}</button>
      </div>
    `;
    (statusEl.querySelectorAll('strong')[0] as HTMLElement).textContent = running
      ? t('status.running')
      : t('status.stopped');
    (statusEl.querySelectorAll('strong')[1] as HTMLElement).textContent =
      pending < 0 ? t('status.readError') : String(pending);
    statusEl.querySelector('[data-action="sync-now"]')!.addEventListener('click', () => {
      if (!sdk.engine.isRunning()) {
        showToast(t('status.notSignedIn'), { kind: 'warn' });
        return;
      }
      sdk.engine.schedule();
      showToast(t('status.requested'), { kind: 'info' });
    });
  }

  function close() {
    if (statusTimer !== null) clearInterval(statusTimer);
    backdrop.remove();
  }

  saveBtn.addEventListener('click', async () => {
    if (!sdk) return;
    const next = serverInput.value.trim();
    if (!next) {
      await sdk.config.reset();
      showToast(t('save.reset', { url: sdk.config.get() }), { kind: 'info' });
    } else {
      try {
        new URL(next);
      } catch {
        showToast(t('save.badUrl'), { kind: 'error' });
        return;
      }
      await sdk.config.set(next);
      showToast(t('save.saved'), { kind: 'success' });
    }
    serverHint.textContent = t('server.current', { url: sdk.config.get() });
  });

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') close();
    },
    { once: true },
  );

  renderAccount();
  void renderStatus();
  statusTimer = window.setInterval(renderStatus, 2000);
}
