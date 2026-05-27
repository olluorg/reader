import { showToast } from '../../ui/toast';
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
    <h2 class="dialog__title">Синхронизация</h2>

    <div class="dialog__field" data-section="unavailable" hidden>
      <p class="dialog__desc" style="color: var(--c-danger, #b00)">
        SDK не инициализирован. Сборка приложения, возможно, не получила
        переменные окружения VITE_OLLU_SERVER / VITE_OLLU_GOOGLE_CLIENT_ID,
        или произошла ошибка при открытии IndexedDB.
      </p>
    </div>

    <div class="dialog__field">
      <label class="dialog__label" for="settings-server-url">Сервер</label>
      <input class="dialog__input" type="url" id="settings-server-url"
             autocomplete="off" inputmode="url" placeholder="https://api.example.com">
      <div class="dialog__hint" data-role="server-hint"></div>
    </div>

    <div class="dialog__field">
      <span class="dialog__label">Аккаунт</span>
      <div data-role="account-state"></div>
    </div>

    <div class="dialog__field">
      <span class="dialog__label">Статус</span>
      <div data-role="status"></div>
    </div>

    <div class="dialog__actions">
      <button class="btn btn--ghost" data-action="close">Закрыть</button>
      <button class="btn btn--primary" data-action="save">Сохранить</button>
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
    serverHint.textContent = `Текущий: ${sdk.config.get()}`;
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
        <div>Вы вошли как <strong></strong></div>
        <button class="btn btn--ghost btn--small" data-action="logout" style="margin-top: 8px">Выйти</button>
      `;
      (wrapper.querySelector('strong') as HTMLElement).textContent = session.user.email || session.user.id;
      wrapper.querySelector('[data-action="logout"]')!.addEventListener('click', async () => {
        try {
          await sdk.engine.stop();
          await sdk.auth.logout();
          showToast('Вышли из аккаунта', { kind: 'info' });
          renderAccount();
          renderStatus();
        } catch (err) {
          showToast(`Не удалось выйти: ${(err as Error).message}`, { kind: 'error' });
        }
      });
      accountState.appendChild(wrapper);
      return;
    }

    const googleProviderAvailable = (sdk as ReturnType<typeof getSdk>) &&
      !!(import.meta.env['VITE_OLLU_GOOGLE_CLIENT_ID'] as string | undefined);

    if (!googleProviderAvailable) {
      accountState.innerHTML = `
        <div style="color: var(--c-muted, #888)">
          Google-логин не настроен (нет VITE_OLLU_GOOGLE_CLIENT_ID на сборке).
        </div>
      `;
      return;
    }

    const btn = document.createElement('button');
    btn.className = 'btn btn--primary';
    btn.textContent = 'Войти через Google';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Открываем Google…';
      try {
        await sdk.auth.loginWith('google');
        await sdk.startIfAuthed();
        showToast('Вошли в Google', { kind: 'success' });
      } catch (err) {
        showToast(`Не удалось войти: ${(err as Error).message}`, { kind: 'error' });
      } finally {
        btn.disabled = false;
        btn.textContent = 'Войти через Google';
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
      <div>Движок: <strong></strong></div>
      <div>В очереди: <strong></strong></div>
      <div style="margin-top: 8px">
        <button class="btn btn--ghost btn--small" data-action="sync-now">Синхронизировать сейчас</button>
      </div>
    `;
    (statusEl.querySelectorAll('strong')[0] as HTMLElement).textContent = running ? 'работает' : 'остановлен';
    (statusEl.querySelectorAll('strong')[1] as HTMLElement).textContent =
      pending < 0 ? 'ошибка чтения' : String(pending);
    statusEl.querySelector('[data-action="sync-now"]')!.addEventListener('click', () => {
      if (!sdk.engine.isRunning()) {
        showToast('Не вошли в аккаунт — синхронизация не запущена', { kind: 'warn' });
        return;
      }
      sdk.engine.schedule();
      showToast('Запрошена синхронизация', { kind: 'info' });
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
      showToast(`Сброшено на ${sdk.config.get()}`, { kind: 'info' });
    } else {
      try {
        new URL(next);
      } catch {
        showToast('Некорректный URL', { kind: 'error' });
        return;
      }
      await sdk.config.set(next);
      showToast('Сохранено', { kind: 'success' });
    }
    serverHint.textContent = `Текущий: ${sdk.config.get()}`;
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
