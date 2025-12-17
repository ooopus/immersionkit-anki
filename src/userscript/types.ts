// ============================================================================
// ImmersionKit Types
// ============================================================================

export interface ImmersionKitExample {
  id: string;
  title: string;
  image?: string;
  sound?: string;
  media?: string;
}

export interface ImmersionKitSearchResponse {
  examples: ImmersionKitExample[];
}

export interface ImmersionKitSearchOptions {
  exactMatch?: boolean;
  limit?: number;
  sort?: string;
  index?: string;
}

// ============================================================================
// Anki Types
// ============================================================================

export type AnkiCardId = number;
export type AnkiNoteId = number;

export interface AnkiNoteFieldInfo {
  value: string;
  order: number;
}

export interface AnkiNoteInfo {
  noteId: AnkiNoteId;
  fields: Record<string, AnkiNoteFieldInfo>;
  modelName?: string;
}

export interface AnkiMediaObject {
  url: string;
  filename?: string;
  fields?: string[];
}

export interface AnkiUpdateNotePayload {
  id: AnkiNoteId;
  fields: Record<string, string>;
  picture?: AnkiMediaObject[];
  audio?: AnkiMediaObject[];
}

export type MediaType = 'picture' | 'audio';

// ============================================================================
// Configuration Types
// ============================================================================

export type TargetNoteMode = 'recent' | 'selected';

// ============================================================================
// UI State Types
// ============================================================================

export type ButtonState = 'idle' | 'pending' | 'success' | 'error';

export type PlayAllStatus = 'idle' | 'playing' | 'paused' | 'stopped';

export interface PlayAllState {
  status: PlayAllStatus;
  currentIndex: number;
  totalOnPage: number;
  loopEnabled: boolean;
}

// ============================================================================
// Settings Types
// ============================================================================

export interface Settings {
  ankiUrl: string;
  ankiKey: string;
  imageField: string;
  audioField: string;
  exampleIndex: number;
  confirmOverwrite: boolean;
  targetNoteMode: TargetNoteMode;
  openEditorKey: string;
}

// ============================================================================
// Media Handler Types
// ============================================================================

export interface AddMediaOptions {
  skipButtonState?: boolean;
  skipEnsureOpen?: boolean;
}
