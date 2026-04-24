import type { Capability, PluginManifest, PluginRecord } from './types';
import type { HostApiHandlers } from './PluginHost';
import { PluginHost } from './PluginHost';
import { resolveGrantedCapabilities } from './capabilities';

type PluginEntry = {
  record: PluginRecord;
  host?: PluginHost;
};

type PluginManagerOptions = {
  apiHandlers: HostApiHandlers;
  // source is passed directly so resolvePluginUrl never needs to read from global state
  resolvePluginUrl: (manifest: PluginManifest, source?: string) => string;
  onStateChange: (plugins: Record<string, PluginRecord>) => void;
};

export class PluginManager {
  private plugins = new Map<string, PluginEntry>();
  private options: PluginManagerOptions;

  constructor(options: PluginManagerOptions) {
    this.options = options;
  }

  async loadPlugin(
    manifest: PluginManifest,
    userGrantedCapabilities: Capability[],
    source?: string,
  ): Promise<void> {
    const { id } = manifest;
    const existing = this.plugins.get(id);

    if (existing?.record.state === 'active' || existing?.record.state === 'loading') return;

    if (existing?.host) {
      existing.host.destroy();
      existing.host = undefined;
    }

    // Resolve source from parameter or existing entry. Store it immediately so all
    // subsequent setPluginState calls preserve it via existing?.record.source.
    const resolvedSource = source ?? existing?.record.source;
    this.plugins.set(id, {
      host: undefined,
      record: {
        manifest,
        state: 'inactive',
        grantedCapabilities: userGrantedCapabilities,
        source: resolvedSource,
        config: existing?.record.config,
      },
    });

    const grantedCapabilities = resolveGrantedCapabilities(
      manifest.permissions.required,
      manifest.permissions.optional,
      userGrantedCapabilities,
    );

    const missingRequired = manifest.permissions.required.filter(
      (cap) => !grantedCapabilities.includes(cap),
    );

    if (missingRequired.length > 0) {
      this.setPluginState(manifest, grantedCapabilities, 'inactive', 'Missing required permissions');
      return;
    }

    // Resolve URL with explicit source — no global state reads needed.
    let pluginUrl: string;
    try {
      pluginUrl = this.options.resolvePluginUrl(manifest, resolvedSource);
      this.validatePluginUrl(pluginUrl);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.setPluginState(manifest, grantedCapabilities, 'error', errorMsg);
      return;
    }

    this.setPluginState(manifest, grantedCapabilities, 'loading');

    try {
      const host = new PluginHost(manifest, pluginUrl, grantedCapabilities, this.options.apiHandlers);
      const entry = this.plugins.get(id);
      if (entry) {
        entry.host = host;
        entry.record = { ...entry.record, state: 'active' };
      }
      this.notifyStateChange();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.setPluginState(manifest, grantedCapabilities, 'error', errorMsg);
    }
  }

  removePlugin(pluginId: string): void {
    this.unloadPlugin(pluginId);
    this.plugins.delete(pluginId);
    this.notifyStateChange();
  }

  unloadPlugin(pluginId: string): void {
    const entry = this.plugins.get(pluginId);
    if (!entry) return;

    entry.host?.destroy();
    entry.host = undefined;
    entry.record = { ...entry.record, state: 'inactive' };
    this.notifyStateChange();
  }

  destroyAll(): void {
    for (const [id] of this.plugins) {
      this.unloadPlugin(id);
    }
    this.plugins.clear();
    this.notifyStateChange();
  }

  getPluginRecord(pluginId: string): PluginRecord | undefined {
    return this.plugins.get(pluginId)?.record;
  }

  getAllRecords(): Record<string, PluginRecord> {
    const result: Record<string, PluginRecord> = {};
    for (const [id, entry] of this.plugins) {
      result[id] = entry.record;
    }
    return result;
  }

  private setPluginState(
    manifest: PluginManifest,
    grantedCapabilities: Capability[],
    state: PluginRecord['state'],
    error?: string,
  ): void {
    const { id } = manifest;
    const existing = this.plugins.get(id);
    const record: PluginRecord = {
      source: existing?.record.source,
      config: existing?.record.config,
      manifest,
      state,
      grantedCapabilities,
      error,
    };

    if (existing) {
      existing.record = record;
    } else {
      this.plugins.set(id, { record });
    }

    this.notifyStateChange();
  }

  private validatePluginUrl(url: string): void {
    new URL(url); // throws if malformed
  }

  private notifyStateChange(): void {
    this.options.onStateChange(this.getAllRecords());
  }
}
