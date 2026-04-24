import type { DomEventName, PluginEventPayload } from '../types';
import type { PluginRpcChannel } from '../rpc/channel';
import { requestMutation } from '../../lib/fasterdom/fasterdom';
import { watchZone, getZoneElement } from './zoneRegistry';
import {
  ALLOWED_TAGS,
  ALLOWED_STYLE_PROPS,
  ALLOWED_EVENTS,
  sanitizeStyleValue,
  sanitizeCss,
  validateSelector,
} from './allowlists';

const CLASS_PREFIX = 'plugin-';

type HandleEntry = {
  element: Element;
  owned: boolean; // true = created by plugin, can be removed; false = zone element
  zone?: string;
};

type BoundListener = {
  element: Element;
  event: string;
  handler: EventListener;
};

export class DomProxy {
  private handles = new Map<string, HandleEntry>();
  private listeners = new Map<string, BoundListener>();
  private zoneUnwatchers = new Map<string, () => void>();
  private observers = new Map<string, MutationObserver>();
  private counter = 0;

  constructor(
    private readonly pluginId: string,
    private readonly pushEvent: (name: DomEventName, data: PluginEventPayload) => void,
  ) {}

  registerHandlers(channel: PluginRpcChannel) {
    channel.registerHandler('dom.watchZone', async (params) => {
      const [zone] = params as [string];
      this.watchZone(zone);
      return undefined;
    });

    channel.registerHandler('dom.query', async (params) => {
      const [zone, selector] = params as [string, string];
      return this.query(zone, selector);
    });

    channel.registerHandler('dom.queryAll', async (params) => {
      const [zone, selector] = params as [string, string];
      return this.queryAll(zone, selector);
    });

    channel.registerHandler('dom.createElement', async (params) => {
      const [tag, props] = params as [string, { text?: string; className?: string }];
      return this.createElement(tag, props);
    });

    channel.registerHandler('dom.setStyle', async (params) => {
      const [handleId, prop, value] = params as [string, string, string];
      this.setStyle(handleId, prop, value);
      return undefined;
    });

    channel.registerHandler('dom.addClass', async (params) => {
      const [handleId, className] = params as [string, string];
      this.addClass(handleId, className);
      return undefined;
    });

    channel.registerHandler('dom.setText', async (params) => {
      const [handleId, text] = params as [string, string];
      this.setText(handleId, text);
      return undefined;
    });

    channel.registerHandler('dom.appendChild', async (params) => {
      const [parentId, childId] = params as [string, string];
      this.appendChild(parentId, childId);
      return undefined;
    });

    channel.registerHandler('dom.insertBefore', async (params) => {
      const [refId, newId] = params as [string, string];
      this.insertBefore(refId, newId);
      return undefined;
    });

    channel.registerHandler('dom.remove', async (params) => {
      const [handleId] = params as [string];
      this.remove(handleId);
      return undefined;
    });

    channel.registerHandler('dom.on', async (params) => {
      const [handleId, event, listenerId] = params as [string, string, string];
      this.addListener(handleId, event, listenerId);
      return undefined;
    });

    channel.registerHandler('dom.observeSelector', async (params) => {
      const [zone, selector, observerId] = params as [string, string, string];
      this.observeSelector(zone, selector, observerId);
      return undefined;
    });

    channel.registerHandler('dom.injectStyle', async (params) => {
      const [css] = params as [string];
      return this.injectStyle(css);
    });
  }

  destroy() {
    for (const { element, event, handler } of this.listeners.values()) {
      element.removeEventListener(event, handler);
    }
    this.listeners.clear();

    for (const observer of this.observers.values()) {
      observer.disconnect();
    }
    this.observers.clear();

    for (const { element, owned } of this.handles.values()) {
      if (owned) element.remove();
    }
    this.handles.clear();

    for (const unwatch of this.zoneUnwatchers.values()) {
      unwatch();
    }
    this.zoneUnwatchers.clear();
  }

  private makeHandle(): string {
    return `h_${this.pluginId}_${++this.counter}_${Date.now()}`;
  }

  private storeHandle(element: Element, owned: boolean, zone?: string): string {
    const id = this.makeHandle();
    this.handles.set(id, { element, owned, zone });
    return id;
  }

  private getOrCreateHandle(element: Element, zone?: string): string {
    for (const [id, entry] of this.handles) {
      if (entry.element === element) return id;
    }
    return this.storeHandle(element, false, zone);
  }

  private getElement(handleId: string): Element | undefined {
    return this.handles.get(handleId)?.element;
  }

  private watchZone(zone: string) {
    if (this.zoneUnwatchers.has(zone)) return;

    const unwatch = watchZone(zone, {
      onMount: () => {
        this.pushEvent('dom:zone:mount', { zone });
      },
      onUnmount: () => {
        for (const [id, entry] of this.handles) {
          if (entry.zone !== zone) continue;
          if (entry.owned) entry.element.remove();
          this.handles.delete(id);
        }
        this.pushEvent('dom:zone:unmount', { zone });
      },
    });

    this.zoneUnwatchers.set(zone, unwatch);
  }

  private query(zone: string, selector: string): { handleId: string } | undefined {
    if (!validateSelector(selector)) return undefined;
    const root = getZoneElement(zone);
    if (!root) return undefined;
    const el = root.querySelector(selector);
    if (!el) return undefined;
    return { handleId: this.storeHandle(el, false, zone) };
  }

  private queryAll(zone: string, selector: string): { handleIds: string[] } {
    if (!validateSelector(selector)) return { handleIds: [] };
    const root = getZoneElement(zone);
    if (!root) return { handleIds: [] };
    const handleIds = Array.from(root.querySelectorAll(selector)).map(
      (el) => this.storeHandle(el, false, zone),
    );
    return { handleIds };
  }

  private createElement(
    tag: string,
    props: { text?: string; className?: string },
  ): { handleId: string } | undefined {
    if (!ALLOWED_TAGS.has(tag)) return undefined;
    const el = document.createElement(tag);
    if (props.text) el.textContent = props.text;
    if (props.className) {
      el.className = `${CLASS_PREFIX}${this.pluginId}-${props.className}`;
    }
    return { handleId: this.storeHandle(el, true) };
  }

  private setStyle(handleId: string, prop: string, value: string) {
    if (!ALLOWED_STYLE_PROPS.has(prop)) return;
    const sanitized = sanitizeStyleValue(value);
    if (sanitized === undefined) return;
    const el = this.getElement(handleId);
    if (!(el instanceof HTMLElement)) return;
    requestMutation(() => {
      el.style.setProperty(prop, sanitized);
    });
  }

  private addClass(handleId: string, className: string) {
    const el = this.getElement(handleId);
    if (!el) return;
    const prefixed = `${CLASS_PREFIX}${this.pluginId}-${className}`;
    requestMutation(() => {
      el.classList.add(prefixed);
    });
  }

  private setText(handleId: string, text: string) {
    const el = this.getElement(handleId);
    if (!el) return;
    requestMutation(() => {
      el.textContent = text;
    });
  }

  private appendChild(parentId: string, childId: string) {
    const parent = this.getElement(parentId);
    const child = this.getElement(childId);
    if (!parent || !child) return;
    if (!this.handles.get(childId)?.owned) return;
    requestMutation(() => {
      parent.appendChild(child);
    });
  }

  private insertBefore(refId: string, newId: string) {
    const ref = this.getElement(refId);
    const newEl = this.getElement(newId);
    if (!ref || !newEl || !ref.parentElement) return;
    if (!this.handles.get(newId)?.owned) return;
    requestMutation(() => {
      ref.parentElement!.insertBefore(newEl, ref);
    });
  }

  private remove(handleId: string) {
    const entry = this.handles.get(handleId);
    if (!entry?.owned) return;
    requestMutation(() => {
      entry.element.remove();
    });
    this.handles.delete(handleId);
  }

  private observeSelector(zone: string, selector: string, observerId: string) {
    if (!validateSelector(selector)) return;
    const root = getZoneElement(zone);
    if (!root) return;

    const notify = (el: Element) => {
      const handleId = this.getOrCreateHandle(el, zone);
      this.pushEvent('dom:observer:match', { observerId, handleId });
    };

    // Notify for already-present matches
    root.querySelectorAll(selector).forEach(notify);

    const observer = new MutationObserver((mutations) => {
      const seen = new Set<Element>();
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof Element)) continue;
          const matches: Element[] = node.matches(selector) ? [node] : [];
          node.querySelectorAll(selector).forEach((el) => matches.push(el));
          for (const el of matches) {
            if (seen.has(el)) continue;
            seen.add(el);
            notify(el);
          }
        }
      }
    });

    observer.observe(root, { childList: true, subtree: true });
    this.observers.set(observerId, observer);
  }

  private injectStyle(css: string): { handleId: string } | undefined {
    const sanitized = sanitizeCss(css);
    if (sanitized === undefined) return undefined;
    const el = document.createElement('style');
    el.textContent = sanitized;
    document.head.appendChild(el);
    return { handleId: this.storeHandle(el, true) };
  }

  private addListener(handleId: string, event: string, listenerId: string) {
    if (!ALLOWED_EVENTS.has(event)) return;
    const el = this.getElement(handleId);
    if (!el) return;
    const handler = (e: Event) => {
      this.pushEvent('dom:event', { listenerId, type: e.type });
    };
    el.addEventListener(event, handler as EventListener);
    this.listeners.set(listenerId, { element: el, event, handler: handler as EventListener });
  }
}
