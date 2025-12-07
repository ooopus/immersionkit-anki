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
    openEditorKey: string;
};

export function getSettings(): Settings {
    const savedOpenEditorKey = GM_getValue?.('openEditorKey');
    return {
        ankiUrl: (GM_getValue?.('ankiUrl') as string) || CONFIG.ANKI_CONNECT_URL,
        ankiKey: (GM_getValue?.('ankiKey') as string) || (CONFIG.ANKI_CONNECT_KEY || ''),
        imageField: (GM_getValue?.('imageField') as string) || CONFIG.IMAGE_FIELD_NAME,
        audioField: (GM_getValue?.('audioField') as string) || CONFIG.AUDIO_FIELD_NAME,
        exampleIndex: Number(GM_getValue?.('exampleIndex') ?? CONFIG.EXAMPLE_INDEX) || 0,
        confirmOverwrite: Boolean(GM_getValue?.('confirmOverwrite') ?? CONFIG.CONFIRM_OVERWRITE),
        targetNoteMode: (GM_getValue?.('targetNoteMode') as 'recent' | 'selected') || CONFIG.TARGET_NOTE_MODE,
        openEditorKey: typeof savedOpenEditorKey === 'string' ? savedOpenEditorKey : CONFIG.OPEN_EDITOR_KEY,
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
    CONFIG.ANKI_CONNECT_URL = s.ankiUrl.trim() || CONFIG.ANKI_CONNECT_URL;
    CONFIG.ANKI_CONNECT_KEY = s.ankiKey.trim() || null;
    CONFIG.IMAGE_FIELD_NAME = s.imageField.trim() || CONFIG.IMAGE_FIELD_NAME;
    CONFIG.AUDIO_FIELD_NAME = s.audioField.trim() || CONFIG.AUDIO_FIELD_NAME;
    CONFIG.EXAMPLE_INDEX = Number.isFinite(s.exampleIndex) ? s.exampleIndex : CONFIG.EXAMPLE_INDEX;
    CONFIG.CONFIRM_OVERWRITE = !!s.confirmOverwrite;
    CONFIG.TARGET_NOTE_MODE = s.targetNoteMode === 'selected' ? 'selected' : 'recent';
    CONFIG.OPEN_EDITOR_KEY = openEditorKey;
}


