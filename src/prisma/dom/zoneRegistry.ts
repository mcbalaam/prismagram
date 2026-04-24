type ZoneCallbacks = {
  onMount: (element: Element) => void;
  onUnmount: () => void;
};

const mountedZones = new Map<string, Element>();
const watchers = new Map<string, Set<ZoneCallbacks>>();

export function mountZone(name: string, element: Element) {
  mountedZones.set(name, element);
  watchers.get(name)?.forEach((w) => w.onMount(element));
}

export function unmountZone(name: string) {
  mountedZones.delete(name);
  watchers.get(name)?.forEach((w) => w.onUnmount());
}

export function watchZone(name: string, callbacks: ZoneCallbacks): () => void {
  const set = watchers.get(name) ?? new Set();
  set.add(callbacks);
  watchers.set(name, set);

  const el = mountedZones.get(name);
  if (el) callbacks.onMount(el);

  return () => {
    set.delete(callbacks);
  };
}

export function getZoneElement(name: string): Element | undefined {
  return mountedZones.get(name);
}
