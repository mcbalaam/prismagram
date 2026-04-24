import { memo } from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import type { PluginRecord } from '../../../plugins/types';

import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import Button from '../../ui/Button';
import ListItem from '../../ui/ListItem';

import styles from './SettingsPluginDetails.module.scss';

type OwnProps = {
  isActive?: boolean;
  pluginId: string;
  onReset: () => void;
};

type StateProps = {
  record?: PluginRecord;
};

const SettingsPluginDetails = ({
  isActive,
  pluginId,
  record,
  onReset,
}: OwnProps & StateProps) => {
  const { loadPlugin, unloadPlugin } = getActions();
  const lang = useLang();

  useHistoryBack({ isActive, onBack: onReset });

  const handleToggle = useLastCallback(() => {
    if (record?.state === 'active') {
      unloadPlugin({ pluginId });
    } else {
      loadPlugin({ pluginId });
    }
  });

  if (!record) return undefined;

  const { manifest, state, grantedCapabilities, error } = record;
  const isCurrentlyActive = state === 'active';

  return (
    <div className="settings-content custom-scroll">
      <div className={styles.header}>
        <p className={styles.description}>{manifest.description}</p>
        <p className={styles.meta}>
          {lang('SettingsPluginVersion', { version: manifest.version })}
          {' · '}
          {lang('SettingsPluginBy', { author: manifest.author })}
        </p>
        {error && (
          <p className={styles.error}>{error}</p>
        )}
      </div>

      <div className="settings-item">
        <ListItem
          narrow
          icon={isCurrentlyActive ? 'stop' : 'play'}
          onClick={handleToggle}
        >
          {lang(isCurrentlyActive ? 'SettingsPluginDisable' : 'SettingsPluginEnable')}
        </ListItem>
      </div>

      <div className="settings-item">
        <h4 className={styles.sectionTitle}>{lang('SettingsPluginPermissions')}</h4>
        {!grantedCapabilities.length && (
          <p className={styles.noPermissions}>{lang('SettingsPluginNoPermissions')}</p>
        )}
        {grantedCapabilities.map((cap) => (
          <div key={cap} className={styles.permission}>
            <span>{cap}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default memo(withGlobal<OwnProps>((global, { pluginId }): StateProps => ({
  record: global.plugins.byId[pluginId],
}))(SettingsPluginDetails));
