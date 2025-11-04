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

  console.log(`[AnkiConnect] 调用: action="${action}", params=`, params);

  return new Promise((resolve, reject) => {
    let tried = 0;
    function tryNext() {
      if (tried >= endpoints.length) {
        console.error('[AnkiConnect] 所有端点连接失败');
        reject(new Error('Failed to connect to AnkiConnect. Is Anki running?'));
        return;
      }
      const url = endpoints[tried++];
      console.log(`[AnkiConnect] 尝试连接: ${url} (尝试 ${tried}/${endpoints.length})`);

      GM_xmlhttpRequest({
        method: 'POST',
        url,
        data: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        onload: (res) => {
          console.log(`[AnkiConnect] 响应状态: ${res.status}`);
          console.log(`[AnkiConnect] 响应原始内容 (前500字符):`, res.responseText.substring(0, 500));
          try {
            const data: unknown = JSON.parse(res.responseText);
            console.log(`[AnkiConnect] 解析后的数据:`, data);

            if (hasProp(data, 'error') && hasProp(data, 'result')) {
              const envelope = data as AnkiConnectResult<T>;
              if (envelope.error) {
                console.error(`[AnkiConnect] API错误: ${envelope.error}`);
                reject(new Error(envelope.error));
              } else {
                console.log(`[AnkiConnect] ✓ 成功: action="${action}"`, envelope.result);
                resolve(envelope.result);
              }
            } else if (hasProp(data, 'result')) {
              console.log(`[AnkiConnect] ✓ 成功: action="${action}"`, (data as { result: T }).result);
              resolve((data as { result: T }).result);
            } else {
              console.log(`[AnkiConnect] ✓ 成功: action="${action}"`, data);
              resolve(data as T);
            }
          } catch (e) {
            console.error('[AnkiConnect] 解析响应失败:', e);
            console.error('[AnkiConnect] 错误堆栈:', e instanceof Error ? e.stack : String(e));
            console.error('[AnkiConnect] 响应内容:', res.responseText.substring(0, 500));
            reject(new Error('Failed to parse AnkiConnect response: ' + e));
          }
        },
        onerror: (err) => {
          console.warn(`[AnkiConnect] 连接失败: ${url}`, err);
          tryNext();
        },
      });
    }
    tryNext();
  });
}

export async function getMostRecentNoteId(): Promise<AnkiNoteId> {
  console.log('[AnkiConnect] 获取最近笔记ID...');
  const recentCards = await invokeAnkiConnect<AnkiCardId[]>('findCards', { query: 'added:1' });
  console.log(`[AnkiConnect] 找到 ${recentCards?.length || 0} 张最近添加的卡片`);

  if (!recentCards || recentCards.length === 0) {
    console.error('[AnkiConnect] 过去24小时内未添加卡片');
    throw new Error('No cards added in the last 24 hours');
  }

  const mostRecentCard = Math.max(...recentCards);
  console.log(`[AnkiConnect] 最近卡片ID: ${mostRecentCard}`);

  const noteIds = await invokeAnkiConnect<AnkiNoteId[] | AnkiNoteId>('cardsToNotes', { cards: [mostRecentCard] });
  const noteId = Array.isArray(noteIds) ? noteIds[0] : noteIds;

  if (!noteId) {
    console.error('[AnkiConnect] 无法将卡片解析为笔记');
    throw new Error('Could not resolve card to note');
  }

  console.log(`[AnkiConnect] 最近笔记ID: ${noteId}`);
  return noteId;
}

export async function getNoteInfo(noteId: AnkiNoteId): Promise<AnkiNoteInfo | null> {
  console.log(`[AnkiConnect] getNoteInfo: noteId=${noteId}`);
  const noteInfoList = await invokeAnkiConnect<AnkiNoteInfo[] | AnkiNoteInfo>('notesInfo', { notes: [noteId] });
  console.log(`[AnkiConnect] getNoteInfo 返回数据:`, noteInfoList);
  const noteInfo = Array.isArray(noteInfoList) ? noteInfoList[0] : noteInfoList;
  console.log(`[AnkiConnect] getNoteInfo 解析后:`, noteInfo);
  return noteInfo || null;
}

export async function ensureFieldOnNote(noteId: AnkiNoteId, fieldName: string): Promise<void> {
  console.log(`[AnkiConnect] 验证字段: noteId=${noteId}, fieldName="${fieldName}"`);
  const noteInfoList = await invokeAnkiConnect<AnkiNoteInfo[] | AnkiNoteInfo>('notesInfo', { notes: [noteId] });
  const noteInfo = Array.isArray(noteInfoList) ? noteInfoList[0] : noteInfoList;

  if (!noteInfo) {
    console.error(`[AnkiConnect] 未找到笔记: ${noteId}`);
    throw new Error(`Note ${noteId} not found`);
  }

  console.log(`[AnkiConnect] 笔记类型: ${noteInfo.modelName}`);
  console.log(`[AnkiConnect] 可用字段: ${Object.keys(noteInfo.fields || {}).join(', ')}`);

  if (!noteInfo.fields || !(fieldName in noteInfo.fields)) {
    console.error(`[AnkiConnect] 字段 "${fieldName}" 不存在于笔记上`);
    throw new Error(`Field "${fieldName}" does not exist on the note`);
  }

  console.log(`[AnkiConnect] ✓ 字段验证通过`);
}

export async function attachMedia(noteId: AnkiNoteId, mediaType: MediaType, media: { url: string; filename: string }, fieldName: string): Promise<void> {
  console.log(`[AnkiConnect] attachMedia 开始: noteId=${noteId}, mediaType=${mediaType}, url=${media.url}, filename=${media.filename}, field=${fieldName}`);

  try {
    // Step 1: Download and store the media file in Anki
    console.log('[AnkiConnect] 步骤1: 下载媒体文件到 Anki...');
    const storedFilename = await invokeAnkiConnect<string>('storeMediaFile', {
      filename: media.filename,
      url: media.url
    });
    console.log(`[AnkiConnect] 媒体文件已存储: ${storedFilename}`);

    // Step 2: Build the field value with media reference
    let fieldValue = '';
    if (mediaType === 'picture') {
      fieldValue = `<img src="${storedFilename}">`;
      console.log(`[AnkiConnect] 构建图片字段值: ${fieldValue}`);
    } else {
      fieldValue = `[sound:${storedFilename}]`;
      console.log(`[AnkiConnect] 构建音频字段值: ${fieldValue}`);
    }

    // Step 3: Update the note field with the media reference
    console.log('[AnkiConnect] 步骤2: 更新笔记字段...');
    await invokeAnkiConnect('updateNoteFields', {
      note: {
        id: noteId,
        fields: {
          [fieldName]: fieldValue
        }
      }
    });
    console.log('[AnkiConnect] 字段更新请求已发送');

    // Step 4: Verify the field was actually updated
    console.log('[AnkiConnect] 步骤3: 验证字段是否真的更新了...');
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms for Anki to process

    const updatedNoteInfo = await getNoteInfo(noteId);
    console.log('[AnkiConnect] 更新后的笔记信息:', updatedNoteInfo);

    const actualFieldValue = updatedNoteInfo?.fields?.[fieldName]?.value || '';
    console.log(`[AnkiConnect] 字段 "${fieldName}" 的实际值:`, actualFieldValue);

    if (!actualFieldValue || actualFieldValue.trim().length === 0) {
      console.error(`[AnkiConnect] ✗ 验证失败: 字段 "${fieldName}" 为空！`);
      throw new Error(`Field "${fieldName}" is still empty after update`);
    }

    console.log('[AnkiConnect] ✓ 验证通过: 字段已有内容');
    console.log('[AnkiConnect] ✓ 媒体附加成功');
  } catch (error) {
    console.error('[AnkiConnect] ✗ attachMedia 失败:', error);
    throw error;
  }
}

export async function getSelectedNoteIds(): Promise<AnkiNoteId[]> {
  console.log('[AnkiConnect] 获取选中笔记ID...');
  const ids = await invokeAnkiConnect<AnkiNoteId[]>('guiSelectedNotes');
  const result = Array.isArray(ids) ? ids : [];
  console.log(`[AnkiConnect] 选中笔记数量: ${result.length}`, result);
  return result;
}

export async function openNoteEditor(noteId: AnkiNoteId): Promise<void> {
  await invokeAnkiConnect<null>('guiEditNote', { note: noteId });
}
