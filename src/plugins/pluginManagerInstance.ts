import { MAIN_THREAD_ID } from '../api/types';
import { getActions, getGlobal, setGlobal } from '../global';
import type { HostApiHandlers } from './PluginHost';
import type { PluginManifest, PluginRecord } from './types';
import { PluginManager } from './PluginManager';

let manager: PluginManager | undefined;

function buildApiHandlers(): HostApiHandlers {
  return {
    async sendMessage(chatId, text) {
      const global = getGlobal();
      const chat = global.chats.byId[String(chatId)];
      if (!chat) throw new Error(`Chat ${chatId} not found`);

      getActions().sendMessage({
        messageList: { chatId: String(chatId), threadId: MAIN_THREAD_ID, type: 'thread' },
        text,
      });
    },

    async getActiveMessages() {
      const global = getGlobal();
      const tabState = Object.values(global.byTabId)[0];
      if (!tabState) return [];

      const { chatId } = tabState.messageLists?.[tabState.messageLists.length - 1] ?? {};
      if (!chatId) return [];

      const messages = global.messages.byChatId[chatId]?.byId;
      return messages ? Object.values(messages) : [];
    },

    async getPluginStorage(pluginId) {
      const global = getGlobal();
      return global.plugins.byId[pluginId]?.config ?? {};
    },

    async setPluginStorage(pluginId, key, value) {
      const global = getGlobal();
      const record = global.plugins.byId[pluginId];
      if (!record) return;

      const updatedRecord: PluginRecord = {
        ...record,
        config: { ...record.config, [key]: value },
      };
      const byId = { ...global.plugins.byId, [pluginId]: updatedRecord };
      setGlobal({ ...global, plugins: { ...global.plugins, byId } });
    },
  };
}

export function initPluginManager() {
  if (manager) {
    manager.destroyAll();
  }

  manager = new PluginManager({
    apiHandlers: buildApiHandlers(),
    resolvePluginUrl: (manifest: PluginManifest, source?: string) => {
      if (source) {
        const ghMatch = source.match(/^https?:\/\/github\.com\/([^/]+)\/([^/?#]+)/);
        if (ghMatch) {
          return `https://raw.githubusercontent.com/${ghMatch[1]}/${ghMatch[2]}/main/${manifest.entry}`;
        }
        const base = source.endsWith('.toml')
          ? source.slice(0, source.lastIndexOf('/'))
          : source.replace(/\/$/, '');
        return `${base}/${manifest.entry}`;
      }
      return `https://${manifest.id}.plugins.prismagram.app/${manifest.entry}`;
    },
    onStateChange: (byId) => {
      const global = getGlobal();
      // Merge manager state onto existing records so fields the manager doesn't
      // track (source, config) are preserved across notifyStateChange calls.
      const mergedById: Record<string, PluginRecord> = {};
      for (const [id, record] of Object.entries(byId)) {
        mergedById[id] = { ...global.plugins.byId[id], ...record };
      }
      setGlobal({ ...global, plugins: { ...global.plugins, byId: mergedById } });
    },
  });

  const global = getGlobal();
  for (const [pluginId, record] of Object.entries(global.plugins.byId)) {
    if (record.state === 'active' || record.state === 'loading') {
      void manager.loadPlugin(record.manifest, record.grantedCapabilities, record.source);
    }
  }
}

export function getPluginManager(): PluginManager {
  if (!manager) initPluginManager();
  return manager!;
}

export function destroyPluginManager() {
  manager?.destroyAll();
  manager = undefined;
}
