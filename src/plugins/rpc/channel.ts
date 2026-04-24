// src/plugins/rpc/channel.ts
import type {
  Capability,
  HostApiMethod,
  HostApiParams,
  HostToPluginMessage,
  PluginEventName,
  PluginEventPayload,
  PluginToHostMessage,
  RpcRequest,
  RpcSlotClick,
  SlotClickContext,
} from '../types';

let nextId = 0;
const generateId = () => `rpc_${++nextId}_${Date.now()}`;

type PendingCall = {
  resolve: (value: unknown) => void;
  reject: (reason: string) => void;
};

type MethodHandler = (params: unknown[], pluginId: string) => Promise<unknown>;

/**
 * Host-side RPC channel for one plugin iframe.
 * Receives requests from plugin, dispatches to registered handlers,
 * sends back responses. Also pushes events and can call plugin methods (bidirectional).
 */
export class PluginRpcChannel {
  private iframe: HTMLIFrameElement;
  private pluginOrigin: string;
  private pluginId: string;
  private handlers = new Map<string, MethodHandler>();
  private isReady = false;
  private pendingBeforeReady: HostToPluginMessage[] = [];
  private capabilities: Capability[] = [];

  // For host -> plugin calls
  private pendingCalls = new Map<string, PendingCall>();
  private nextCallId = 0;

  constructor(iframe: HTMLIFrameElement, pluginOrigin: string, pluginId: string) {
    this.iframe = iframe;
    this.pluginOrigin = pluginOrigin;
    this.pluginId = pluginId;
    window.addEventListener('message', this.handleMessage);
  }

  registerHandler(method: string, handler: MethodHandler) {
    this.handlers.set(method, handler);
  }

  /**
   * Call a method on the plugin and wait for response.
   * @param method - Plugin method name (e.g., 'beforeMessageSent')
   * @param params - Parameters to pass
   * @returns Promise resolving to plugin's response
   */
  public async call(method: string, ...params: unknown[]): Promise<unknown> {
    const id = `hostcall_${this.nextCallId++}_${Date.now()}`;
    const promise = new Promise((resolve, reject) => {
      this.pendingCalls.set(id, { resolve, reject });
    });

    const message: HostToPluginMessage = {
      type: 'rpc:request',
      id,
      method,
      params: params as unknown[],
    };
    this.post(message);

    return promise;
  }

  sendReady(capabilities: Capability[]) {
    this.capabilities = capabilities;
    this.isReady = true;
    this.post({ type: 'rpc:ready', capabilities, pluginId: this.pluginId });
    this.pendingBeforeReady.forEach((msg) => this.post(msg));
    this.pendingBeforeReady = [];
  }

  pushEvent(name: PluginEventName, data: PluginEventPayload) {
    this.post({ type: 'rpc:event', name, data });
  }

  pushSlotClick(slotId: string, contributionId: string, context?: SlotClickContext) {
    this.post({ type: 'rpc:slot:click', slotId, contributionId, context });
  }

  destroy() {
    window.removeEventListener('message', this.handleMessage);
  }

  private post(msg: HostToPluginMessage) {
    if (!this.isReady && msg.type !== 'rpc:ready') {
      this.pendingBeforeReady.push(msg);
      return;
    }
    // Use '*' because sandboxed iframes (allow-scripts without allow-same-origin)
    // have a null origin, so a specific target origin would throw SecurityError.
    this.iframe.contentWindow?.postMessage(msg, '*');
  }

  private handleMessage = async (event: MessageEvent) => {
    // Sandboxed iframes without allow-same-origin report origin as 'null'.
    if (event.origin !== this.pluginOrigin && event.origin !== 'null') return;
    if (!event.source || event.source !== this.iframe.contentWindow) return;

    const msg = event.data as PluginToHostMessage;

    // Handshake
    if (msg.type === 'rpc:handshake') {
      this.iframe.contentWindow?.postMessage(
        { type: 'rpc:ready', capabilities: this.capabilities, pluginId: this.pluginId } satisfies HostToPluginMessage,
        '*',
      );
      return;
    }

    // Response to a host-initiated request (plugin replies)
    if (msg.type === 'rpc:response') {
      const pending = this.pendingCalls.get(msg.id);
      if (pending) {
        this.pendingCalls.delete(msg.id);
        if (msg.error !== undefined) {
          pending.reject(msg.error);
        } else {
          pending.resolve(msg.result);
        }
      }
      return;
    }

    // Request from plugin (plugin calls host)
    if (msg.type === 'rpc:request') {
      const { id, method, params } = msg;
      const handler = this.handlers.get(method);

      if (!handler) {
        this.post({ type: 'rpc:response', id, error: `Unknown method: ${method}` });
        return;
      }

      try {
        const result = await handler(params as unknown[], this.pluginId);
        this.post({ type: 'rpc:response', id, result });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.post({ type: 'rpc:response', id, error: errorMsg });
      }
      return;
    }

    // Ignore other messages (e.g., unexpected rpc:event from plugin)
  };
}

/**
 * Plugin-side RPC client (runs inside the iframe).
 * Sends requests to host, waits for responses.
 * Also receives pushed events and host-to-plugin calls.
 */
export class PluginRpcClient {
  private hostOrigin: string;
  private pluginId: string;
  private pending = new Map<string, PendingCall>();
  private eventHandlers = new Map<string, Array<(data: PluginEventPayload) => void>>();
  private slotClickHandler?: (msg: RpcSlotClick) => void;
  private methodHandlers = new Map<string, (params: unknown[]) => Promise<unknown>>();
  private capabilities: Capability[] = [];
  private isReady = false;
  private readyResolvers: Array<() => void> = [];

  constructor(hostOrigin: string, pluginId: string) {
    this.hostOrigin = hostOrigin;
    this.pluginId = pluginId;
    window.addEventListener('message', this.handleMessage);
    window.parent.postMessage({ type: 'rpc:handshake', pluginId } satisfies PluginToHostMessage, hostOrigin);
  }

  async waitReady(): Promise<Capability[]> {
    if (this.isReady) return this.capabilities;
    return new Promise((resolve) => {
      this.readyResolvers.push(() => resolve(this.capabilities));
    });
  }

  async call<M extends HostApiMethod>(method: M, ...params: HostApiParams[M]): Promise<unknown> {
    const id = generateId();
    const msg: PluginToHostMessage = { type: 'rpc:request', id, method, params: params as unknown[] };
    window.parent.postMessage(msg, this.hostOrigin);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  /**
   * Register a handler for host-to-plugin method calls.
   * @param method - Method name (e.g., 'beforeMessageSent')
   * @param handler - Async function that receives parameters and returns result
   */
  registerHostHandler(method: string, handler: (params: unknown[]) => Promise<unknown>) {
    this.methodHandlers.set(method, handler);
  }

  on(eventName: PluginEventName, handler: (data: PluginEventPayload) => void) {
    const existing = this.eventHandlers.get(eventName) ?? [];
    existing.push(handler);
    this.eventHandlers.set(eventName, existing);
  }

  off(eventName: PluginEventName, handler: (data: PluginEventPayload) => void) {
    const existing = this.eventHandlers.get(eventName);
    if (!existing) return;
    this.eventHandlers.set(eventName, existing.filter((h) => h !== handler));
  }

  onSlotClick(handler: (msg: RpcSlotClick) => void) {
    this.slotClickHandler = handler;
  }

  private handleMessage = async (event: MessageEvent) => {
    if (event.origin !== this.hostOrigin) return;

    const msg = event.data as HostToPluginMessage;

    // Ready event
    if (msg.type === 'rpc:ready') {
      this.capabilities = msg.capabilities;
      this.isReady = true;
      this.readyResolvers.forEach((resolve) => resolve());
      this.readyResolvers = [];
      return;
    }

    // Host-initiated request (host calls plugin)
    if (msg.type === 'rpc:request') {
      const { id, method, params } = msg;
      const handler = this.methodHandlers.get(method);
      if (!handler) {
        window.parent.postMessage({
          type: 'rpc:response',
          id,
          error: `Unknown plugin method: ${method}`,
        } satisfies PluginToHostMessage, this.hostOrigin);
        return;
      }
      try {
        const result = await handler(params as unknown[]);
        window.parent.postMessage({
          type: 'rpc:response',
          id,
          result,
        } satisfies PluginToHostMessage, this.hostOrigin);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        window.parent.postMessage({
          type: 'rpc:response',
          id,
          error: errorMsg,
        } satisfies PluginToHostMessage, this.hostOrigin);
      }
      return;
    }

    // Response to a plugin-initiated request (host replies)
    if (msg.type === 'rpc:response') {
      const pending = this.pending.get(msg.id);
      if (pending) {
        this.pending.delete(msg.id);
        if (msg.error !== undefined) {
          pending.reject(msg.error);
        } else {
          pending.resolve(msg.result);
        }
      }
      return;
    }

    // Pushed events from host
    if (msg.type === 'rpc:event') {
      const handlers = this.eventHandlers.get(msg.name);
      handlers?.forEach((h) => h(msg.data));
      return;
    }

    // Slot click event
    if (msg.type === 'rpc:slot:click') {
      this.slotClickHandler?.(msg);
      return;
    }
  };
}