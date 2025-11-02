import { CONFIG } from './config';
import { fetchExamples, buildMediaTargets } from './immersionkit';
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
  // Fallback: button-based placement (when not using menu anchors)
  const audioButton = document.querySelector('button[data-anki="audio"]') as HTMLButtonElement | null;
  if (audioButton) {
    let openBtn = audioButton.parentElement?.querySelector('button[data-anki="open"]') as HTMLButtonElement | null;
    if (!openBtn) {
      openBtn = document.createElement('button');
      openBtn.dataset.anki = 'open';
      openBtn.textContent = '打开';
      openBtn.style.marginLeft = '6px';
      openBtn.style.padding = '4px 8px';
      openBtn.style.fontSize = '90%';
      openBtn.style.cursor = 'pointer';
      openBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const idStr = (e.currentTarget as HTMLElement).dataset.ankiOpenId;
        const id = idStr ? Number(idStr) : NaN;
        if (Number.isFinite(id)) {
          try { await openNoteEditor(id); } catch { }
        }
      });
      audioButton.parentNode?.insertBefore(openBtn, audioButton.nextSibling);
    }
    openBtn.dataset.ankiOpenId = String(noteId);
  }
}

function isExactSearchEnabled(): boolean {
  const labels = Array.from(document.querySelectorAll('div.ui.checkbox label'));
  const label = labels.find((el) => el.textContent?.trim() === 'Exact Search');
  if (!label) return false;
  const wrapper = label.closest('.ui.checkbox');
  return !!(wrapper && wrapper.classList.contains('checked'));
}

function getExampleItems(): Element[] {
  const desktopItems = Array.from(document.querySelectorAll('.item.mobile.or.lower.hidden'));
  if (desktopItems.length > 0) return desktopItems;
  const mobileItems = Array.from(document.querySelectorAll('.item.mobile.only'));
  return mobileItems;
}

function getMenuIndex(menuEl: Element): number {
  const itemEl = (menuEl.closest('.item.mobile.or.lower.hidden') || menuEl.closest('.item.mobile.only')) as Element | null;
  const items = getExampleItems();
  const idx = itemEl ? items.indexOf(itemEl) : -1;
  return idx >= 0 ? idx : 0;
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
  const img = (item.querySelector('div.ui.medium.image img.ui.image.clickableImage[src]:not([src=""])') ||
    item.querySelector('div.ui.small.image img.ui.image[src]:not([src=""])')) as HTMLImageElement | null;
  const srcAttr = (img && img.getAttribute('src')) ? String(img.getAttribute('src')) : '';
  const hasNonEmptySrcAttr = typeof srcAttr === 'string' && srcAttr.trim().length > 0;
  if (!img || !hasNonEmptySrcAttr) return null;
  const absUrl = resolveAbsoluteUrl(srcAttr);
  const alt = (img.getAttribute('alt') || '').trim();
  const filename = filenameFromUrl(absUrl, (alt ? `${alt}.jpg` : 'image.jpg'));
  return { url: absUrl, filename };
}

function hasImageAtIndex(index: number): boolean {
  return findImageInfoAtIndex(index) !== null;
}

async function addMediaToAnkiForIndex(mediaType: 'picture' | 'audio', exampleIndex: number, triggerEl?: Element) {
  const url = new URL(window.location.href);
  const keywordParam = url.searchParams.get('keyword');
  if (!keywordParam) {
    if (triggerEl) {
      setButtonState(triggerEl, 'error', '未检测到关键词');
      setTimeout(() => revertButtonState(triggerEl), 2000);
    }
    console.warn('Cannot determine keyword from URL');
    return;
  }
  const keyword = decodeURIComponent(keywordParam);
  try {
    if (triggerEl) setButtonState(triggerEl, 'pending', '添加中…');

    let apiUrl = '';
    let filename = '';
    const fieldName = mediaType === 'picture' ? CONFIG.IMAGE_FIELD_NAME : CONFIG.AUDIO_FIELD_NAME;

    if (mediaType === 'audio') {
      const captured = await captureAudioUrlFromMining(triggerEl);
      if (captured && captured.url) {
        apiUrl = captured.url;
        filename = captured.filename;
      }
    }

    if (mediaType === 'picture') {
      const info = findImageInfoAtIndex(exampleIndex);
      if (!info) throw new Error('No in-page image found');
      apiUrl = info.url;
      filename = info.filename;
    } else if (!apiUrl) {
      const examples = await fetchExamples(keyword, {
        exactMatch: isExactSearchEnabled(),
        limit: 0,
        sort: 'sentence_length:asc',
      });
      let index = Number.isFinite(exampleIndex) ? exampleIndex : 0;
      if (index < 0) index = 0;
      if (index >= examples.length) index = examples.length - 1;
      const example = examples[index];
      if (!example) throw new Error('No example available');
      if (!example.sound) throw new Error('Example has no audio');
      const targets = buildMediaTargets(example, 'audio');
      apiUrl = targets.apiUrl;
      filename = targets.filename;
    }
    let targetNoteIds: number[] = [];
    if (CONFIG.TARGET_NOTE_MODE === 'selected') {
      targetNoteIds = await getSelectedNoteIds();
      if (!Array.isArray(targetNoteIds) || targetNoteIds.length === 0) {
        throw new Error('未检测到选中笔记');
      }
    } else {
      const noteId = await getMostRecentNoteId();
      targetNoteIds = [noteId];
    }

    let successCount = 0;
    for (const noteId of targetNoteIds) {
      try {
        await ensureFieldOnNote(noteId, fieldName);
        if (CONFIG.CONFIRM_OVERWRITE) {
          const info = (await getNoteInfo(noteId)) as AnkiNoteInfo | null;
          const model = info?.modelName || '';
          const existing = info?.fields?.[fieldName]?.value || '';
          const hasExisting = typeof existing === 'string' && existing.trim().length > 0;
          if (hasExisting) {
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
              continue;
            }
          }
        }
        await attachMedia(noteId, mediaType, { url: apiUrl, filename }, fieldName);
        successCount++;
      } catch (e) {
        // skip this note and continue others
        console.warn('Failed to add media to note', noteId, e);
        continue;
      }
    }
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
      await addMediaToAnkiForIndex('picture', exampleIndex, undefined);
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
    await addMediaToAnkiForIndex('audio', exampleIndex, undefined);
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
        } catch {}
      }
    }
  }
}

function addBothMediaToAnki(triggerEl?: Element) {
  return addBothMediaToAnkiForIndex(CONFIG.EXAMPLE_INDEX, triggerEl);
}

function injectMenuButtons(menuEl: Element): void {
  const idx = getMenuIndex(menuEl);
  const showImage = hasImageAtIndex(idx);
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

  if (!menuEl.querySelector('a.item[data-anki="both"]')) {
    const bothItem = createAnkiMenuItem('Anki Both', 'both', idx, (el, i) =>
      addBothMediaToAnkiForIndex(i, el),
    );
    menuEl.appendChild(bothItem);
  }

  if (showImage && !menuEl.querySelector('a.item[data-anki="image"]')) {
    const imgItem = createAnkiMenuItem('Anki Image', 'image', idx, (el, i) =>
      addMediaToAnkiForIndex('picture', i, el),
    );
    menuEl.appendChild(imgItem);
  }

  if (!menuEl.querySelector('a.item[data-anki="audio"]')) {
    const audioItem = createAnkiMenuItem('Anki Audio', 'audio', idx, (el, i) =>
      addMediaToAnkiForIndex('audio', i, el),
    );
    menuEl.appendChild(audioItem);
  }
}

function insertAnkiButtons() {
  let attempts = 0;
  const maxAttempts = 40;
  const interval = setInterval(() => {
    attempts++;
    const desktopMenus = Array.from(
      document.querySelectorAll('span.mobile.or.lower.hidden .ui.secondary.menu'),
    );
    const mobileMenus = Array.from(
      document.querySelectorAll('span.mobile.only .ui.secondary.menu'),
    );
    const menus = desktopMenus.length > 0 ? desktopMenus : mobileMenus;
    if (menus.length > 0) {
      menus.forEach((menuEl) => injectMenuButtons(menuEl));
      clearInterval(interval);
      return;
    }
    const allButtons = Array.from(document.querySelectorAll('button, a, span, div'));
    const imageButton = allButtons.find((el) => el.textContent && el.textContent.trim() === 'Image');
    const soundButton = allButtons.find((el) => el.textContent && el.textContent.trim() === 'Sound');
    if (imageButton || soundButton) {
      clearInterval(interval);
      function createAnkiBtn(label: string, key: string, onClickFn: (el: Element) => void) {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.marginLeft = '6px';
        btn.style.padding = '4px 8px';
        btn.style.fontSize = '90%';
        btn.style.cursor = 'pointer';
        btn.dataset.anki = key;
        btn.addEventListener('click', (e) => onClickFn(e.currentTarget as Element));
        return btn;
      }
      const idx = Number.isFinite(CONFIG.EXAMPLE_INDEX) ? CONFIG.EXAMPLE_INDEX : 0;
      const showImage = hasImageAtIndex(idx);

      if (soundButton) {
        const ankiBothBtn = createAnkiBtn('Anki Both', 'both', (el) => addBothMediaToAnki(el));
        soundButton.parentNode?.insertBefore(ankiBothBtn, soundButton.nextSibling);
      }

      if (showImage && imageButton) {
        const ankiImgBtn = createAnkiBtn('Anki Image', 'image', (el) => addMediaToAnki('picture', el));
        imageButton.parentNode?.insertBefore(ankiImgBtn, imageButton.nextSibling);
      }

      if (soundButton) {
        const ankiSoundBtn = createAnkiBtn('Anki Audio', 'audio', (el) => addMediaToAnki('audio', el));
        soundButton.parentNode?.insertBefore(ankiSoundBtn, soundButton.nextSibling);
      }
    } else if (attempts >= maxAttempts) {
      clearInterval(interval);
      console.warn('ImmersionKit → Anki: Could not find Image/Sound buttons');
    }
  }, 500);
}

let stylesInjected = false;
let menuObserver: MutationObserver | null = null;

function observeNewMenus() {
  if (menuObserver) return;
  menuObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((n) => {
        if (!(n instanceof Element)) return;
        if (n.matches && n.matches('.ui.secondary.menu')) {
          injectMenuButtons(n);
        }
        const nested = n.querySelectorAll?.('.ui.secondary.menu');
        if (nested && nested.length > 0) {
          nested.forEach((el) => injectMenuButtons(el));
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
