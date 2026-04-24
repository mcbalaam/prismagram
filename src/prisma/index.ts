export type {
  Capability,
  PluginManifest,
  PluginRecord,
  PluginState,
  PluginMessage,
  PluginEventName,
  PluginEventPayload,
  MessageEventPayload,
  UiEventPayload,
  EventFilter,
  SlotId,
  SlotContribution,
} from './types';

export { PluginManager } from './plugins/PluginManager';
export { PluginHost } from './plugins/PluginHost';
export { PluginRpcClient } from './rpc/channel';
export { broadcastMessageEvent, broadcastUiEvent, broadcastDeleteEvent } from './eventBus';
export { normalizeMessage } from './normalizer';
export {
  registerContribution, unregisterContribution, unregisterAllForPlugin,
  registerClickHandler, unregisterClickHandler,
  getContributions, subscribeToSlot,
} from './slotRegistry';
export type { RegisteredContribution } from './slotRegistry';
export { checkCapability, checkEventCapability, resolveGrantedCapabilities } from './plugins/capabilities';
