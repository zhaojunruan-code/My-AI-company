import { useState } from 'react';

import type { useEditorActions } from '../hooks/useEditorActions.js';
import { useI18n } from '../i18n.js';
import type { EditorState } from '../office/editor/editorState.js';
import { Button } from './ui/Button.js';

interface EditActionBarProps {
  editor: ReturnType<typeof useEditorActions>;
  editorState: EditorState;
}

export function EditActionBar({ editor, editorState: es }: EditActionBarProps) {
  const { t } = useI18n();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const undoDisabled = es.undoStack.length === 0;
  const redoDisabled = es.redoStack.length === 0;

  return (
    <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10 flex gap-4 items-center pixel-panel p-4">
      <Button
        variant={undoDisabled ? 'disabled' : 'default'}
        size="md"
        onClick={undoDisabled ? undefined : editor.handleUndo}
        title={t('editor.undoTitle')}
      >
        {t('editor.undo')}
      </Button>
      <Button
        variant={redoDisabled ? 'disabled' : 'default'}
        size="md"
        onClick={redoDisabled ? undefined : editor.handleRedo}
        title={t('editor.redoTitle')}
      >
        {t('editor.redo')}
      </Button>
      <Button variant="default" size="md" onClick={editor.handleSave} title={t('editor.saveTitle')}>
        {t('editor.save')}
      </Button>
      {!showResetConfirm ? (
        <Button
          variant="default"
          size="md"
          onClick={() => setShowResetConfirm(true)}
          title={t('editor.resetTitle')}
        >
          {t('editor.reset')}
        </Button>
      ) : (
        <div className="flex gap-4 items-center">
          <span className="text-base text-reset-text">{t('editor.resetConfirm')}</span>
          <Button
            variant="default"
            size="md"
            className="bg-danger text-white"
            onClick={() => {
              setShowResetConfirm(false);
              editor.handleReset();
            }}
          >
            {t('common.yes')}
          </Button>
          <Button variant="default" size="md" onClick={() => setShowResetConfirm(false)}>
            {t('common.no')}
          </Button>
        </div>
      )}
    </div>
  );
}
