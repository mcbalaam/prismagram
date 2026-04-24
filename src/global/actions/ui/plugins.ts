import type { ActionReturnType, GlobalState } from '../../types';

import { addCallback } from '../../../lib/teact/teactn';
import { addActionHandler, getGlobal, setGlobal } from '../../index';
import { selectCurrentMessageList } from '../../selectors';
import { broadcastUiEvent } from '../../../prisma/eventBus';
import { getPluginManager } from '../../../prisma/plugins/pluginManagerInstance';

let prevChatIdByTabId: Record<number, string | undefined> = {};

addCallback((global: GlobalState) => {
  for (const tabState of Object.values(global.byTabId)) {
    const tabId = tabState.id;
    const currentList = selectCurrentMessageList(global, tabId);
    const currentChatId = currentList?.chatId;
    const prevChatId = prevChatIdByTabId[tabId];

    if (currentChatId !== prevChatId) {
      if (currentChatId) {
        broadcastUiEvent('ui:chat:opened', { chatId: Number(currentChatId) });
      } else if (prevChatId) {
        broadcastUiEvent('ui:chat:closed', { chatId: Number(prevChatId) });
      }
    }

    prevChatIdByTabId[tabId] = currentChatId;
  }
});

addActionHandler('updatePluginRecords', (global, actions, { byId }): ActionReturnType => {
  return {
    ...global,
    plugins: {
      ...global.plugins,
      byId,
    },
  };
});

addActionHandler('setPluginDevMode', (global, actions, { isDevMode }): ActionReturnType => {
  return {
    ...global,
    plugins: {
      ...global.plugins,
      isDevMode,
    },
  };
});

addActionHandler('loadPlugin', (global, actions, { pluginId }): ActionReturnType => {
  const record = global.plugins.byId[pluginId];
  if (!record) return;

  // Fall back to required permissions for records installed before the permissions fix.
  const grantedCapabilities = record.grantedCapabilities.length > 0
    ? record.grantedCapabilities
    : record.manifest.permissions.required;

  void getPluginManager().loadPlugin(record.manifest, grantedCapabilities, record.source);
});

addActionHandler('unloadPlugin', (global, actions, { pluginId }): ActionReturnType => {
  getPluginManager().unloadPlugin(pluginId);
});

addActionHandler('installPlugin', (global, actions, { manifest, grantedCapabilities, source }): ActionReturnType => {
  // Seed the record so the plugin row appears immediately; manager's notifyStateChange
  // will overwrite state as it progresses (loading → active / error).
  const seeded: GlobalState = {
    ...global,
    plugins: {
      ...global.plugins,
      byId: {
        ...global.plugins.byId,
        [manifest.id]: {
          manifest,
          state: 'inactive',
          grantedCapabilities,
          source,
        },
      },
    },
  };
  setGlobal(seeded);
  void getPluginManager().loadPlugin(manifest, grantedCapabilities, source);
  // Return void so Teactn doesn't overwrite the manager's state updates.
});

addActionHandler('removePlugin', (global, actions, { pluginId }): ActionReturnType => {
  getPluginManager().removePlugin(pluginId);
  const byId = { ...global.plugins.byId };
  delete byId[pluginId];
  return {
    ...global,
    plugins: { ...global.plugins, byId },
  };
});

addActionHandler('setPluginsDevConfigUrl', (global, actions, { url }): ActionReturnType => {
  return {
    ...global,
    plugins: { ...global.plugins, devConfigUrl: url },
  };
});

