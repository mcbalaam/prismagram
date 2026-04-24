import type { Capability, HostApiMethod } from '../types';

const METHOD_CAPABILITY_MAP: Record<HostApiMethod, Capability> = {
  'messages.send': 'messages:send',
  'messages.getActive': 'messages:read:active-chat',
  'messages.delete': 'messages:delete',
  'events.subscribe': 'events:message',
  'events.unsubscribe': 'events:message',
  'storage.get': 'storage:config',
  'storage.set': 'storage:config',
  'storage.getAll': 'storage:config',
  'ui.registerSlot': 'ui:slot:*',
  'ui.unregisterSlot': 'ui:slot:*',
  'dom.watchZone': 'ui:dom',
  'dom.query': 'ui:dom',
  'dom.queryAll': 'ui:dom',
  'dom.createElement': 'ui:dom',
  'dom.setStyle': 'ui:dom',
  'dom.addClass': 'ui:dom',
  'dom.setText': 'ui:dom',
  'dom.appendChild': 'ui:dom',
  'dom.insertBefore': 'ui:dom',
  'dom.remove': 'ui:dom',
  'dom.on': 'ui:dom',
  'dom.observeSelector': 'ui:dom',
  'dom.injectStyle': 'ui:dom',
};

export function checkCapability(
  method: HostApiMethod,
  grantedCapabilities: Capability[],
): boolean {
  const required = METHOD_CAPABILITY_MAP[method];
  if (!required) return false;

  if (required.endsWith(':*')) {
    const prefix = required.slice(0, -1);
    return grantedCapabilities.some((cap) => cap.startsWith(prefix));
  }

  return grantedCapabilities.includes(required);
}

export function checkEventCapability(
  eventName: string,
  grantedCapabilities: Capability[],
): boolean {
  if (eventName.startsWith('message:')) {
    return grantedCapabilities.includes('events:message');
  }
  if (eventName.startsWith('ui:')) {
    return grantedCapabilities.includes('events:ui');
  }
  return false;
}

export function resolveGrantedCapabilities(
  required: Capability[],
  optional: Capability[],
  userGranted: Capability[],
): Capability[] {
  const granted: Capability[] = [];

  for (const cap of required) {
    if (userGranted.includes(cap)) granted.push(cap);
  }
  for (const cap of optional) {
    if (userGranted.includes(cap)) granted.push(cap);
  }

  return granted;
}
