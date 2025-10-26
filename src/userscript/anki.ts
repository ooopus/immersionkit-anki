import { CONFIG } from './config';
import type { AnkiCardId, AnkiMediaObject, AnkiNoteId, AnkiNoteInfo, AnkiUpdateNotePayload, MediaType } from './types';
import { GM_xmlhttpRequest } from '$';

type AnkiConnectResult<T> = { result: T; error: string | null };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasProp<K extends string>(obj: unknown, key: K): obj is Record<K, unknown> {
  return isObject(obj) && key in obj;
}

export function invokeAnkiConnect<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const payload: Record<string, unknown> = { action, version: 6, params };
  if (CONFIG.ANKI_CONNECT_KEY) payload.key = CONFIG.ANKI_CONNECT_KEY;
  const endpoints = [CONFIG.ANKI_CONNECT_URL, 'http://localhost:8765'];
  return new Promise((resolve, reject) => {
    let tried = 0;
    function tryNext() {
      if (tried >= endpoints.length) {
        reject(new Error('Failed to connect to AnkiConnect. Is Anki running?'));
        return;
      }
      const url = endpoints[tried++];
      GM_xmlhttpRequest({
        method: 'POST',
        url,
        data: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        onload: (res) => {
          try {
            const data: unknown = JSON.parse(res.responseText);
            if (hasProp(data, 'error') && hasProp(data, 'result')) {
              const envelope = data as AnkiConnectResult<T>;
              if (envelope.error) {
                reject(new Error(envelope.error));
              } else {
                resolve(envelope.result);
              }
            } else if (hasProp(data, 'result')) {
              resolve((data as { result: T }).result);
            } else {
              resolve(data as T);
            }
          } catch (e) {
            reject(new Error('Failed to parse AnkiConnect response' + e));
          }
        },
        onerror: tryNext,
      });
    }
    tryNext();
  });
}

export async function getMostRecentNoteId(): Promise<AnkiNoteId> {
  const recentCards = await invokeAnkiConnect<AnkiCardId[]>('findCards', { query: 'added:1' });
  if (!recentCards || recentCards.length === 0) throw new Error('No cards added in the last 24 hours');
  const mostRecentCard = Math.max(...recentCards);
  const noteIds = await invokeAnkiConnect<AnkiNoteId[] | AnkiNoteId>('cardsToNotes', { cards: [mostRecentCard] });
  const noteId = Array.isArray(noteIds) ? noteIds[0] : noteIds;
  if (!noteId) throw new Error('Could not resolve card to note');
  return noteId;
}

export async function getNoteInfo(noteId: AnkiNoteId): Promise<AnkiNoteInfo | null> {
  const noteInfoList = await invokeAnkiConnect<AnkiNoteInfo[] | AnkiNoteInfo>('notesInfo', { notes: [noteId] });
  const noteInfo = Array.isArray(noteInfoList) ? noteInfoList[0] : noteInfoList;
  return noteInfo || null;
}

export async function ensureFieldOnNote(noteId: AnkiNoteId, fieldName: string): Promise<void> {
  const noteInfoList = await invokeAnkiConnect<AnkiNoteInfo[] | AnkiNoteInfo>('notesInfo', { notes: [noteId] });
  const noteInfo = Array.isArray(noteInfoList) ? noteInfoList[0] : noteInfoList;
  if (!noteInfo || !noteInfo.fields || !(fieldName in noteInfo.fields)) {
    throw new Error(`Field “${fieldName}” does not exist on the note`);
  }
}

export async function attachMedia(noteId: AnkiNoteId, mediaType: MediaType, media: { url: string; filename: string }, fieldName: string): Promise<void> {
  const mediaObject: AnkiMediaObject = { url: media.url, filename: media.filename, fields: [fieldName] };
  const noteUpdate: AnkiUpdateNotePayload = { id: noteId, fields: {} };
  if (mediaType === 'picture') noteUpdate.picture = [mediaObject];
  else noteUpdate.audio = [mediaObject];
  await invokeAnkiConnect('updateNoteFields', { note: noteUpdate });
}

export async function getSelectedNoteIds(): Promise<AnkiNoteId[]> {
  const ids = await invokeAnkiConnect<AnkiNoteId[]>('guiSelectedNotes');
  return Array.isArray(ids) ? ids : [];
}

export async function openNoteEditor(noteId: AnkiNoteId): Promise<void> {
  await invokeAnkiConnect<null>('guiEditNote', { note: noteId });
}
