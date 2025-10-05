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


