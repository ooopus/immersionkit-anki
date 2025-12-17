/**
 * Media Handler Module
 * 
 * Handles adding images and audio to Anki notes from ImmersionKit pages.
 */

import { CONFIG } from './config';
import { attachMedia, ensureFieldOnNote, getMostRecentNoteId, getSelectedNoteIds, getNoteInfo } from './anki';
import { getSuccessText, revertButtonState, setButtonState, showModal } from './dom';
import { captureAudioUrlFromMining } from './miningSoundCapture';
import { getExampleGroups, getExampleItems } from './exampleGroup';
import { setLastAddedNote, ensureOpenEditorControl } from './editorControl';
import { resolveAbsoluteUrl, filenameFromUrl } from './utils';
import type { AnkiNoteInfo, AddMediaOptions } from './types';

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================================
// Image Detection
// ============================================================================

export function findImageInfoAtIndex(index: number): { url: string; filename: string } | null {
  const items = getExampleItems();
  if (items.length === 0) return null;
  let idx = Number.isFinite(index) ? index : 0;
  if (idx < 0) idx = 0;
  if (idx >= items.length) idx = items.length - 1;
  const item = items[idx];
  if (!item) return null;

  // Try multiple selectors in order of specificity
  const img = (
    item.querySelector('div.ui.medium.image img.ui.image.clickableImage[src]:not([src=""])') ||
    item.querySelector('div.ui.small.image img.ui.image[src]:not([src=""])') ||
    item.querySelector('img[src]:not([src=""])') // Generic fallback
  ) as HTMLImageElement | null;

  if (!img) {
    console.log(`[Anki] 例句 ${index}: 未找到图片元素`);
    return null;
  }

  const srcAttr = img.getAttribute('src') || '';
  const hasNonEmptySrcAttr = typeof srcAttr === 'string' && srcAttr.trim().length > 0;
  if (!hasNonEmptySrcAttr) {
    console.log(`[Anki] 例句 ${index}: 图片 src 属性为空`);
    return null;
  }

  const absUrl = resolveAbsoluteUrl(srcAttr);
  const alt = (img.getAttribute('alt') || '').trim();
  const filename = filenameFromUrl(absUrl, (alt ? `${alt}.jpg` : 'image.jpg'));
  console.log(`[Anki] 例句 ${index}: 找到图片 url=${absUrl}, filename=${filename}`);
  return { url: absUrl, filename };
}

export function hasImageAtIndex(index: number): boolean {
  return findImageInfoAtIndex(index) !== null;
}

// ============================================================================
// Media Adding
// ============================================================================


export async function addMediaToAnkiForIndex(
  mediaType: 'picture' | 'audio',
  exampleIndex: number,
  triggerEl?: Element,
  options?: AddMediaOptions,
): Promise<boolean> {
  console.log(`[Anki] 开始添加媒体: type=${mediaType}, index=${exampleIndex}`);

  // Validate example index
  const groups = getExampleGroups();
  const items = getExampleItems();
  const maxIndex = Math.max(groups.length, items.length);
  console.log(`[Anki] 验证索引: index=${exampleIndex}, maxIndex=${maxIndex - 1}`);
  if (exampleIndex < 0 || exampleIndex >= maxIndex) {
    console.error(`ImmersionKit → Anki: Invalid example index: ${exampleIndex}, max: ${maxIndex - 1}`);
    if (triggerEl && !options?.skipButtonState) {
      setButtonState(triggerEl, 'error', '索引错误');
      setTimeout(() => revertButtonState(triggerEl), 2000);
    }
    return false;
  }

  const buttonEl = options?.skipButtonState ? undefined : triggerEl;
  const allowEnsureOpen = !options?.skipEnsureOpen;

  try {
    if (buttonEl) setButtonState(buttonEl, 'pending', '添加中…');

    let apiUrl = '';
    let filename = '';
    const fieldName = mediaType === 'picture' ? CONFIG.IMAGE_FIELD_NAME : CONFIG.AUDIO_FIELD_NAME;
    console.log(`[Anki] 目标字段: ${fieldName}`);

    if (mediaType === 'picture') {
      console.log('[Anki] 查找页面图片...');
      const info = findImageInfoAtIndex(exampleIndex);
      if (!info) {
        console.error('[Anki] 未找到页面图片');
        throw new Error('No in-page image found');
      }
      apiUrl = info.url;
      filename = info.filename;
      console.log(`[Anki] 找到图片: url=${apiUrl}, filename=${filename}`);
    } else if (mediaType === 'audio') {
      console.log('[Anki] 尝试捕获音频URL...');
      const captured = await captureAudioUrlFromMining(triggerEl);
      if (!captured || !captured.url) {
        console.error('[Anki] 未能捕获音频URL');
        throw new Error('Could not capture audio URL from page');
      }
      apiUrl = captured.url;
      filename = captured.filename;
      console.log(`[Anki] 捕获到音频: url=${apiUrl}, filename=${filename}`);
    }

    console.log(`[Anki] 获取目标笔记 (mode=${CONFIG.TARGET_NOTE_MODE})...`);
    let targetNoteIds: number[] = [];
    if (CONFIG.TARGET_NOTE_MODE === 'selected') {
      targetNoteIds = await getSelectedNoteIds();
      console.log(`[Anki] 获取到选中笔记: ${targetNoteIds.join(', ')}`);
      if (!Array.isArray(targetNoteIds) || targetNoteIds.length === 0) {
        console.error('[Anki] 未检测到选中笔记');
        throw new Error('未检测到选中笔记');
      }
    } else {
      const noteId = await getMostRecentNoteId();
      targetNoteIds = [noteId];
      console.log(`[Anki] 获取到最近笔记: ${noteId}`);
    }

    console.log(`[Anki] 开始向 ${targetNoteIds.length} 个笔记添加媒体...`);
    const successfulNoteIds: number[] = [];
    let successCount = 0;
    for (const noteId of targetNoteIds) {
      try {
        console.log(`[Anki] 处理笔记 ${noteId}...`);
        console.log(`[Anki] 即将调用 ensureFieldOnNote...`);
        await ensureFieldOnNote(noteId, fieldName);
        console.log(`[Anki] ensureFieldOnNote 完成`);
        console.log(`[Anki] 字段 "${fieldName}" 验证通过`);

        if (CONFIG.CONFIRM_OVERWRITE) {
          const info = (await getNoteInfo(noteId)) as AnkiNoteInfo | null;
          const model = info?.modelName || '';
          const existing = info?.fields?.[fieldName]?.value || '';
          const hasExisting = typeof existing === 'string' && existing.trim().length > 0;
          if (hasExisting) {
            console.log(`[Anki] 字段已有内容，显示确认对话框`);
            const html = `
              <div class="anki-kv"><div class="key">Note ID</div><div>${noteId}</div></div>
              <div class="anki-kv"><div class="key">Note Type</div><div>${model || '未知'}</div></div>
              <div class="anki-kv"><div class="key">字段</div><div>${fieldName}</div></div>
              <div class="anki-kv row-span-2"><div class="key">原有内容</div><div><div class="anki-pre">${escapeHtml(existing)}</div></div></div>
              <div class="anki-kv"><div class="key">将添加</div><div>${filename}</div></div>
            `;
            const proceed = await showModal({
              title: '覆盖字段内容？',
              html,
              confirmText: '覆盖并添加',
              danger: true,
            });
            if (!proceed) {
              console.log(`[Anki] 用户取消覆盖笔记 ${noteId}`);
              continue;
            }
            console.log(`[Anki] 用户确认覆盖笔记 ${noteId}`);
          }
        }

        console.log(`[Anki] 调用 attachMedia: noteId=${noteId}, mediaType=${mediaType}, url=${apiUrl}, filename=${filename}, field=${fieldName}`);
        await attachMedia(noteId, mediaType, { url: apiUrl, filename }, fieldName);
        console.log(`[Anki] ✓ 成功添加媒体到笔记 ${noteId}`);
        successCount++;
        successfulNoteIds.push(noteId);
      } catch (e) {
        // skip this note and continue others
        console.error(`[Anki] ✗ 添加媒体到笔记 ${noteId} 失败:`, e);
        console.warn('Failed to add media to note', noteId, e);
        continue;
      }
    }
    console.log(`[Anki] 完成: ${successCount}/${targetNoteIds.length} 个笔记添加成功`);
    if (successCount > 0) {
      const noteToUse = successfulNoteIds[successfulNoteIds.length - 1] ?? targetNoteIds[0];
      if (noteToUse) setLastAddedNote(noteToUse);
      if (buttonEl) {
        const total = targetNoteIds.length;
        const text = total > 1 ? `已添加 ${successCount}/${total}` : getSuccessText(mediaType);
        setButtonState(buttonEl, 'success', text);
        setTimeout(() => revertButtonState(buttonEl), 2000);
      }
      if (allowEnsureOpen && triggerEl && noteToUse) {
        ensureOpenEditorControl(triggerEl, noteToUse);
      }
    } else if (buttonEl) {
      setButtonState(buttonEl, 'error', '添加失败');
      setTimeout(() => revertButtonState(buttonEl), 2500);
    }
    return successCount > 0;
  } catch (err) {
    if (buttonEl) {
      setButtonState(buttonEl, 'error', '添加失败');
      setTimeout(() => revertButtonState(buttonEl), 2500);
    }
    console.error('Failed to add ' + mediaType, err);
    return false;
  }
}

export async function addBothMediaToAnkiForIndex(exampleIndex: number, triggerEl?: Element) {
  const hasImage = hasImageAtIndex(exampleIndex);
  const buttonEl = triggerEl || undefined;

  if (buttonEl) setButtonState(buttonEl, 'pending', '添加中…');

  let imageSuccess = false;
  let audioSuccess = false;

  if (hasImage) {
    try {
      if (buttonEl) setButtonState(buttonEl, 'pending', '图片添加中…');
      imageSuccess = await addMediaToAnkiForIndex('picture', exampleIndex, triggerEl, {
        skipButtonState: true,
        skipEnsureOpen: true,
      });
    } catch (err) {
      console.warn('Failed to add image:', err);
    }
  }

  try {
    if (buttonEl) {
      if (hasImage && imageSuccess) {
        setButtonState(buttonEl, 'pending', '图片✓ 音频中…');
      } else {
        setButtonState(buttonEl, 'pending', '音频添加中…');
      }
    }
    audioSuccess = await addMediaToAnkiForIndex('audio', exampleIndex, triggerEl, {
      skipButtonState: true,
      skipEnsureOpen: true,
    });
  } catch (err) {
    console.warn('Failed to add audio:', err);
  }

  if (buttonEl) {
    if (hasImage && imageSuccess && audioSuccess) {
      setButtonState(buttonEl, 'success', '已添加 2项');
      setTimeout(() => revertButtonState(buttonEl), 2000);
    } else if (!hasImage && audioSuccess) {
      setButtonState(buttonEl, 'success', '音频已添加');
      setTimeout(() => revertButtonState(buttonEl), 2000);
    } else if (hasImage && imageSuccess && !audioSuccess) {
      setButtonState(buttonEl, 'error', '仅图片成功');
      setTimeout(() => revertButtonState(buttonEl), 2500);
    } else if (hasImage && !imageSuccess && audioSuccess) {
      setButtonState(buttonEl, 'error', '仅音频成功');
      setTimeout(() => revertButtonState(buttonEl), 2500);
    } else {
      setButtonState(buttonEl, 'error', '添加失败');
      setTimeout(() => revertButtonState(buttonEl), 2500);
    }
  }

  if (triggerEl && hasImage && imageSuccess && audioSuccess) {
    const url = new URL(window.location.href);
    const keywordParam = url.searchParams.get('keyword');
    if (keywordParam) {
      try {
        let targetNoteIds: number[] = [];
        if (CONFIG.TARGET_NOTE_MODE === 'selected') {
          targetNoteIds = await getSelectedNoteIds();
        } else {
          const noteId = await getMostRecentNoteId();
          targetNoteIds = [noteId];
        }
        if (targetNoteIds.length > 0) {
          ensureOpenEditorControl(triggerEl, targetNoteIds[0]);
        }
      } catch { }
    }
  }
}
