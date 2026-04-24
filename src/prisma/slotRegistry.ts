import type { SlotClickContext, SlotContribution, SlotId } from './types';

export type RegisteredContribution = {
  pluginId: string;
  slotId: SlotId;
  contribution: SlotContribution;
  onClick: (context?: SlotClickContext) => void;
};

const slotMap = new Map<SlotId, RegisteredContribution[]>();
const listeners = new Map<SlotId, Set<() => void>>();

// Separate click handler registry so PluginHost can register its channel push
const clickHandlers = new Map<string, (contributionId: string, context?: SlotClickContext) => void>();

export function registerClickHandler(
  pluginId: string,
  handler: (contributionId: string, context?: SlotClickContext) => void,
) {
  clickHandlers.set(pluginId, handler);
}

export function unregisterClickHandler(pluginId: string) {
  clickHandlers.delete(pluginId);
}

export function registerContribution(pluginId: string, slotId: SlotId, contribution: SlotContribution) {
  const existing = slotMap.get(slotId) ?? [];
  const filtered = existing.filter(
    (e) => !(e.pluginId === pluginId && e.contribution.id === contribution.id),
  );

  const entry: RegisteredContribution = {
    pluginId,
    slotId,
    contribution,
    onClick: (context) => {
      const handler = clickHandlers.get(pluginId);
      handler?.(contribution.id, context);
    },
  };

  slotMap.set(slotId, [...filtered, entry]);
  notifyListeners(slotId);
}

export function unregisterContribution(pluginId: string, slotId: SlotId, contributionId: string) {
  const existing = slotMap.get(slotId) ?? [];
  slotMap.set(slotId, existing.filter(
    (e) => !(e.pluginId === pluginId && e.contribution.id === contributionId),
  ));
  notifyListeners(slotId);
}

export function unregisterAllForPlugin(pluginId: string) {
  for (const [slotId, entries] of slotMap) {
    const filtered = entries.filter((e) => e.pluginId !== pluginId);
    slotMap.set(slotId, filtered);
    notifyListeners(slotId);
  }
}

export function getContributions(slotId: SlotId): RegisteredContribution[] {
  return slotMap.get(slotId) ?? [];
}

export function subscribeToSlot(slotId: SlotId, listener: () => void): () => void {
  const set = listeners.get(slotId) ?? new Set();
  set.add(listener);
  listeners.set(slotId, set);
  return () => {
    set.delete(listener);
  };
}

function notifyListeners(slotId: SlotId) {
  listeners.get(slotId)?.forEach((fn) => fn());
}
