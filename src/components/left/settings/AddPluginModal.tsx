import { memo, useState } from '../../../lib/teact/teact';
import { getActions } from '../../../global';

import type { Capability, PluginManifest } from '../../../prisma/types';
import { fetchManifest } from '../../../prisma/plugins/manifestFetcher';

import useFlag from '../../../hooks/useFlag';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import Button from '../../ui/Button';
import Checkbox from '../../ui/Checkbox';
import InputText from '../../ui/InputText';
import Modal from '../../ui/Modal';

import styles from './AddPluginModal.module.scss';

type OwnProps = {
  isOpen: boolean;
  onClose: NoneToVoidFunction;
};

const AddPluginModal = ({ isOpen, onClose }: OwnProps) => {
  const { installPlugin } = getActions();
  const lang = useLang();

  const [url, setUrl] = useState('');
  const [manifest, setManifest] = useState<PluginManifest | undefined>();
  const [fetchError, setFetchError] = useState<string | undefined>();
  const [isFetching, startFetching, stopFetching] = useFlag();
  const [optionalGranted, setOptionalGranted] = useState<Set<string>>(new Set());

  const handleClose = useLastCallback(() => {
    setUrl('');
    setManifest(undefined);
    setFetchError(undefined);
    setOptionalGranted(new Set());
    onClose();
  });

  const handleUrlChange = useLastCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    setManifest(undefined);
    setFetchError(undefined);
  });

  const handleFetch = useLastCallback(async () => {
    if (!url.trim()) return;
    startFetching();
    setFetchError(undefined);
    setManifest(undefined);
    try {
      const result = await fetchManifest(url.trim());
      setManifest(result);
      setOptionalGranted(new Set());
    } catch (err) {
      setFetchError((err as Error).message || 'Unknown error');
    }
    stopFetching();
  });

  const handleUrlKeyDown = useLastCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void handleFetch();
  });

  const handleOptionalToggle = useLastCallback((cap: string, checked: boolean) => {
    setOptionalGranted((prev) => {
      const next = new Set(prev);
      if (checked) next.add(cap);
      else next.delete(cap);
      return next;
    });
  });

  const handleInstall = useLastCallback(() => {
    if (!manifest) return;
    const grantedCapabilities: Capability[] = [
      ...manifest.permissions.required,
      ...manifest.permissions.optional.filter((c) => optionalGranted.has(c)),
    ] as Capability[];
    installPlugin({ manifest, grantedCapabilities, source: url.trim() });
    handleClose();
  });

  return (
    <Modal
      title={lang('SettingsPluginsAddTitle')}
      isOpen={isOpen}
      onClose={handleClose}
    >
      <div className={styles.body}>
        <InputText
          label={lang('SettingsPluginsAddUrl')}
          value={url}
          onChange={handleUrlChange}
          onKeyDown={handleUrlKeyDown}
          error={fetchError ? lang('SettingsPluginsAddFetchError', { error: fetchError }) : undefined}
        />
        {!manifest && (
          <Button
            onClick={handleFetch}
            isLoading={isFetching}
            disabled={!url.trim()}
          >
            {lang('SettingsPluginsAddFetch')}
          </Button>
        )}

        {manifest && (
          <div className={styles.manifest}>
            <h4 className={styles.pluginName}>{manifest.name}</h4>
            <p className={styles.pluginMeta}>
              {lang('SettingsPluginBy', { author: manifest.author })}
              {' · '}
              {lang('SettingsPluginVersion', { version: manifest.version })}
            </p>
            {manifest.description && (
              <p className={styles.pluginDesc}>{manifest.description}</p>
            )}

            {manifest.permissions.required.length > 0 && (
              <div className={styles.permSection}>
                <p className={styles.permTitle}>{lang('SettingsPluginsAddPermRequired')}</p>
                {manifest.permissions.required.map((cap) => (
                  <p key={cap} className={styles.permItem}>{cap}</p>
                ))}
              </div>
            )}

            {manifest.permissions.optional.length > 0 && (
              <div className={styles.permSection}>
                <p className={styles.permTitle}>{lang('SettingsPluginsAddPermOptional')}</p>
                {manifest.permissions.optional.map((cap) => (
                  <Checkbox
                    key={cap}
                    label={cap}
                    checked={optionalGranted.has(cap)}
                    onCheck={(checked) => handleOptionalToggle(cap, checked)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <Button isText onClick={handleClose}>{lang('SettingsPluginsAddCancel')}</Button>
        {manifest && (
          <Button onClick={handleInstall}>{lang('SettingsPluginsAddInstall')}</Button>
        )}
      </div>
    </Modal>
  );
};

export default memo(AddPluginModal);
