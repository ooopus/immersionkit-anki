export interface ScriptConfig {
  ANKI_CONNECT_URL: string;
  ANKI_CONNECT_KEY: string | null;
  IMAGE_FIELD_NAME: string;
  AUDIO_FIELD_NAME: string;
  EXAMPLE_INDEX: number;
  CONFIRM_OVERWRITE: boolean;
}

export const CONFIG: ScriptConfig = {
  ANKI_CONNECT_URL: 'http://127.0.0.1:8765',
  ANKI_CONNECT_KEY: null,
  IMAGE_FIELD_NAME: 'Picture',
  AUDIO_FIELD_NAME: 'SentenceAudio',
  EXAMPLE_INDEX: 0,
  CONFIRM_OVERWRITE: true,
};


