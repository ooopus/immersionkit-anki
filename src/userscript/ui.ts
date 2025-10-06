import { CONFIG } from './config';
import { fetchExamples, buildMediaTargets } from './immersionkit';
import { attachMedia, ensureFieldOnNote, getMostRecentNoteId } from './anki';
import { getSuccessText, revertButtonState, setButtonState, injectStyles, showModal } from './dom';
import { GM_registerMenuCommand } from '$';
import { openSettingsOverlay } from './settings-ui';
import type { AnkiNoteInfo } from './types';
import { getNoteInfo } from './anki';

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
    const examples = await fetchExamples(keyword);
    let index = Number.isFinite(exampleIndex) ? exampleIndex : 0;
    if (index < 0) index = 0;
    if (index >= examples.length) index = examples.length - 1;
    const example = examples[index];
    if (!example) throw new Error('No example available');
    if (mediaType === 'picture' && !example.image) throw new Error('Example has no image');
    if (mediaType === 'audio' && !example.sound) throw new Error('Example has no audio');
    const { apiUrl, filename } = buildMediaTargets(example, mediaType);
    const fieldName = mediaType === 'picture' ? CONFIG.IMAGE_FIELD_NAME : CONFIG.AUDIO_FIELD_NAME;
    const noteId = await getMostRecentNoteId();
    await ensureFieldOnNote(noteId, fieldName);
    if (CONFIG.CONFIRM_OVERWRITE) {
      const info = (await getNoteInfo(noteId)) as AnkiNoteInfo | null;
      const model = info?.modelName || '';
      const existing = info?.fields?.[fieldName]?.value || '';
      const hasExisting = typeof existing === 'string' && existing.trim().length > 0;
      const html = `
        <div class="anki-kv"><div class="key">Note ID</div><div>${noteId}</div></div>
        <div class="anki-kv"><div class="key">Note Type</div><div>${model || '未知'}</div></div>
        <div class="anki-kv"><div class="key">字段</div><div>${fieldName}</div></div>
        ${hasExisting ? `<div class="anki-kv row-span-2"><div class="key">原有内容</div><div><div class="anki-pre">${escapeHtml(existing)}</div></div></div>` : ''}
        <div class="anki-kv"><div class="key">将添加</div><div>${filename}</div></div>
      `;
      const proceed = await showModal({
        title: hasExisting ? '覆盖字段内容？' : '添加媒体',
        html,
        confirmText: hasExisting ? '覆盖并添加' : '添加',
        danger: hasExisting,
      });
      if (!proceed) {
        if (triggerEl) revertButtonState(triggerEl);
        return;
      }
    }
    await attachMedia(noteId, mediaType, { url: apiUrl, filename }, fieldName);
    if (triggerEl) {
      setButtonState(triggerEl, 'success', getSuccessText(mediaType));
      setTimeout(() => revertButtonState(triggerEl), 2000);
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
      const url = new URL(window.location.href);
      const keywordParam = url.searchParams.get('keyword');
      const keyword = keywordParam ? decodeURIComponent(keywordParam) : null;
      if (keyword) {
        fetchExamples(keyword)
          .then((examples) => {
            menus.forEach((menuEl, idx) => {
              const ex = Array.isArray(examples) ? examples[idx] : undefined;
              const hasImage = !!(ex && ex.image);
              if (hasImage && !menuEl.querySelector('a.item[data-anki="image"]')) {
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
            });
          })
          .catch(() => {
            menus.forEach((menuEl, idx) => {
              if (!menuEl.querySelector('a.item[data-anki="image"]')) {
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
            });
          })
          .finally(() => {
            clearInterval(interval);
          });
        return;
      }
      menus.forEach((menuEl, idx) => {
        if (!menuEl.querySelector('a.item[data-anki="image"]')) {
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
      });
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
      const url = new URL(window.location.href);
      const keywordParam = url.searchParams.get('keyword');
      const keyword = keywordParam ? decodeURIComponent(keywordParam) : null;
      if (keyword) {
        fetchExamples(keyword)
          .then((examples) => {
            const idx = Number.isFinite(CONFIG.EXAMPLE_INDEX) ? CONFIG.EXAMPLE_INDEX : 0;
            const ex = Array.isArray(examples) ? examples[Math.max(0, Math.min(idx, examples.length - 1))] : undefined;
            const hasImage = !!(ex && ex.image);
            if (hasImage && imageButton) {
              const ankiImgBtn = createAnkiBtn('Anki Image', 'image', (el) => addMediaToAnki('picture', el));
              imageButton.parentNode?.insertBefore(ankiImgBtn, imageButton.nextSibling);
            }
            if (soundButton) {
              const ankiSoundBtn = createAnkiBtn('Anki Audio', 'audio', (el) => addMediaToAnki('audio', el));
              soundButton.parentNode?.insertBefore(ankiSoundBtn, soundButton.nextSibling);
            }
          })
          .catch(() => {
            if (imageButton) {
              const ankiImgBtn = createAnkiBtn('Anki Image', 'image', (el) => addMediaToAnki('picture', el));
              imageButton.parentNode?.insertBefore(ankiImgBtn, imageButton.nextSibling);
            }
            if (soundButton) {
              const ankiSoundBtn = createAnkiBtn('Anki Audio', 'audio', (el) => addMediaToAnki('audio', el));
              soundButton.parentNode?.insertBefore(ankiSoundBtn, soundButton.nextSibling);
            }
          });
        return;
      }
      if (imageButton) {
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
function init() {
  if (!stylesInjected) {
    injectStyles();
    stylesInjected = true;
  }
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
