import { defaultSnapshotName, LocalFileTarget, type BackupInfo } from '@ollu/sdk-core';
import { GoogleDriveTarget } from '@ollu/sdk-backup-gdrive';
import { showToast } from '../../ui/toast';
import { getSdk } from './setup';

/**
 * Backup dialog: export the local state to a `.cbor` file or to Google
 * Drive; restore from a picked file or a Drive backup. Drive interaction
 * is gated on VITE_OLLU_GOOGLE_CLIENT_ID being set at build time.
 */
export function openBackupDialog(): void {
  const sdk = getSdk();
  const driveClientId = import.meta.env['VITE_OLLU_GOOGLE_CLIENT_ID'] as
    | string
    | undefined;

  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'dialog dialog--narrow';
  dialog.innerHTML = `
    <h2 class="dialog__title">Бэкап</h2>

    <div class="dialog__field" data-section="unavailable" hidden>
      <p class="dialog__desc" style="color: var(--c-danger, #b00)">
        SDK не инициализирован — бэкап недоступен.
      </p>
    </div>

    <div class="dialog__field">
      <span class="dialog__label">Локальный файл</span>
      <div style="display: flex; gap: 8px; flex-wrap: wrap">
        <button class="btn btn--primary" data-action="export-local">Скачать .cbor</button>
        <button class="btn btn--ghost" data-action="import-local">Восстановить из файла…</button>
      </div>
      <div class="dialog__hint">
        Снапшот шифрования не имеет — храните файл в надёжном месте.
      </div>
    </div>

    <div class="dialog__field" data-section="drive">
      <span class="dialog__label">Google Drive</span>
      <div data-role="drive-actions"></div>
      <div data-role="drive-list" style="margin-top: 8px"></div>
    </div>

    <div class="dialog__actions">
      <button class="btn btn--ghost" data-action="close">Закрыть</button>
    </div>
  `;

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  const unavailable = dialog.querySelector('[data-section="unavailable"]') as HTMLElement;
  const exportBtn = dialog.querySelector('[data-action="export-local"]') as HTMLButtonElement;
  const importBtn = dialog.querySelector('[data-action="import-local"]') as HTMLButtonElement;
  const driveActions = dialog.querySelector('[data-role="drive-actions"]') as HTMLElement;
  const driveList = dialog.querySelector('[data-role="drive-list"]') as HTMLElement;
  const closeBtn = dialog.querySelector('[data-action="close"]') as HTMLButtonElement;

  if (!sdk) {
    unavailable.hidden = false;
    exportBtn.disabled = true;
    importBtn.disabled = true;
  }

  const localTarget = new LocalFileTarget();
  let driveTarget: GoogleDriveTarget | null = null;
  if (driveClientId) {
    driveTarget = new GoogleDriveTarget({
      clientId: driveClientId,
      folderName: 'Reader Backups',
    });
  }

  exportBtn.addEventListener('click', async () => {
    if (!sdk) return;
    exportBtn.disabled = true;
    try {
      const data = await sdk.proxy.createSnapshot();
      const name = defaultSnapshotName('reader');
      await localTarget.put(name, data);
      showToast(`Сохранено: ${name} (${(data.length / 1024).toFixed(1)} KB)`, {
        kind: 'success',
      });
    } catch (err) {
      showToast(`Не удалось создать бэкап: ${(err as Error).message}`, { kind: 'error' });
    } finally {
      exportBtn.disabled = false;
    }
  });

  importBtn.addEventListener('click', async () => {
    if (!sdk) return;
    importBtn.disabled = true;
    try {
      const data = await localTarget.get('reader-backup');
      if (!confirm(`Восстановить ${(data.length / 1024).toFixed(1)} KB из файла? Локальные данные будут слиты по LWW.`)) {
        return;
      }
      await sdk.proxy.restoreSnapshot(data);
      showToast('Бэкап восстановлен. Перезагрузите страницу для отображения данных.', {
        kind: 'success',
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'file picker cancelled' || msg === 'no file selected') return;
      showToast(`Не удалось восстановить: ${msg}`, { kind: 'error' });
    } finally {
      importBtn.disabled = false;
    }
  });

  function renderDrive() {
    driveActions.innerHTML = '';
    driveList.innerHTML = '';
    if (!sdk) return;
    if (!driveTarget) {
      driveActions.innerHTML = `
        <div style="color: var(--c-muted, #888)">
          Google-логин не настроен (нет VITE_OLLU_GOOGLE_CLIENT_ID).
        </div>
      `;
      return;
    }

    const upBtn = document.createElement('button');
    upBtn.className = 'btn btn--primary';
    upBtn.textContent = 'Сохранить в Drive';
    upBtn.addEventListener('click', async () => {
      upBtn.disabled = true;
      try {
        const data = await sdk.proxy.createSnapshot();
        const name = defaultSnapshotName('reader');
        await driveTarget!.put(name, data);
        showToast(`Загружено в Drive: ${name}`, { kind: 'success' });
        await loadDriveList();
      } catch (err) {
        showToast(`Drive upload: ${(err as Error).message}`, { kind: 'error' });
      } finally {
        upBtn.disabled = false;
      }
    });

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn btn--ghost btn--small';
    refreshBtn.textContent = 'Обновить список';
    refreshBtn.style.marginLeft = '8px';
    refreshBtn.addEventListener('click', () => void loadDriveList());

    driveActions.append(upBtn, refreshBtn);
    void loadDriveList();
  }

  async function loadDriveList(): Promise<void> {
    if (!sdk || !driveTarget) return;
    driveList.textContent = 'Загружаем список…';
    let items: readonly BackupInfo[];
    try {
      items = await driveTarget.list();
    } catch (err) {
      driveList.textContent = '';
      showToast(`Drive list: ${(err as Error).message}`, { kind: 'error' });
      return;
    }
    if (items.length === 0) {
      driveList.innerHTML =
        '<div style="color: var(--c-muted, #888)">Пока нет бэкапов в Drive.</div>';
      return;
    }
    driveList.innerHTML = '';
    for (const item of items) {
      const row = document.createElement('div');
      row.style.cssText =
        'display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-top: 1px solid var(--c-border, #eee)';
      const left = document.createElement('div');
      const date = item.createdAt ? new Date(item.createdAt).toLocaleString() : '';
      left.innerHTML = `
        <div style="font-family: var(--font-mono, monospace); font-size: 13px"></div>
        <div style="color: var(--c-muted, #888); font-size: 12px"></div>
      `;
      (left.children[0] as HTMLElement).textContent = item.name;
      (left.children[1] as HTMLElement).textContent =
        `${(item.size / 1024).toFixed(1)} KB · ${date}`;
      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'btn btn--ghost btn--small';
      restoreBtn.textContent = 'Восстановить';
      restoreBtn.addEventListener('click', async () => {
        if (
          !confirm(
            `Восстановить «${item.name}»? Текущие данные будут слиты по LWW (более свежие записи побеждают).`,
          )
        ) {
          return;
        }
        restoreBtn.disabled = true;
        try {
          const data = await driveTarget!.get(item.name);
          await sdk.proxy.restoreSnapshot(data);
          showToast('Бэкап восстановлен. Перезагрузите страницу.', { kind: 'success' });
        } catch (err) {
          showToast(`Restore: ${(err as Error).message}`, { kind: 'error' });
        } finally {
          restoreBtn.disabled = false;
        }
      });
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn--ghost btn--small';
      deleteBtn.textContent = 'Удалить';
      deleteBtn.style.marginLeft = '4px';
      deleteBtn.addEventListener('click', async () => {
        if (!confirm(`Удалить «${item.name}» с Drive?`)) return;
        deleteBtn.disabled = true;
        try {
          await driveTarget!.delete(item.name);
          await loadDriveList();
        } catch (err) {
          showToast(`Delete: ${(err as Error).message}`, { kind: 'error' });
        } finally {
          deleteBtn.disabled = false;
        }
      });
      const actions = document.createElement('div');
      actions.append(restoreBtn, deleteBtn);
      row.append(left, actions);
      driveList.appendChild(row);
    }
  }

  function close() {
    backdrop.remove();
  }
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

  renderDrive();
}
