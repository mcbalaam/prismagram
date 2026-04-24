import { memo, useState } from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import type { PluginRecord } from '../../../plugins/types';
import { SettingsScreens } from '../../../types';

import useFlag from '../../../hooks/useFlag';
import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import Button from '../../ui/Button';
import Checkbox from '../../ui/Checkbox';
import InputText from '../../ui/InputText';
import Switcher from '../../ui/Switcher';
import AddPluginModal from './AddPluginModal';

import styles from './SettingsPlugins.module.scss';

type OwnProps = {
  isActive?: boolean;
  onReset: () => void;
  onSelectPlugin: (pluginId: string) => void;
};

type StateProps = {
  pluginsById: Record<string, PluginRecord>;
  isDevMode: boolean;
  devConfigUrl?: string;
};

const SettingsPlugins = ({
  isActive,
  pluginsById,
  isDevMode,
  devConfigUrl,
  onReset,
  onSelectPlugin,
}: OwnProps & StateProps) => {
  const {
    openSettingsScreen, setPluginDevMode, loadPlugin, unloadPlugin,
    setPluginsDevConfigUrl, applyRemoteConfig, removePlugin,
  } = getActions();
  const lang = useLang();

  const [isAddModalOpen, openAddModal, closeAddModal] = useFlag();
  const [configUrlInput, setConfigUrlInput] = useState(devConfigUrl ?? '');

  useHistoryBack({ isActive, onBack: onReset });

  const handleDevModeChange = useLastCallback((checked: boolean) => {
    setPluginDevMode({ isDevMode: checked });
  });

  const handlePluginClick = useLastCallback((pluginId: string) => {
    onSelectPlugin(pluginId);
    openSettingsScreen({ screen: SettingsScreens.PluginDetails });
  });

  const handleTogglePlugin = useLastCallback((pluginId: string, isCurrentlyActive: boolean) => {
    if (isCurrentlyActive) {
      unloadPlugin({ pluginId });
    } else {
      loadPlugin({ pluginId });
    }
  });

  const handleConfigUrlChange = useLastCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setConfigUrlInput(e.target.value);
  });

  const handleConfigUrlBlur = useLastCallback(() => {
    setPluginsDevConfigUrl({ url: configUrlInput });
  });

  const handleApplyRemoteConfig = useLastCallback(() => {
    applyRemoteConfig(undefined);
  });

  const handleRemovePlugin = useLastCallback((pluginId: string) => {
    removePlugin({ pluginId });
  });

  const plugins = Object.values(pluginsById);

  return (
    <div className="settings-content custom-scroll">
      <div className="settings-item pt-3">
        <Checkbox
          label={lang('SettingsPluginsDevMode')}
          subLabel={lang('SettingsPluginsDevModeHint')}
          checked={isDevMode}
          onCheck={handleDevModeChange}
        />
      </div>

      {isDevMode && (
        <div className="settings-item">
          <InputText
            label={lang('SettingsPluginsDevConfigUrl')}
            value={configUrlInput}
            onChange={handleConfigUrlChange}
            onBlur={handleConfigUrlBlur}
          />
          <p className={styles.hint}>{lang('SettingsPluginsDevConfigUrlHint')}</p>
        </div>
      )}

      <div className={styles.actions}>
        <Button onClick={handleApplyRemoteConfig} size="smaller" color="secondary">
          {lang('SettingsPluginsUseRemoteConfig')}
        </Button>
        <Button onClick={openAddModal} size="smaller">
          {lang('SettingsPluginsAdd')}
        </Button>
      </div>

      {!plugins.length && (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{lang('SettingsPluginsNoPlugins')}</p>
          <p className={styles.emptyHint}>{lang('SettingsPluginsNoPluginsHint')}</p>
        </div>
      )}

      {plugins.length > 0 && (
        <div className="settings-item">
          {plugins.map((record) => {
            const isCurrentlyActive = record.state === 'active';
            return (
              <div key={record.manifest.id} className={styles.pluginRow}>
                <div
                  className={styles.pluginInfo}
                  role="button"
                  tabIndex={0}
                  onClick={() => handlePluginClick(record.manifest.id)}
                >
                  <span className={styles.pluginName}>{record.manifest.name}</span>
                  <span className={styles.pluginMeta}>
                    {record.manifest.author}
                    {record.state !== 'active' && record.state !== 'inactive' && (
                      <span className={styles.stateLabel} data-state={record.state}>
                        {' · '}
                        {lang(record.state === 'error' ? 'SettingsPluginsError' : 'SettingsPluginsLoading' as never)}
                      </span>
                    )}
                  </span>
                </div>
                <div className={styles.switcherWrap}>
                  <Switcher
                    id={`plugin-toggle-${record.manifest.id}`}
                    label={record.manifest.name}
                    checked={isCurrentlyActive}
                    onCheck={() => handleTogglePlugin(record.manifest.id, isCurrentlyActive)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddPluginModal isOpen={isAddModalOpen} onClose={closeAddModal} />
    </div>
  );
};

export default memo(withGlobal<OwnProps>((global): StateProps => ({
  pluginsById: global.plugins.byId,
  isDevMode: global.plugins.isDevMode,
  devConfigUrl: global.plugins.devConfigUrl,
}))(SettingsPlugins));
