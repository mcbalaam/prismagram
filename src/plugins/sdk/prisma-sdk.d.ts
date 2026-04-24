// Type declarations for PrismaGram Plugin SDK.
// Include this file in your plugin's tsconfig to get full type checking.

type Capability =
  | 'messages:read:active-chat'
  | 'messages:read:background'
  | 'messages:send'
  | 'messages:edit'
  | 'messages:delete'
  | 'events:message'
  | 'events:ui'
  | `ui:slot:${string}`
  | `ui:inspect:${string}`
  | 'ui:theme'
  | `network:${string}`
  | 'storage:config';

type PluginEventName =
  | 'message:received'
  | 'message:sent'
  | 'message:edited'
  | 'message:deleted'
  | 'ui:chat:opened'
  | 'ui:chat:closed'
  | 'ui:folder:opened'
  | 'ui:settings:opened'
  | 'ui:compose:focused'
  | 'ui:compose:blurred';

interface EventFilter {
  chats?: number[];
  outgoing?: boolean;
}

interface SlotContribution {
  id: string;
  label: string;
  icon?: string;
}

interface SlotClickEvent {
  slotId: string;
  contributionId: string;
  context?: { messageId?: number; chatId?: number };
}

interface PluginMessage {
  id: number;
  chatId: number;
  fromId: number;
  text: string;
  date: number;
  isOutgoing: boolean;
  replyToMessageId?: number;
}

type HostApiParams = {
  'messages.send': [chatId: number, text: string];
  'messages.getActive': [];
  'messages.delete': [chatId: number, messageIds: number[]];
  'events.subscribe': [eventName: PluginEventName, filter?: EventFilter];
  'events.unsubscribe': [eventName: PluginEventName];
  'storage.get': [key: string];
  'storage.set': [key: string, value: unknown];
  'storage.getAll': [];
  'ui.registerSlot': [slotId: string, contribution: SlotContribution];
  'ui.unregisterSlot': [slotId: string, contributionId: string];
};

type HostApiMethod = keyof HostApiParams;

interface BeforeMessageSentParams {
  text: string;
  chatId: number;
}

interface BeforeMessageSentResult {
  cancel: boolean;
}

interface PrismaSDKApi {
  readonly pluginId: string;
  readonly capabilities: Capability[];

  /** Call a host API method. */
  call<M extends HostApiMethod>(method: M, ...params: HostApiParams[M]): Promise<unknown>;

  /** Subscribe to a host event. */
  on(event: PluginEventName, handler: (data: unknown) => void): void;

  /** Unsubscribe from a host event. */
  off(event: PluginEventName, handler: (data: unknown) => void): void;

  /**
   * Register a method the host can invoke on this plugin.
   * handler receives the first argument directly, not a params array.
   *
   * @example
   * PrismaSDK.register('beforeMessageSent', async ({ text, chatId }) => {
   *   if (text === '!ping') {
   *     await PrismaSDK.call('messages.send', chatId, 'pong');
   *     return { cancel: true };
   *   }
   *   return { cancel: false };
   * });
   */
  register(method: 'beforeMessageSent', handler: (params: BeforeMessageSentParams) => Promise<BeforeMessageSentResult>): void;
  register(method: string, handler: (params: unknown) => Promise<unknown>): void;

  /** Run callback once the SDK handshake is complete. Safe to call before ready. */
  ready(callback: () => void | Promise<void>): void;

  /** Handle slot click events triggered by the host. */
  onSlotClick(handler: (event: SlotClickEvent) => void): void;
}

declare global {
  interface Window {
    PrismaSDK: PrismaSDKApi;
  }
  const PrismaSDK: PrismaSDKApi;
}
