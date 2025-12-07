import { CONFIG } from './config';
import { GM_getValue, GM_setValue } from '$';

export type Settings = {
    ankiUrl: string;
    ankiKey: string;
    imageField: string;
    audioField: string;
    exampleIndex: number;
    confirmOverwrite: boolean;
    targetNoteMode: 'recent' | 'selected';
    openEditorOnKey: boolean;
    openEditorKey: string;
};

export function getSettings(): Settings {
    return {
        ankiUrl: (GM_getValue?.('ankiUrl') as string) || CONFIG.ANKI_CONNECT_URL,
        ankiKey: (GM_getValue?.('ankiKey') as string) || (CONFIG.ANKI_CONNECT_KEY || ''),
        imageField: (GM_getValue?.('imageField') as string) || CONFIG.IMAGE_FIELD_NAME,
        audioField: (GM_getValue?.('audioField') as string) || CONFIG.AUDIO_FIELD_NAME,
        exampleIndex: Number(GM_getValue?.('exampleIndex') ?? CONFIG.EXAMPLE_INDEX) || 0,
        confirmOverwrite: Boolean(GM_getValue?.('confirmOverwrite') ?? CONFIG.CONFIRM_OVERWRITE),
        targetNoteMode: (GM_getValue?.('targetNoteMode') as 'recent' | 'selected') || CONFIG.TARGET_NOTE_MODE,
        openEditorOnKey: Boolean(GM_getValue?.('openEditorOnKey') ?? CONFIG.OPEN_EDITOR_ON_KEY),
        openEditorKey: (GM_getValue?.('openEditorKey') as string) || CONFIG.OPEN_EDITOR_KEY,
    };
}

export function saveSettings(s: Settings) {
    GM_setValue?.('ankiUrl', s.ankiUrl.trim());
    GM_setValue?.('ankiKey', s.ankiKey.trim());
    GM_setValue?.('imageField', s.imageField.trim());
    GM_setValue?.('audioField', s.audioField.trim());
    GM_setValue?.('exampleIndex', Number.isFinite(s.exampleIndex) ? s.exampleIndex : 0);
    GM_setValue?.('confirmOverwrite', !!s.confirmOverwrite);
    GM_setValue?.('targetNoteMode', s.targetNoteMode === 'selected' ? 'selected' : 'recent');
    GM_setValue?.('openEditorOnKey', !!s.openEditorOnKey);
    GM_setValue?.('openEditorKey', s.openEditorKey.trim() || CONFIG.OPEN_EDITOR_KEY);
    CONFIG.ANKI_CONNECT_URL = s.ankiUrl.trim() || CONFIG.ANKI_CONNECT_URL;
    CONFIG.ANKI_CONNECT_KEY = s.ankiKey.trim() || null;
    CONFIG.IMAGE_FIELD_NAME = s.imageField.trim() || CONFIG.IMAGE_FIELD_NAME;
    CONFIG.AUDIO_FIELD_NAME = s.audioField.trim() || CONFIG.AUDIO_FIELD_NAME;
    CONFIG.EXAMPLE_INDEX = Number.isFinite(s.exampleIndex) ? s.exampleIndex : CONFIG.EXAMPLE_INDEX;
    CONFIG.CONFIRM_OVERWRITE = !!s.confirmOverwrite;
    CONFIG.TARGET_NOTE_MODE = s.targetNoteMode === 'selected' ? 'selected' : 'recent';
    CONFIG.OPEN_EDITOR_ON_KEY = !!s.openEditorOnKey;
    CONFIG.OPEN_EDITOR_KEY = s.openEditorKey.trim() || CONFIG.OPEN_EDITOR_KEY;
}


