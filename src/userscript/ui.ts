import { CONFIG } from './config';
import { fetchExamples, buildMediaTargets } from './immersionkit';
import { attachMedia, ensureFieldOnNote, getMostRecentNoteId } from './anki';
import { getSuccessText, revertButtonState, setButtonState, injectStyles, showModal } from './dom';
import { GM_getValue, GM_setValue, GM_registerMenuCommand } from '$';
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

function init() {
  injectStyles();
  setTimeout(insertAnkiButtons, 1000);
}

export function startUserscript() {
  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

type Settings = {
  ankiUrl: string;
  ankiKey: string;
  imageField: string;
  audioField: string;
  exampleIndex: number;
  confirmOverwrite: boolean;
};

function getSettings(): Settings {
  return {
    ankiUrl: (GM_getValue?.('ankiUrl') as string) || CONFIG.ANKI_CONNECT_URL,
    ankiKey: (GM_getValue?.('ankiKey') as string) || (CONFIG.ANKI_CONNECT_KEY || ''),
    imageField: (GM_getValue?.('imageField') as string) || CONFIG.IMAGE_FIELD_NAME,
    audioField: (GM_getValue?.('audioField') as string) || CONFIG.AUDIO_FIELD_NAME,
    exampleIndex: Number(GM_getValue?.('exampleIndex') ?? CONFIG.EXAMPLE_INDEX) || 0,
    confirmOverwrite: Boolean(GM_getValue?.('confirmOverwrite') ?? CONFIG.CONFIRM_OVERWRITE),
  };
}

function saveSettings(s: Settings) {
  GM_setValue?.('ankiUrl', s.ankiUrl.trim());
  GM_setValue?.('ankiKey', s.ankiKey.trim());
  GM_setValue?.('imageField', s.imageField.trim());
  GM_setValue?.('audioField', s.audioField.trim());
  GM_setValue?.('exampleIndex', Number.isFinite(s.exampleIndex) ? s.exampleIndex : 0);
  GM_setValue?.('confirmOverwrite', !!s.confirmOverwrite);
  CONFIG.ANKI_CONNECT_URL = s.ankiUrl.trim() || CONFIG.ANKI_CONNECT_URL;
  CONFIG.ANKI_CONNECT_KEY = s.ankiKey.trim() || null;
  CONFIG.IMAGE_FIELD_NAME = s.imageField.trim() || CONFIG.IMAGE_FIELD_NAME;
  CONFIG.AUDIO_FIELD_NAME = s.audioField.trim() || CONFIG.AUDIO_FIELD_NAME;
  CONFIG.EXAMPLE_INDEX = Number.isFinite(s.exampleIndex) ? s.exampleIndex : CONFIG.EXAMPLE_INDEX;
  CONFIG.CONFIRM_OVERWRITE = !!s.confirmOverwrite;
}

function renderSettingsHtml(s: Settings) {
  return `
    <form class="anki-form">
      <label>AnkiConnect URL</label>
      <input type="text" name="ankiUrl" value="${escapeHtml(s.ankiUrl)}" placeholder="http://127.0.0.1:8765" />
      <label>AnkiConnect Key</label>
      <input type="password" name="ankiKey" value="${escapeHtml(s.ankiKey)}" placeholder="（可选）" />
      <label>图片字段名</label>
      <input type="text" name="imageField" value="${escapeHtml(s.imageField)}" />
      <label>音频字段名</label>
      <input type="text" name="audioField" value="${escapeHtml(s.audioField)}" />
      <label>示例索引</label>
      <input type="number" name="exampleIndex" value="${String(s.exampleIndex)}" min="0" />
      <label>覆盖前确认</label>
      <input type="checkbox" name="confirmOverwrite" ${s.confirmOverwrite ? 'checked' : ''} />
    </form>
  `;
}

export function registerMenu() {
  if (typeof GM_registerMenuCommand !== 'function') return;
  GM_registerMenuCommand('设置（ImmersionKit → Anki）', async () => {
    const s = getSettings();
    const html = renderSettingsHtml(s);
    await showModal({
      title: '设置（ImmersionKit → Anki）',
      html,
      confirmText: '保存',
      onConfirm: (root) => {
        const form = root.querySelector('form') as HTMLFormElement | null;
        if (!form) return true;
        const next: Settings = {
          ankiUrl: (form.querySelector('[name="ankiUrl"]') as HTMLInputElement)?.value || s.ankiUrl,
          ankiKey: (form.querySelector('[name="ankiKey"]') as HTMLInputElement)?.value || '',
          imageField: (form.querySelector('[name="imageField"]') as HTMLInputElement)?.value || s.imageField,
          audioField: (form.querySelector('[name="audioField"]') as HTMLInputElement)?.value || s.audioField,
          exampleIndex: Number((form.querySelector('[name="exampleIndex"]') as HTMLInputElement)?.value || s.exampleIndex) || 0,
          confirmOverwrite: !!(form.querySelector('[name="confirmOverwrite"]') as HTMLInputElement)?.checked,
        };
        saveSettings(next);
        return true;
      },
    });
  });
}


