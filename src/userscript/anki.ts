import { CONFIG } from './config';
import type { AnkiCardId, AnkiMediaObject, AnkiNoteId, AnkiNoteInfo, AnkiUpdateNotePayload, MediaType } from './types';
import { GM_xmlhttpRequest } from '$';

type AnkiConnectResult<T> = { result: T; error: string | null };

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
            const data = JSON.parse(res.responseText) as AnkiConnectResult<T> | T;
            if (data && typeof data === 'object' && 'error' in (data as any)) {
              const ac = data as AnkiConnectResult<T>;
              if (ac.error) reject(new Error(ac.error));
              else resolve(ac.result as T);
            } else if (data && typeof data === 'object' && 'result' in (data as any)) {
              resolve((data as any).result as T);
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
    throw new Error(`Field “${fieldName}” does not exist on the latest note`);
  }
}

export async function attachMedia(noteId: AnkiNoteId, mediaType: MediaType, media: { url: string; filename: string }, fieldName: string): Promise<void> {
  const mediaObject: AnkiMediaObject = { url: media.url, filename: media.filename, fields: [fieldName] };
  const noteUpdate: AnkiUpdateNotePayload = { id: noteId, fields: {} };
  if (mediaType === 'picture') noteUpdate.picture = [mediaObject];
  else noteUpdate.audio = [mediaObject];
  await invokeAnkiConnect('updateNoteFields', { note: noteUpdate });
}


