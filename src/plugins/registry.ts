import type {
  MenuItem,
  ReaderPlugin,
  ReaderPluginContext,
  ToolbarButton,
} from './api';

const registered: ReaderPlugin[] = [];
let ctx: ReaderPluginContext | null = null;

export function registerPlugin(plugin: ReaderPlugin): void {
  if (registered.some((p) => p.id === plugin.id)) {
    console.warn(`[plugins] plugin "${plugin.id}" registered twice; ignoring`);
    return;
  }
  registered.push(plugin);
}

export function bindContext(c: ReaderPluginContext): void {
  ctx = c;
}

/** Synchronous hook fan-out. Errors in one plugin don't block the rest. */
export function callHook(
  name: Extract<
    keyof ReaderPlugin,
    | 'onNewDocument'
    | 'onHashCleared'
    | 'onDocEdited'
    | 'onShareGenerated'
    | 'onSplitShareGenerated'
  >,
  ...args: unknown[]
): void {
  if (!ctx) return;
  for (const plugin of registered) {
    const fn = plugin[name];
    if (typeof fn !== 'function') continue;
    try {
      (fn as (ctx: ReaderPluginContext, ...rest: unknown[]) => void).call(
        plugin,
        ctx,
        ...args,
      );
    } catch (err) {
      console.warn(`[plugins] ${plugin.id}.${name} failed:`, err);
    }
  }
}

/** Async hook fan-out (awaited sequentially). */
export async function callHookAsync(
  name: Extract<keyof ReaderPlugin, 'onAppStart' | 'onDocLoaded'>,
  ...args: unknown[]
): Promise<void> {
  if (!ctx) return;
  for (const plugin of registered) {
    const fn = plugin[name];
    if (typeof fn !== 'function') continue;
    try {
      await (fn as (
        ctx: ReaderPluginContext,
        ...rest: unknown[]
      ) => Promise<void> | void).call(plugin, ctx, ...args);
    } catch (err) {
      console.warn(`[plugins] ${plugin.id}.${name} failed:`, err);
    }
  }
}

export function collectToolbarButtons(): readonly ToolbarButton[] {
  if (!ctx) return [];
  const out: ToolbarButton[] = [];
  for (const p of registered) {
    if (!p.toolbarButtons) continue;
    try {
      out.push(...p.toolbarButtons(ctx));
    } catch (err) {
      console.warn(`[plugins] ${p.id}.toolbarButtons failed:`, err);
    }
  }
  return out;
}

export function collectOverflowMenuItems(): readonly MenuItem[] {
  if (!ctx) return [];
  const out: MenuItem[] = [];
  for (const p of registered) {
    if (!p.overflowMenuItems) continue;
    try {
      out.push(...p.overflowMenuItems(ctx));
    } catch (err) {
      console.warn(`[plugins] ${p.id}.overflowMenuItems failed:`, err);
    }
  }
  return out;
}
