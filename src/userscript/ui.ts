import { CONFIG } from './config';
import { attachMedia, ensureFieldOnNote, getMostRecentNoteId, getSelectedNoteIds } from './anki';
import { getSuccessText, revertButtonState, setButtonState, injectStyles, showModal } from './dom';
import { GM_registerMenuCommand } from '$';
import { openSettingsOverlay } from './settings-ui';
import type { AnkiNoteInfo } from './types';
import { getNoteInfo, openNoteEditor } from './anki';
import { captureAudioUrlFromMining } from './miningSoundCapture';

function ensureOpenEditorControl(triggerEl: Element, noteId: number) {
  if (!noteId || !Number.isFinite(noteId)) return;
  const idx = (triggerEl as HTMLElement).dataset.ankiIndex || '';
  // Try menu-style anchor placement
  let container: Element | null = triggerEl.closest('.ui.secondary.menu');
  if (container) {
    let audioAnchor: HTMLAnchorElement | null = null;
    if ((triggerEl as HTMLElement).dataset.anki === 'audio') {
      audioAnchor = triggerEl as HTMLAnchorElement;
    } else if (idx) {
      audioAnchor = container.querySelector(`a.item[data-anki="audio"][data-anki-index="${idx}"]`);
    } else {
      audioAnchor = container.querySelector('a.item[data-anki="audio"]');
    }
    if (audioAnchor) {
      let openAnchor = container.querySelector(`a.item[data-anki="open"][data-anki-index="${idx}"]`) as HTMLAnchorElement | null;
      if (!openAnchor) {
        openAnchor = document.createElement('a');
        openAnchor.className = 'item';
        openAnchor.href = '#';
        openAnchor.dataset.anki = 'open';
        if (idx) openAnchor.dataset.ankiIndex = idx;
        openAnchor.textContent = '打开';
        openAnchor.style.opacity = '0.7';
        openAnchor.style.fontSize = '90%';
        openAnchor.addEventListener('click', async (e) => {
          e.preventDefault();
          const idStr = (e.currentTarget as HTMLElement).dataset.ankiOpenId;
          const id = idStr ? Number(idStr) : NaN;
          if (Number.isFinite(id)) {
            try { await openNoteEditor(id); } catch { }
          }
        });
        audioAnchor.parentNode?.insertBefore(openAnchor, audioAnchor.nextSibling);
      }
      openAnchor.dataset.ankiOpenId = String(noteId);
      return;
    }
  }
}


/**
 * Represents a group of elements for one example sentence on the page.
 * ImmersionKit uses a 5-element pattern per example:
 * [example-desktop, buttons-desktop, example-mobile, buttons-mobile, context-menu]
 */
interface ExampleGroup {
  exampleDesktop: Element;
  buttonSpanDesktop: Element;
  exampleMobile: Element;
  buttonSpanMobile: Element;
  contextMenu: Element;
  index: number;
}

/**
 * Get all example groups from the page using the 5-element grouping pattern.
 * Each example has 5 consecutive elements in .ui.divided.items container.
 */
function getExampleGroups(): ExampleGroup[] {
  const container = document.querySelector('.ui.divided.items');
  if (!container) return [];

  const children = Array.from(container.children);
  const groups: ExampleGroup[] = [];

  // Each group consists of 5 elements
  for (let i = 0; i + 4 < children.length; i += 5) {
    groups.push({
      exampleDesktop: children[i],
      buttonSpanDesktop: children[i + 1],
      exampleMobile: children[i + 2],
      buttonSpanMobile: children[i + 3],
      contextMenu: children[i + 4],
      index: Math.floor(i / 5)
    });
  }

  return groups;
}

/**
 * Get example items (desktop) from the current page structure.
 * Uses the 5-element grouping pattern.
 */
function getExampleItems(): Element[] {
  const groups = getExampleGroups();
  return groups.map(g => g.exampleDesktop);
}

/**
 * Get the example index from a menu element.
 * Uses the 5-element grouping pattern to determine position.
 */
function getExampleIndexFromMenu(menuEl: Element): number {
  const container = document.querySelector('.ui.divided.items');
  if (!container) return 0;

  const children = Array.from(container.children);
  const spanIndex = children.findIndex(child => child.contains(menuEl));

  if (spanIndex === -1) return 0;

  // Button spans are at positions 1 and 3 in each group
  // Divide by 5 to get the example index
  return Math.floor(spanIndex / 5);
}

function resolveAbsoluteUrl(srcAttr: string): string {
  try { return new URL(srcAttr, window.location.origin).href; } catch { return srcAttr; }
}

function filenameFromUrl(u: string, fallback: string): string {
  try {
    const name = (new URL(u).pathname.split('/').pop() || '').split('?')[0];
    return decodeURIComponent(name) || fallback;
  } catch {
    const p = (u || '').split('/').pop() || '';
    return decodeURIComponent(p.split('?')[0]) || fallback;
  }
}

function findImageInfoAtIndex(index: number): { url: string; filename: string } | null {
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

function hasImageAtIndex(index: number): boolean {
  return findImageInfoAtIndex(index) !== null;
}

async function addMediaToAnkiForIndex(mediaType: 'picture' | 'audio', exampleIndex: number, triggerEl?: Element) {
  console.log(`[Anki] 开始添加媒体: type=${mediaType}, index=${exampleIndex}`);

  // Validate example index
  const groups = getExampleGroups();
  const items = getExampleItems();
  const maxIndex = Math.max(groups.length, items.length);
  console.log(`[Anki] 验证索引: index=${exampleIndex}, maxIndex=${maxIndex - 1}`);
  if (exampleIndex < 0 || exampleIndex >= maxIndex) {
    console.error(`ImmersionKit → Anki: Invalid example index: ${exampleIndex}, max: ${maxIndex - 1}`);
    if (triggerEl) {
      setButtonState(triggerEl, 'error', '索引错误');
      setTimeout(() => revertButtonState(triggerEl), 2000);
    }
    return;
  }

  try {
    if (triggerEl) setButtonState(triggerEl, 'pending', '添加中…');

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
      } catch (e) {
        // skip this note and continue others
        console.error(`[Anki] ✗ 添加媒体到笔记 ${noteId} 失败:`, e);
        console.warn('Failed to add media to note', noteId, e);
        continue;
      }
    }
    console.log(`[Anki] 完成: ${successCount}/${targetNoteIds.length} 个笔记添加成功`);
    if (triggerEl) {
      if (successCount > 0) {
        const total = targetNoteIds.length;
        const text = total > 1 ? `已添加 ${successCount}/${total}` : getSuccessText(mediaType);
        setButtonState(triggerEl, 'success', text);
        setTimeout(() => revertButtonState(triggerEl), 2000);
        if (total >= 1) {
          ensureOpenEditorControl(triggerEl, targetNoteIds[0]);
        }
      } else {
        setButtonState(triggerEl, 'error', '添加失败');
        setTimeout(() => revertButtonState(triggerEl), 2500);
      }
    }
  } catch (err) {
    if (triggerEl) {
      setButtonState(triggerEl, 'error', '添加失败');
      setTimeout(() => revertButtonState(triggerEl), 2500);
    }
    console.error('Failed to add ' + mediaType, err);
  }
}

function addMediaToAnki(mediaType: 'picture' | 'audio', triggerEl?: Element) {
  return addMediaToAnkiForIndex(mediaType, CONFIG.EXAMPLE_INDEX, triggerEl);
}

async function addBothMediaToAnkiForIndex(exampleIndex: number, triggerEl?: Element) {
  const hasImage = hasImageAtIndex(exampleIndex);

  if (triggerEl) setButtonState(triggerEl, 'pending', '添加中…');

  let imageSuccess = false;
  let audioSuccess = false;

  if (hasImage) {
    try {
      if (triggerEl) setButtonState(triggerEl, 'pending', '图片添加中…');
      await addMediaToAnkiForIndex('picture', exampleIndex, triggerEl);
      imageSuccess = true;
    } catch (err) {
      console.warn('Failed to add image:', err);
    }
  }

  try {
    if (triggerEl) {
      if (hasImage && imageSuccess) {
        setButtonState(triggerEl, 'pending', '图片✓ 音频中…');
      } else {
        setButtonState(triggerEl, 'pending', '音频添加中…');
      }
    }
    await addMediaToAnkiForIndex('audio', exampleIndex, triggerEl);
    audioSuccess = true;
  } catch (err) {
    console.warn('Failed to add audio:', err);
  }

  if (triggerEl) {
    if (hasImage && imageSuccess && audioSuccess) {
      setButtonState(triggerEl, 'success', '已添加 2项');
      setTimeout(() => revertButtonState(triggerEl), 2000);
    } else if (!hasImage && audioSuccess) {
      setButtonState(triggerEl, 'success', '音频已添加');
      setTimeout(() => revertButtonState(triggerEl), 2000);
    } else if (hasImage && imageSuccess && !audioSuccess) {
      setButtonState(triggerEl, 'error', '仅图片成功');
      setTimeout(() => revertButtonState(triggerEl), 2500);
    } else if (hasImage && !imageSuccess && audioSuccess) {
      setButtonState(triggerEl, 'error', '仅音频成功');
      setTimeout(() => revertButtonState(triggerEl), 2500);
    } else {
      setButtonState(triggerEl, 'error', '添加失败');
      setTimeout(() => revertButtonState(triggerEl), 2500);
    }

    if (imageSuccess || audioSuccess) {
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
}

function addBothMediaToAnki(triggerEl?: Element) {
  return addBothMediaToAnkiForIndex(CONFIG.EXAMPLE_INDEX, triggerEl);
}

/**
 * Inject Anki buttons into a menu element.
 * @param menuEl - The .ui.secondary.menu element to inject buttons into
 * @param exampleIndex - The index of the example this menu corresponds to
 */
function injectMenuButtons(menuEl: Element, exampleIndex: number): void {
  // Use hasImageAtIndex for proper image detection
  const showImage = hasImageAtIndex(exampleIndex);
  console.log(`[Anki] 例句 ${exampleIndex} 图片检测: ${showImage}`);

  function createAnkiMenuItem(label: string, key: string, index: number, onClickFn: (el: Element, i: number) => void) {
    const a = document.createElement('a');
    a.className = 'item';
    a.href = '#';
    a.dataset.anki = key;
    a.dataset.ankiIndex = String(index);
    a.textContent = label;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      onClickFn(e.currentTarget as Element, index);
    });
    return a;
  }

  // Only show "Anki Both" if there's an image
  if (showImage && !menuEl.querySelector('a.item[data-anki="both"]')) {
    const bothItem = createAnkiMenuItem('Anki Both', 'both', exampleIndex, (el, i) =>
      addBothMediaToAnkiForIndex(i, el),
    );
    menuEl.appendChild(bothItem);
  }

  // Only show "Anki Image" if there's an image
  if (showImage && !menuEl.querySelector('a.item[data-anki="image"]')) {
    const imgItem = createAnkiMenuItem('Anki Image', 'image', exampleIndex, (el, i) =>
      addMediaToAnkiForIndex('picture', i, el),
    );
    menuEl.appendChild(imgItem);
  }

  // Always show "Anki Audio"
  if (!menuEl.querySelector('a.item[data-anki="audio"]')) {
    const audioItem = createAnkiMenuItem('Anki Audio', 'audio', exampleIndex, (el, i) =>
      addMediaToAnkiForIndex('audio', i, el),
    );
    menuEl.appendChild(audioItem);
  }
}

/**
 * Validate the page structure matches our expected 5-element grouping pattern.
 */
function validatePageStructure(): { valid: boolean; reason?: string } {
  const container = document.querySelector('.ui.divided.items');
  if (!container) {
    return { valid: false, reason: 'No .ui.divided.items container found' };
  }

  const children = Array.from(container.children);
  if (children.length === 0) {
    return { valid: false, reason: 'Container is empty' };
  }

  if (children.length % 5 !== 0) {
    console.warn(`ImmersionKit → Anki: Unexpected children count: ${children.length} (expected multiple of 5)`);
    // Don't fail, but log warning - page might be partially loaded
  }

  // Check if first group has the expected structure
  if (children.length >= 5) {
    const firstExample = children[0];
    const firstButtonSpan = children[1];
    const hasExpectedPattern =
      firstExample?.classList.contains('item') &&
      firstButtonSpan?.tagName === 'SPAN' &&
      firstButtonSpan?.querySelector('.ui.secondary.menu');

    if (!hasExpectedPattern) {
      return { valid: false, reason: 'Structure pattern mismatch' };
    }
  }

  return { valid: true };
}

/**
 * Insert Anki buttons using the new 5-element grouping strategy.
 */
function insertAnkiButtons() {
  let attempts = 0;
  const maxAttempts = 40;
  const interval = setInterval(() => {
    attempts++;

    // Validate structure first
    const validation = validatePageStructure();
    if (!validation.valid) {
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.warn(`ImmersionKit → Anki: ${validation.reason}`);
      }
      return;
    }

    // Get example groups using new strategy
    const groups = getExampleGroups();
    if (groups.length > 0) {
      clearInterval(interval);
      console.log(`ImmersionKit → Anki: Found ${groups.length} example groups`);

      // Inject buttons into each group's menus
      groups.forEach((group) => {
        // Desktop menu
        const menuDesktop = group.buttonSpanDesktop.querySelector('.ui.secondary.menu');
        if (menuDesktop) {
          injectMenuButtons(menuDesktop, group.index);
        }

        // Mobile menu
        const menuMobile = group.buttonSpanMobile.querySelector('.ui.secondary.menu');
        if (menuMobile) {
          injectMenuButtons(menuMobile, group.index);
        }
      });
      return;
    }

    if (attempts >= maxAttempts) {
      clearInterval(interval);
      console.warn('ImmersionKit → Anki: Could not inject buttons after max attempts');
    }
  }, 500);
}

let stylesInjected = false;
let menuObserver: MutationObserver | null = null;

/**
 * Observe for new menus being added to the page and inject buttons into them.
 * Uses MutationObserver to handle dynamically loaded content.
 */
function observeNewMenus() {
  if (menuObserver) return;
  menuObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((n) => {
        if (!(n instanceof Element)) return;

        // If a menu element was added, find its example index and inject
        if (n.matches && n.matches('.ui.secondary.menu')) {
          const exampleIndex = getExampleIndexFromMenu(n);
          const groups = getExampleGroups();
          if (groups[exampleIndex]) {
            injectMenuButtons(n, exampleIndex);
          }
        }

        // Check for nested menus
        const nested = n.querySelectorAll?.('.ui.secondary.menu');
        if (nested && nested.length > 0) {
          nested.forEach((el) => {
            const exampleIndex = getExampleIndexFromMenu(el);
            const groups = getExampleGroups();
            if (groups[exampleIndex]) {
              injectMenuButtons(el, exampleIndex);
            }
          });
        }
      });
    }
  });
  menuObserver.observe(document.body, { childList: true, subtree: true });
}

function init() {
  if (!stylesInjected) {
    injectStyles();
    stylesInjected = true;
  }
  observeNewMenus();
  setTimeout(insertAnkiButtons, 1000);
}

function isDictionaryPage(u?: URL) {
  const url = u || new URL(window.location.href);
  return url.pathname.startsWith('/dictionary');
}

let lastInitializedHref: string | null = null;
function maybeInitForDictionary() {
  if (!isDictionaryPage()) return;
  const href = window.location.href;
  if (href === lastInitializedHref) return;
  lastInitializedHref = href;
  init();
}

export function startUserscript() {
  const onReady = () => {
    maybeInitForDictionary();
    let lastHref = window.location.href;
    window.addEventListener('popstate', maybeInitForDictionary);
    window.addEventListener('hashchange', maybeInitForDictionary);
    setInterval(() => {
      const current = window.location.href;
      if (current !== lastHref) {
        lastHref = current;
        maybeInitForDictionary();
      }
    }, 400);
  };
  if (document.readyState === 'complete') onReady();
  else window.addEventListener('load', onReady);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// legacy form-based settings removed in favor of Svelte UI

export function registerMenu() {
  GM_registerMenuCommand('设置（ImmersionKit → Anki）', () => {
    openSettingsOverlay();
  });
}
