import type {
  EventFilter,
  EventSubscription,
  MessageDeletedPayload,
  PluginEventName,
  PluginEventPayload,
  PluginMessage,
  MessageEventPayload,
} from './types';

type BroadcastTarget = {
  pluginId: string;
  send: (name: PluginEventName, data: PluginEventPayload) => void;
};

const subscriptions = new Map<string, EventSubscription>();
const targets = new Map<string, BroadcastTarget>();

type BeforeMessageHookHandler = (params: any) => Promise<{ cancel?: boolean }>;
const beforeHooks = new Map<string, BeforeMessageHookHandler>();

export function registerBeforeHook(pluginId: string, handler: BeforeMessageHookHandler) {
  console.log('[EventBus] registerBeforeHook', pluginId, 'before size:', beforeHooks.size);
  beforeHooks.set(pluginId, handler);
  console.log('[EventBus] registerBeforeHook after size:', beforeHooks.size);
}

export function unregisterBeforeHook(pluginId: string) {
  console.log('[EventBus] unregisterBeforeHook', pluginId, 'before size:', beforeHooks.size);
  beforeHooks.delete(pluginId);
  console.log('[EventBus] unregisterBeforeHook after size:', beforeHooks.size);
}

export async function callBeforeMessageHook(params: any): Promise<boolean> {
  console.log('[EventBus] callBeforeMessageHook - number of hooks:', beforeHooks.size, beforeHooks);
  if (beforeHooks.size === 0) return false;
  const results = await Promise.all(
    Array.from(beforeHooks.values()).map(handler =>
      handler(params).catch(err => {
        console.error('[EventBus] beforeMessageHook error:', err);
        return { cancel: false };
      })
    )
  );
  return results.some(res => res?.cancel === true);
}

export function registerTarget(pluginId: string, send: BroadcastTarget['send']) {
  // eslint-disable-next-line no-console
  console.log('[EventBus] registerTarget', pluginId);
  targets.set(pluginId, { pluginId, send });
}

export function unregisterTarget(pluginId: string) {
  // eslint-disable-next-line no-console
  console.log('[EventBus] unregisterTarget', pluginId);
  targets.delete(pluginId);
  for (const [key, sub] of subscriptions) {
    if (sub.pluginId === pluginId) subscriptions.delete(key);
  }
}

export function subscribe(
  pluginId: string,
  eventName: PluginEventName,
  filter?: EventFilter,
) {
  const key = `${pluginId}::${eventName}`;
  // eslint-disable-next-line no-console
  console.log('[EventBus] subscribe', key);
  subscriptions.set(key, { pluginId, eventName, filter });
}

export function unsubscribe(pluginId: string, eventName: PluginEventName) {
  // eslint-disable-next-line no-console
  console.log('[EventBus] unsubscribe', `${pluginId}::${eventName}`);
  subscriptions.delete(`${pluginId}::${eventName}`);
}

export function broadcastMessageEvent(
  eventName: PluginEventName,
  message: PluginMessage,
  chat?: { id: number; title: string },
) {
  // eslint-disable-next-line no-console
  console.log('[EventBus] broadcastMessageEvent', eventName, { subs: subscriptions.size, targets: targets.size });
  for (const sub of subscriptions.values()) {
    if (sub.eventName !== eventName) continue;
    if (!passesFilter(message, sub.filter)) continue;

    const target = targets.get(sub.pluginId);
    if (!target) continue;

    const payload: MessageEventPayload = { message, chat };
    target.send(eventName, payload);
  }
}

export function broadcastDeleteEvent(chatId: number, ids: number[]) {
  const payload: MessageDeletedPayload = { chatId, ids };
  for (const sub of subscriptions.values()) {
    if (sub.eventName !== 'message:deleted') continue;
    const target = targets.get(sub.pluginId);
    target?.send('message:deleted', payload);
  }
}

export function broadcastUiEvent(eventName: PluginEventName, data: PluginEventPayload) {
  for (const sub of subscriptions.values()) {
    if (sub.eventName !== eventName) continue;
    const target = targets.get(sub.pluginId);
    target?.send(eventName, data);
  }
}

function passesFilter(message: PluginMessage, filter?: EventFilter): boolean {
  if (!filter) return true;

  if (filter.chats !== undefined && !filter.chats.includes(message.chatId)) {
    return false;
  }

  if (filter.outgoing !== undefined && message.isOutgoing !== filter.outgoing) {
    return false;
  }

  return true;
}
