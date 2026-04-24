// Capability is a plugin limitation providing access to specific actions
export type Capability =
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
  | 'ui:dom'
  | `network:${string}`
  | 'storage:config';

// ---- Manifest ----

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  apiVersion: string;
  author: string;
  description: string;
  entry: string;
  permissions: {
    required: Capability[];
    optional: Capability[];
  };
};

// ---- Plugin state (stored in GlobalState) ----

export type PluginState = 'loading' | 'active' | 'inactive' | 'error';

export type PluginRecord = {
  manifest: PluginManifest;
  state: PluginState;
  grantedCapabilities: Capability[];
  source?: string;
  error?: string;
  config?: Record<string, unknown>;
};

// ---- Normalized message type ----

export type MessageMediaType = 'photo' | 'video' | 'audio' | 'document' | 'sticker' | 'voice';

export type MessageMedia = {
  type: MessageMediaType;
};

export type MessageEntityType =
  | 'bold' | 'italic' | 'code' | 'pre' | 'url' | 'mention' | 'hashtag' | 'spoiler';

export type MessageEntity = {
  type: MessageEntityType;
  offset: number;
  length: number;
};

export type PluginMessage = {
  id: number;
  chatId: number;
  fromId: number;
  text: string;
  date: number;
  isOutgoing: boolean;
  replyToMessageId?: number;
  media?: MessageMedia;
  entities?: MessageEntity[];
  raw: unknown;
};

// ---- Events ----

export type MessageEventName =
  | 'message:received'
  | 'message:sent'
  | 'message:edited'
  | 'message:deleted';

export type UiEventName =
  | 'ui:chat:opened'
  | 'ui:chat:closed'
  | 'ui:folder:opened'
  | 'ui:settings:opened'
  | 'ui:compose:focused'
  | 'ui:compose:blurred';

export type DomEventName =
  | 'dom:zone:mount'
  | 'dom:zone:unmount'
  | 'dom:event'
  | 'dom:observer:match';

export type PluginEventName = MessageEventName | UiEventName | DomEventName;

export type MessageEventPayload = {
  message: PluginMessage;
  chat?: { id: number; title: string };
};

export type MessageDeletedPayload = {
  ids: number[];
  chatId: number;
};

export type UiEventPayload = {
  chatId?: number;
  folderId?: number;
};

export type DomZoneMountPayload = { zone: string };
export type DomZoneUnmountPayload = { zone: string };
export type DomEventPayload = { listenerId: string; type: string };

export type PluginEventPayload =
  | MessageEventPayload
  | MessageDeletedPayload
  | UiEventPayload
  | DomZoneMountPayload
  | DomZoneUnmountPayload
  | DomEventPayload;

export type EventFilter = {
  chats?: number[];
  outgoing?: boolean;
};

export type EventSubscription = {
  pluginId: string;
  eventName: PluginEventName;
  filter?: EventFilter;
};

// ---- RPC protocol ----

export type RpcRequest = {
  type: 'rpc:request';
  id: string;
  method: string;
  params: unknown[];
};

export type RpcResponse = {
  type: 'rpc:response';
  id: string;
  result?: unknown;
  error?: string;
};

export type RpcEvent = {
  type: 'rpc:event';
  name: PluginEventName;
  data: PluginEventPayload;
};

export type RpcHandshake = {
  type: 'rpc:handshake';
  pluginId: string;
};

export type RpcReady = {
  type: 'rpc:ready';
  capabilities: Capability[];
  pluginId: string;
};

export type SlotClickContext = {
  messageId?: number;
  chatId?: number;
};

export type RpcSlotClick = {
  type: 'rpc:slot:click';
  slotId: string;
  contributionId: string;
  context?: SlotClickContext;
};

// ────────────────────────────────────────────────────────────────
// Двунаправленные сообщения: хост ↔ плагин
// ────────────────────────────────────────────────────────────────

// Сообщения, отправляемые хостом в плагин
export type HostToPluginMessage = 
  | RpcRequest          // Хост вызывает метод плагина
  | RpcResponse         // Хост отвечает на запрос плагина
  | RpcEvent
  | RpcSlotClick
  | RpcReady;

// Сообщения, отправляемые плагином в хост
export type PluginToHostMessage = 
  | RpcRequest          // Плагин вызывает метод хоста
  | RpcResponse         // Плагин отвечает на вызов хоста
  | RpcHandshake;

// ---- Host API (методы, которые плагин может вызывать у хоста) ----

export type HostApiMethod =
  | 'messages.send'
  | 'messages.getActive'
  | 'messages.delete'
  | 'events.subscribe'
  | 'events.unsubscribe'
  | 'storage.get'
  | 'storage.set'
  | 'storage.getAll'
  | 'ui.registerSlot'
  | 'ui.unregisterSlot'
  | 'dom.watchZone'
  | 'dom.query'
  | 'dom.queryAll'
  | 'dom.createElement'
  | 'dom.setStyle'
  | 'dom.addClass'
  | 'dom.setText'
  | 'dom.appendChild'
  | 'dom.insertBefore'
  | 'dom.remove'
  | 'dom.on'
  | 'dom.observeSelector'
  | 'dom.injectStyle';

export type HostApiParams = {
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
  'dom.watchZone': [zone: string];
  'dom.query': [zone: string, selector: string];
  'dom.queryAll': [zone: string, selector: string];
  'dom.createElement': [tag: string, props: { text?: string; className?: string }];
  'dom.setStyle': [handleId: string, prop: string, value: string];
  'dom.addClass': [handleId: string, className: string];
  'dom.setText': [handleId: string, text: string];
  'dom.appendChild': [parentId: string, childId: string];
  'dom.insertBefore': [refId: string, newId: string];
  'dom.remove': [handleId: string];
  'dom.on': [handleId: string, event: string, listenerId: string];
  'dom.observeSelector': [zone: string, selector: string, observerId: string];
  'dom.injectStyle': [css: string];
};

// ---- UI Slots ----

export type SlotId =
  | 'compose-bar:actions'
  | 'message:actions'
  | 'message:footer'
  | 'chat-header:actions'
  | 'sidebar:menu'
  | 'sidebar:panels'
  | 'settings:sections'
  | 'command-palette';

export type SlotContribution = {
  id: string;
  label: string;
  icon?: string;
};
