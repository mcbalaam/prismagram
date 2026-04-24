import { PLUGINS_CONFIG_URL } from '../../../config';
import { fetchManifest, fetchRemoteConfig } from '../../../plugins/manifestFetcher';
import { addActionHandler, getGlobal } from '../../index';

addActionHandler('applyRemoteConfig', async (global, actions): Promise<void> => {
  const configUrl = global.plugins.isDevMode && global.plugins.devConfigUrl
    ? global.plugins.devConfigUrl
    : PLUGINS_CONFIG_URL;

  let entries;
  try {
    entries = await fetchRemoteConfig(configUrl);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.enabled) continue;

    let manifest;
    try {
      manifest = await fetchManifest(entry.source);
    } catch {
      continue;
    }

    global = getGlobal();
    actions.installPlugin({
      manifest,
      grantedCapabilities: entry.permissionsGranted,
      source: entry.source,
    });
  }
});
