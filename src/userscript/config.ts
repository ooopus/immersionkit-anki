import { GM_getValue } from '$';
import type { TargetNoteMode } from './types';

export interface ScriptConfig {
  ANKI_CONNECT_URL: string;
  ANKI_CONNECT_KEY: string | null;
  IMAGE_FIELD_NAME: string;
  AUDIO_FIELD_NAME: string;
  EXAMPLE_INDEX: number;
  CONFIRM_OVERWRITE: boolean;
  TARGET_NOTE_MODE: TargetNoteMode;
  CAPTURE_TIMEOUT_MS: number;
  OPEN_EDITOR_KEY: string;
}

/**
 * Default configuration values.
 * These are used when no user settings are stored.
 */
export const DEFAULTS: Readonly<ScriptConfig> = Object.freeze({
  ANKI_CONNECT_URL: 'http://127.0.0.1:8765',
  ANKI_CONNECT_KEY: null,
  IMAGE_FIELD_NAME: 'Picture',
  AUDIO_FIELD_NAME: 'SentenceAudio',
  EXAMPLE_INDEX: 0,
  CONFIRM_OVERWRITE: true,
  TARGET_NOTE_MODE: 'recent' as TargetNoteMode,
  CAPTURE_TIMEOUT_MS: 2000,
  OPEN_EDITOR_KEY: 'e',
});

/**
 * Get the current configuration, merging user settings with defaults.
 * This is the single source of truth for all configuration.
 */
export function getConfig(): ScriptConfig {
  const savedOpenEditorKey = GM_getValue?.('openEditorKey');
  return {
    ANKI_CONNECT_URL: (GM_getValue?.('ankiUrl') as string) || DEFAULTS.ANKI_CONNECT_URL,
    ANKI_CONNECT_KEY: (GM_getValue?.('ankiKey') as string) || DEFAULTS.ANKI_CONNECT_KEY,
    IMAGE_FIELD_NAME: (GM_getValue?.('imageField') as string) || DEFAULTS.IMAGE_FIELD_NAME,
    AUDIO_FIELD_NAME: (GM_getValue?.('audioField') as string) || DEFAULTS.AUDIO_FIELD_NAME,
    EXAMPLE_INDEX: Number(GM_getValue?.('exampleIndex') ?? DEFAULTS.EXAMPLE_INDEX) || 0,
    CONFIRM_OVERWRITE: Boolean(GM_getValue?.('confirmOverwrite') ?? DEFAULTS.CONFIRM_OVERWRITE),
    TARGET_NOTE_MODE: (GM_getValue?.('targetNoteMode') as TargetNoteMode) || DEFAULTS.TARGET_NOTE_MODE,
    CAPTURE_TIMEOUT_MS: DEFAULTS.CAPTURE_TIMEOUT_MS, // Not user-configurable
    OPEN_EDITOR_KEY: typeof savedOpenEditorKey === 'string' ? savedOpenEditorKey : DEFAULTS.OPEN_EDITOR_KEY,
  };
}

/**
 * @deprecated Use getConfig() instead. This mutable object is kept for backwards compatibility.
 */
export const CONFIG: ScriptConfig = { ...DEFAULTS };
