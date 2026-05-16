import { useEffect, useRef, useState } from 'react';

import type { WorkspaceFolder } from '../hooks/useExtensionMessages.js';
import { useI18n } from '../i18n.js';
import { vscode } from '../vscodeApi.js';
import { Button } from './ui/Button.js';
import { Dropdown, DropdownItem } from './ui/Dropdown.js';

interface BottomToolbarProps {
  isEditMode: boolean;
  onOpenClaude: () => void;
  onOpenCodex: () => void;
  onToggleEditMode: () => void;
  isSettingsOpen: boolean;
  onToggleSettings: () => void;
  workspaceFolders: WorkspaceFolder[];
}

export function BottomToolbar({
  isEditMode,
  onOpenClaude,
  onOpenCodex,
  onToggleEditMode,
  isSettingsOpen,
  onToggleSettings,
  workspaceFolders,
}: BottomToolbarProps) {
  const { t } = useI18n();
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [isBypassMenuOpen, setIsBypassMenuOpen] = useState(false);
  const folderPickerRef = useRef<HTMLDivElement>(null);
  const pendingBypassRef = useRef(false);

  useEffect(() => {
    if (!isFolderPickerOpen && !isBypassMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (folderPickerRef.current && !folderPickerRef.current.contains(e.target as Node)) {
        setIsFolderPickerOpen(false);
        setIsBypassMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isFolderPickerOpen, isBypassMenuOpen]);

  const hasMultipleFolders = workspaceFolders.length > 1;

  const handleAgentClick = () => {
    setIsBypassMenuOpen(false);
    pendingBypassRef.current = false;
    if (hasMultipleFolders) {
      setIsFolderPickerOpen((v) => !v);
    } else {
      onOpenClaude();
    }
  };

  const handleAgentHover = () => {
    if (!isFolderPickerOpen) {
      setIsBypassMenuOpen(true);
    }
  };

  const handleAgentLeave = () => {
    if (!isFolderPickerOpen) {
      setIsBypassMenuOpen(false);
    }
  };

  const handleFolderSelect = (folder: WorkspaceFolder) => {
    setIsFolderPickerOpen(false);
    const bypassPermissions = pendingBypassRef.current;
    pendingBypassRef.current = false;
    vscode.postMessage({ type: 'openClaude', folderPath: folder.path, bypassPermissions });
  };

  const handleBypassSelect = (bypassPermissions: boolean) => {
    setIsBypassMenuOpen(false);
    if (hasMultipleFolders) {
      pendingBypassRef.current = bypassPermissions;
      setIsFolderPickerOpen(true);
    } else {
      vscode.postMessage({ type: 'openClaude', bypassPermissions });
    }
  };

  const [isCodexFolderPickerOpen, setIsCodexFolderPickerOpen] = useState(false);
  const codexFolderPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isCodexFolderPickerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (codexFolderPickerRef.current && !codexFolderPickerRef.current.contains(e.target as Node)) {
        setIsCodexFolderPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isCodexFolderPickerOpen]);

  const handleCodexClick = () => {
    if (hasMultipleFolders) {
      setIsCodexFolderPickerOpen((v) => !v);
    } else {
      onOpenCodex();
    }
  };

  const handleCodexFolderSelect = (folder: WorkspaceFolder) => {
    setIsCodexFolderPickerOpen(false);
    vscode.postMessage({ type: 'openCodex', folderPath: folder.path });
  };

  return (
    <div className="absolute bottom-10 left-10 z-20 flex items-center gap-4 pixel-panel p-4">
      <div
        ref={folderPickerRef}
        className="relative"
        onMouseEnter={handleAgentHover}
        onMouseLeave={handleAgentLeave}
      >
        <Button
          variant="accent"
          onClick={handleAgentClick}
          title={t('toolbar.startAgentTitle')}
          className={
            isFolderPickerOpen || isBypassMenuOpen
              ? 'bg-accent-bright'
              : 'bg-accent hover:bg-accent-bright'
          }
        >
          {t('toolbar.startAgent')}
        </Button>
        <Dropdown isOpen={isBypassMenuOpen}>
          <DropdownItem onClick={() => handleBypassSelect(true)}>
            {t('toolbar.skipPermissions')} <span className="text-2xs text-warning">!</span>
          </DropdownItem>
        </Dropdown>
        <Dropdown isOpen={isFolderPickerOpen} className="min-w-128">
          {workspaceFolders.map((folder) => (
            <DropdownItem
              key={folder.path}
              onClick={() => handleFolderSelect(folder)}
              className="text-base"
            >
              {folder.name}
            </DropdownItem>
          ))}
        </Dropdown>
      </div>
      {/* Codex Agent button */}
      <div ref={codexFolderPickerRef} className="relative">
        <Button
          variant="default"
          onClick={handleCodexClick}
          title={t('toolbar.startCodexTitle')}
          className={isCodexFolderPickerOpen ? 'bg-accent-bright' : undefined}
        >
          {t('toolbar.startCodex')}
        </Button>
        <Dropdown isOpen={isCodexFolderPickerOpen} className="min-w-128">
          {workspaceFolders.map((folder) => (
            <DropdownItem
              key={folder.path}
              onClick={() => handleCodexFolderSelect(folder)}
              className="text-base"
            >
              {folder.name}
            </DropdownItem>
          ))}
        </Dropdown>
      </div>

      <Button
        variant={isEditMode ? 'active' : 'default'}
        onClick={onToggleEditMode}
        title={t('toolbar.layoutTitle')}
      >
        {t('toolbar.layout')}
      </Button>
      <Button
        variant={isSettingsOpen ? 'active' : 'default'}
        onClick={onToggleSettings}
        title={t('toolbar.settings')}
      >
        {t('toolbar.settings')}
      </Button>
    </div>
  );
}
