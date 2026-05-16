import { useState } from 'react';

import { SUPPORTED_LANGUAGES, useI18n } from '../i18n.js';
import { isSoundEnabled, setSoundEnabled } from '../notificationSound.js';
import { vscode } from '../vscodeApi.js';
import { Button } from './ui/Button.js';
import { Checkbox } from './ui/Checkbox.js';
import { MenuItem } from './ui/MenuItem.js';
import { Modal } from './ui/Modal.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDebugMode: boolean;
  onToggleDebugMode: () => void;
  alwaysShowOverlay: boolean;
  onToggleAlwaysShowOverlay: () => void;
  externalAssetDirectories: string[];
  watchAllSessions: boolean;
  onToggleWatchAllSessions: () => void;
  hooksEnabled: boolean;
  onToggleHooksEnabled: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  isDebugMode,
  onToggleDebugMode,
  alwaysShowOverlay,
  onToggleAlwaysShowOverlay,
  externalAssetDirectories,
  watchAllSessions,
  onToggleWatchAllSessions,
  hooksEnabled,
  onToggleHooksEnabled,
}: SettingsModalProps) {
  const { language, setLanguage, t } = useI18n();
  const [soundLocal, setSoundLocal] = useState(isSoundEnabled);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('settings.title')}>
      <div className="flex items-center justify-between w-full py-6 px-10 gap-10">
        <span>{t('language.label')}</span>
        <div className="flex gap-3">
          {SUPPORTED_LANGUAGES.map((item) => (
            <Button
              key={item}
              variant={language === item ? 'active' : 'ghost'}
              size="sm"
              onClick={() => setLanguage(item)}
            >
              {item === 'zh' ? t('language.chinese') : t('language.english')}
            </Button>
          ))}
        </div>
      </div>
      <MenuItem
        onClick={() => {
          vscode.postMessage({ type: 'openSessionsFolder' });
          onClose();
        }}
      >
        {t('settings.openSessionsFolder')}
      </MenuItem>
      <MenuItem
        onClick={() => {
          vscode.postMessage({ type: 'exportLayout' });
          onClose();
        }}
      >
        {t('settings.exportLayout')}
      </MenuItem>
      <MenuItem
        onClick={() => {
          vscode.postMessage({ type: 'importLayout' });
          onClose();
        }}
      >
        {t('settings.importLayout')}
      </MenuItem>
      <MenuItem
        onClick={() => {
          vscode.postMessage({ type: 'addExternalAssetDirectory' });
          onClose();
        }}
      >
        {t('settings.addAssetDirectory')}
      </MenuItem>
      {externalAssetDirectories.map((dir) => (
        <div key={dir} className="flex items-center justify-between py-4 px-10 gap-8">
          <span
            className="text-xs text-text-muted overflow-hidden text-ellipsis whitespace-nowrap"
            title={dir}
          >
            {dir.split(/[/\\]/).pop() ?? dir}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => vscode.postMessage({ type: 'removeExternalAssetDirectory', path: dir })}
            className="shrink-0"
            title={t('settings.removeAssetDirectory')}
          >
            x
          </Button>
        </div>
      ))}
      <Checkbox
        label={t('settings.soundNotifications')}
        checked={soundLocal}
        onChange={() => {
          const newVal = !isSoundEnabled();
          setSoundEnabled(newVal);
          setSoundLocal(newVal);
          vscode.postMessage({ type: 'setSoundEnabled', enabled: newVal });
        }}
      />
      <Checkbox
        label={t('settings.watchAllSessions')}
        checked={watchAllSessions}
        onChange={onToggleWatchAllSessions}
      />
      <Checkbox
        label={t('settings.instantDetection')}
        checked={hooksEnabled}
        onChange={onToggleHooksEnabled}
      />
      <Checkbox
        label={t('settings.alwaysShowLabels')}
        checked={alwaysShowOverlay}
        onChange={onToggleAlwaysShowOverlay}
      />
      <Checkbox label={t('settings.debugView')} checked={isDebugMode} onChange={onToggleDebugMode} />
    </Modal>
  );
}
