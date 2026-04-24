import type { Capability, PluginManifest } from './types';
import { parseToml } from './tomlParser';

export type RemotePluginEntry = {
  id: string;
  source: string;
  version?: string;
  enabled: boolean;
  permissionsGranted: Capability[];
};

function resolveManifestUrl(input: string): string {
  const ghMatch = input.match(/^https?:\/\/github\.com\/([^/]+)\/([^/?#]+)/);
  if (ghMatch) {
    return `https://raw.githubusercontent.com/${ghMatch[1]}/${ghMatch[2]}/main/meta.toml`;
  }
  if (input.endsWith('.toml')) return input;
  return `${input.replace(/\/$/, '')}/meta.toml`;
}

export async function fetchManifest(url: string): Promise<PluginManifest> {
  const manifestUrl = resolveManifestUrl(url);
  const resp = await fetch(manifestUrl);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const parsed = parseToml(await resp.text());

  const plugin = parsed['plugin'] as Record<string, string> | undefined;
  const perms = parsed['permissions'] as Record<string, unknown> | undefined;

  if (!plugin?.id || !plugin?.name) throw new Error('Missing required manifest fields');

  return {
    id: plugin.id,
    name: plugin.name,
    version: plugin.version || '0.0.0',
    apiVersion: plugin.api_version || '1',
    author: plugin.author || '',
    description: plugin.description || '',
    entry: plugin.entry || 'plugin.js',
    permissions: {
      required: ((perms?.required as string[] | undefined) ?? []) as Capability[],
      optional: ((perms?.optional as string[] | undefined) ?? []) as Capability[],
    },
  };
}

export async function fetchRemoteConfig(configUrl: string): Promise<RemotePluginEntry[]> {
  const resp = await fetch(configUrl);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const parsed = parseToml(await resp.text());
  const raw = parsed['plugins'];
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => ({
      id: String(entry.id ?? ''),
      source: String(entry.source ?? ''),
      version: entry.version !== undefined ? String(entry.version) : undefined,
      enabled: Boolean(entry.enabled ?? true),
      permissionsGranted: (
        Array.isArray(entry.permissions_granted) ? entry.permissions_granted : []
      ) as Capability[],
    }))
    .filter((e) => e.id && e.source);
}
