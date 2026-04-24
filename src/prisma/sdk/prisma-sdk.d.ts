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

interface DomHandle {
  handleId: string;
}

interface DomApi {
  /** Subscribe to zone lifecycle. onMount fires immediately if zone is already active. */
  watchZone(zone: string, onMount: () => void, onUnmount?: () => void): Promise<unknown>;
  /** Find first matching element in zone. Returns handle or undefined. */
  query(zone: string, selector: string): Promise<DomHandle | undefined>;
  /** Find all matching elements in zone. */
  queryAll(zone: string, selector: string): Promise<{ handleIds: string[] }>;
  /** Create element. tag must be in allowed list (div, span, button, p, img, hr, ul, li, a). */
  createElement(tag: string, props?: { text?: string; className?: string }): Promise<DomHandle | undefined>;
  /** Set CSS property. Only allowed props/values pass through. */
  setStyle(handleId: string, prop: string, value: string): Promise<unknown>;
  /** Add prefixed class to element. */
  addClass(handleId: string, className: string): Promise<unknown>;
  /** Set textContent. */
  setText(handleId: string, text: string): Promise<unknown>;
  /** Append plugin-created child to parent. */
  appendChild(parentId: string, childId: string): Promise<unknown>;
  /** Insert plugin-created element before reference element. */
  insertBefore(refId: string, newId: string): Promise<unknown>;
  /** Remove plugin-created element. */
  remove(handleId: string): Promise<unknown>;
  /** Listen to DOM event. Callback receives { listenerId, type }. */
  on(handleId: string, event: string, callback: (data: { listenerId: string; type: string }) => void): Promise<unknown>;
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
   */
  register(method: 'beforeMessageSent', handler: (params: BeforeMessageSentParams) => Promise<BeforeMessageSentResult>): void;
  register(method: string, handler: (params: unknown) => Promise<unknown>): void;

  /** Run callback once the SDK handshake is complete. Safe to call before ready. */
  ready(callback: () => void | Promise<void>): void;

  /** Handle slot click events triggered by the host. */
  onSlotClick(handler: (event: SlotClickEvent) => void): void;

  /** DOM Proxy API — requires ui:dom capability in manifest. */
  dom: DomApi;
}

declare global {
  interface Window {
    PrismaSDK: PrismaSDKApi;
  }
  const PrismaSDK: PrismaSDKApi;
}
