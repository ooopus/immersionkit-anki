import { CONFIG } from './config';
import { GM_getValue, GM_setValue } from '$';

export type Settings = {
    ankiUrl: string;
    ankiKey: string;
    imageField: string;
    audioField: string;
    exampleIndex: number;
    confirmOverwrite: boolean;
};

export function getSettings(): Settings {
    return {
        ankiUrl: (GM_getValue?.('ankiUrl') as string) || CONFIG.ANKI_CONNECT_URL,
        ankiKey: (GM_getValue?.('ankiKey') as string) || (CONFIG.ANKI_CONNECT_KEY || ''),
        imageField: (GM_getValue?.('imageField') as string) || CONFIG.IMAGE_FIELD_NAME,
        audioField: (GM_getValue?.('audioField') as string) || CONFIG.AUDIO_FIELD_NAME,
        exampleIndex: Number(GM_getValue?.('exampleIndex') ?? CONFIG.EXAMPLE_INDEX) || 0,
        confirmOverwrite: Boolean(GM_getValue?.('confirmOverwrite') ?? CONFIG.CONFIRM_OVERWRITE),
    };
}

export function saveSettings(s: Settings) {
    GM_setValue?.('ankiUrl', s.ankiUrl.trim());
    GM_setValue?.('ankiKey', s.ankiKey.trim());
    GM_setValue?.('imageField', s.imageField.trim());
    GM_setValue?.('audioField', s.audioField.trim());
    GM_setValue?.('exampleIndex', Number.isFinite(s.exampleIndex) ? s.exampleIndex : 0);
    GM_setValue?.('confirmOverwrite', !!s.confirmOverwrite);
    CONFIG.ANKI_CONNECT_URL = s.ankiUrl.trim() || CONFIG.ANKI_CONNECT_URL;
    CONFIG.ANKI_CONNECT_KEY = s.ankiKey.trim() || null;
    CONFIG.IMAGE_FIELD_NAME = s.imageField.trim() || CONFIG.IMAGE_FIELD_NAME;
    CONFIG.AUDIO_FIELD_NAME = s.audioField.trim() || CONFIG.AUDIO_FIELD_NAME;
    CONFIG.EXAMPLE_INDEX = Number.isFinite(s.exampleIndex) ? s.exampleIndex : CONFIG.EXAMPLE_INDEX;
    CONFIG.CONFIRM_OVERWRITE = !!s.confirmOverwrite;
}


