import type {
  Capability,
  EventFilter,
  PluginEventName,
  PluginEventPayload,
  PluginManifest,
  SlotContribution,
  SlotId,
} from '../types';
import { PluginRpcChannel } from '../rpc/channel';
import { PRISMA_SDK_SOURCE } from '../sdk/prisma-sdk-source';
import { checkCapability, checkEventCapability } from './capabilities';
import { registerTarget, unregisterTarget, subscribe, unsubscribe } from '../eventBus';
import { registerBeforeHook, unregisterBeforeHook, callBeforeMessageHook } from '../eventBus';
import {
  registerClickHandler,
  registerContribution,
  unregisterAllForPlugin,
  unregisterClickHandler,
  unregisterContribution,
} from '../slotRegistry';

const HANDLER_TIMEOUT_MS = 500;
const MAX_CONSECUTIVE_TIMEOUTS = 3;

export type HostApiHandlers = {
  sendMessage: (chatId: number, text: string) => Promise<void>;
  getActiveMessages: () => Promise<unknown[]>;
  getPluginStorage: (pluginId: string) => Promise<Record<string, unknown>>;
  setPluginStorage: (pluginId: string, key: string, value: unknown) => Promise<void>;
};

export class PluginHost {
  private iframe: HTMLIFrameElement;
  private channel: PluginRpcChannel;
  private manifest: PluginManifest;
  private grantedCapabilities: Capability[];
  private timeoutCounts = new Map<string, number>();
  private isDestroyed = false;
  private blobUrl?: string;

  constructor(
    manifest: PluginManifest,
    pluginUrl: string,
    grantedCapabilities: Capability[],
    apiHandlers: HostApiHandlers,
  ) {
    this.manifest = manifest;
    this.grantedCapabilities = grantedCapabilities;

    console.log('[PluginHost] constructor, pluginId:', this.manifest.id);
    registerBeforeHook(this.manifest.id, async (params) => {
      const result = await this.channel.call('beforeMessageSent', params);
      // Приводим к нужному типу
      const cancel = typeof result === 'object' && result !== null && 'cancel' in result 
        ? Boolean((result as { cancel?: boolean }).cancel) 
        : false;
      return { cancel };
    });

    this.iframe = this.createIframe(pluginUrl);
    // Blob-URL iframe is sandboxed → effective origin is always 'null'.
    // PluginRpcChannel allows 'null' and validates via window reference check.
    this.channel = new PluginRpcChannel(this.iframe, 'null', manifest.id);

    this.registerHandlers(apiHandlers);
    registerTarget(manifest.id, (name, data) => this.channel.pushEvent(name, data));
    registerClickHandler(manifest.id, (contributionId, context) => {
      this.channel.pushSlotClick('', contributionId, context);
    });

    document.body.appendChild(this.iframe);
    this.channel.sendReady(grantedCapabilities);
  }

  destroy() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.channel.destroy();
    unregisterTarget(this.manifest.id);
    unregisterClickHandler(this.manifest.id);
    unregisterAllForPlugin(this.manifest.id);
    this.iframe.remove();
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = undefined;
    }
    unregisterBeforeHook(this.manifest.id);
  }

  // Generates a sandboxed HTML wrapper that loads the plugin JS.
  // The SDK is injected inline before the plugin script — blob documents do not inherit
  // the parent page's CSP headers, so inline scripts are safe here.
  private createIframe(jsUrl: string): HTMLIFrameElement {
    const bustUrl = `${jsUrl}${jsUrl.includes('?')? '&' : '?'}_=${Date.now()}`;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><script>${PRISMA_SDK_SOURCE}</script><script src=${JSON.stringify(bustUrl)}></script></body></html>`;
    this.blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const iframe = document.createElement('iframe');
    iframe.src = this.blobUrl;
    iframe.sandbox.add('allow-scripts');
    iframe.style.cssText = 'display:none;width:0;height:0;border:0;position:absolute;';
    return iframe;
  }

  private registerHandlers(api: HostApiHandlers) {
    const { id } = this.manifest;

    this.channel.registerHandler('messages.send', async (params) => {
      this.requireCapability('messages.send');
      const [chatId, text] = params as [number, string];
      return this.withTimeout('messages.send', () => api.sendMessage(chatId, text));
    });

    this.channel.registerHandler('messages.getActive', async () => {
      this.requireCapability('messages.getActive');
      return this.withTimeout('messages.getActive', () => api.getActiveMessages());
    });

    this.channel.registerHandler('events.subscribe', async (params) => {
      const [eventName, filter] = params as [PluginEventName, EventFilter | undefined];
      if (!checkEventCapability(eventName, this.grantedCapabilities)) {
        throw new Error(`No capability for event: ${eventName}`);
      }
      subscribe(id, eventName, filter);
      return undefined;
    });

    this.channel.registerHandler('events.unsubscribe', async (params) => {
      const [eventName] = params as [PluginEventName];
      unsubscribe(id, eventName);
      return undefined;
    });

    this.channel.registerHandler('storage.get', async (params) => {
      this.requireCapability('storage.get');
      const [key] = params as [string];
      const storage = await api.getPluginStorage(id);
      return storage[key];
    });

    this.channel.registerHandler('storage.set', async (params) => {
      this.requireCapability('storage.set');
      const [key, value] = params as [string, unknown];
      return this.withTimeout('storage.set', () => api.setPluginStorage(id, key, value));
    });

    this.channel.registerHandler('storage.getAll', async () => {
      this.requireCapability('storage.getAll');
      return api.getPluginStorage(id);
    });

    this.channel.registerHandler('ui.registerSlot', async (params) => {
      this.requireCapability('ui.registerSlot');
      const [slotId, contribution] = params as [SlotId, SlotContribution];
      registerContribution(id, slotId, contribution);
      return undefined;
    });

    this.channel.registerHandler('ui.unregisterSlot', async (params) => {
      this.requireCapability('ui.unregisterSlot');
      const [slotId, contributionId] = params as [SlotId, string];
      unregisterContribution(id, slotId, contributionId);
      return undefined;
    });
  }

  private requireCapability(method: string) {
    const hasCapability = checkCapability(method as never, this.grantedCapabilities);
    if (!hasCapability) throw new Error(`Missing capability for: ${method}`);
  }

  private async withTimeout<T>(handlerKey: string, fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let didTimeout = false;

      const timer = setTimeout(() => {
        didTimeout = true;
        const count = (this.timeoutCounts.get(handlerKey) ?? 0) + 1;
        this.timeoutCounts.set(handlerKey, count);

        if (count >= MAX_CONSECUTIVE_TIMEOUTS) {
          // eslint-disable-next-line no-console
          console.warn(`[PluginHost] ${this.manifest.id}::${handlerKey} timed out ${count}x, disabling`);
          reject(new Error(`Handler disabled after ${count} timeouts`));
        } else {
          // eslint-disable-next-line no-console
          console.warn(`[PluginHost] ${this.manifest.id}::${handlerKey} exceeded ${HANDLER_TIMEOUT_MS}ms`);
          reject(new Error('Handler timeout'));
        }
      }, HANDLER_TIMEOUT_MS);

      fn().then((result) => {
        if (didTimeout) return;
        clearTimeout(timer);
        this.timeoutCounts.set(handlerKey, 0);
        resolve(result);
      }).catch((err) => {
        if (didTimeout) return;
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}
