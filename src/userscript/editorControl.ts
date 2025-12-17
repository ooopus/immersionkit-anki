/**
 * Editor Control Module
 * 
 * Handles editor shortcuts and the "Open" button for accessing Anki note editor.
 */

import { CONFIG } from './config';
import { openNoteEditor } from './anki';

const LAST_ADDED_NOTE_EXPIRES_MS = 5 * 60 * 1000;
let lastAddedNoteId: number | null = null;
let lastAddedAt = 0;
let editorShortcutRegistered = false;

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as HTMLElement;
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return Boolean(el.isContentEditable);
}

async function handleEditorShortcut(e: KeyboardEvent) {
  const shortcut = (CONFIG.OPEN_EDITOR_KEY || '').trim();
  if (!shortcut) return;

  if (isTextInputTarget(e.target as HTMLElement | null)) return;
  if (!lastAddedNoteId) return;
  if (Date.now() - lastAddedAt > LAST_ADDED_NOTE_EXPIRES_MS) return;

  const pressed = (e.key || '').trim().toLowerCase();
  if (pressed !== shortcut.toLowerCase()) return;

  try {
    await openNoteEditor(lastAddedNoteId);
  } catch (err) {
    console.warn('[Anki] 打开编辑器失败', err);
  }
}

function registerEditorShortcutHandler() {
  if (editorShortcutRegistered) return;
  window.addEventListener('keydown', handleEditorShortcut);
  editorShortcutRegistered = true;
}

/**
 * Record the most recently added note for quick access via shortcut.
 */
export function setLastAddedNote(noteId: number) {
  if (!noteId || !Number.isFinite(noteId)) return;
  lastAddedNoteId = noteId;
  lastAddedAt = Date.now();
  registerEditorShortcutHandler();
}

/**
 * Create or update the "Open" button next to media buttons for quick editor access.
 */
export function ensureOpenEditorControl(triggerEl: Element, noteId: number) {
  if (!noteId || !Number.isFinite(noteId)) return;
  const idx = (triggerEl as HTMLElement).dataset.ankiIndex || '';
  // Try menu-style anchor placement
  const container: Element | null = triggerEl.closest('.ui.secondary.menu');
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
