import type {
  PluginMenuSection,
  ReaderPlugin,
  ReaderPluginContext,
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

/**
 * Items contributed by each registered plugin, grouped per plugin so the
 * dropdown can render sections with the plugin's label as a header.
 * Plugins with no items are omitted.
 */
export function collectMenuSections(): readonly PluginMenuSection[] {
  if (!ctx) return [];
  const out: PluginMenuSection[] = [];
  for (const p of registered) {
    if (!p.menuItems) continue;
    let items: readonly { label: string; action: () => void }[] = [];
    try {
      items = p.menuItems(ctx);
    } catch (err) {
      console.warn(`[plugins] ${p.id}.menuItems failed:`, err);
      continue;
    }
    if (items.length === 0) continue;
    out.push({ id: p.id, label: p.label ?? p.id, items });
  }
  return out;
}
