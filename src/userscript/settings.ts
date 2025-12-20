import { getConfig } from './config';
import { GM_setValue } from '$';
import type { Settings } from './types';

export function getSettings(): Settings {
  const config = getConfig();
  return {
    ankiUrl: config.ANKI_CONNECT_URL,
    ankiKey: config.ANKI_CONNECT_KEY || '',
    imageField: config.IMAGE_FIELD_NAME,
    audioField: config.AUDIO_FIELD_NAME,
    exampleIndex: config.EXAMPLE_INDEX,
    confirmOverwrite: config.CONFIRM_OVERWRITE,
    targetNoteMode: config.TARGET_NOTE_MODE,
    openEditorKey: config.OPEN_EDITOR_KEY,
  };
}

export function saveSettings(s: Settings) {
  const openEditorKey = (s.openEditorKey ?? '').trim();
  GM_setValue?.('ankiUrl', s.ankiUrl.trim());
  GM_setValue?.('ankiKey', s.ankiKey.trim());
  GM_setValue?.('imageField', s.imageField.trim());
  GM_setValue?.('audioField', s.audioField.trim());
  GM_setValue?.('exampleIndex', Number.isFinite(s.exampleIndex) ? s.exampleIndex : 0);
  GM_setValue?.('confirmOverwrite', !!s.confirmOverwrite);
  GM_setValue?.('targetNoteMode', s.targetNoteMode === 'selected' ? 'selected' : 'recent');
  GM_setValue?.('openEditorKey', openEditorKey);
  // Note: CONFIG is no longer mutated. Use getConfig() to get fresh values.
}
