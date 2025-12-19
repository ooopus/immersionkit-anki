/**
 * Play All Audio Module
 * Provides sequential audio playback with auto-pagination, keyboard shortcuts, and loop mode.
 */

import { captureAudioUrlFromMining } from './miningSoundCapture';
import { getExampleGroups } from './exampleGroup';
import { SELECTORS, CLASSES } from './selectors';
import type { PlayAllStatus, PlayAllState } from './types';

// Re-export types for consumers
export type { PlayAllStatus, PlayAllState };

const state: PlayAllState = {
  status: 'idle',
  currentIndex: 0,
  totalOnPage: 0,
  loopEnabled: false,
  bookmarkedIndices: new Set<number>(),
};

let currentAudio: HTMLAudioElement | null = null;
let stateChangeListeners: Array<(s: PlayAllState) => void> = [];
let shortcutRegistered = false;

// Callback to resolve the current audio promise when skipping
let skipResolve: (() => void) | null = null;
// Flag to indicate skip was triggered (index already updated)
let wasSkipped = false;

// ============================================================================
// State Helpers
// ============================================================================

function notifyStateChange() {
  const snapshot = { ...state };
  stateChangeListeners.forEach((fn) => fn(snapshot));
}

export function onStateChange(fn: (s: PlayAllState) => void): () => void {
  stateChangeListeners.push(fn);
  return () => {
    stateChangeListeners = stateChangeListeners.filter((f) => f !== fn);
  };
}

export function getState(): PlayAllState {
  return { ...state };
}

function highlightExample(index: number) {
  // Remove previous highlight
  document.querySelectorAll(SELECTORS.PLAYALL_HIGHLIGHT).forEach((el) => {
    el.classList.remove(CLASSES.HIGHLIGHT);
  });

  const groups = getExampleGroups();
  const group = groups[index];
  if (!group) return;

  // Add highlight to desktop example
  group.exampleDesktop.classList.add(CLASSES.HIGHLIGHT);

  // Scroll into view
  group.exampleDesktop.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function updateBookmarkVisuals() {
  const groups = getExampleGroups();
  groups.forEach((group, idx) => {
    if (state.bookmarkedIndices.has(idx)) {
      group.exampleDesktop.classList.add(CLASSES.BOOKMARKED);
    } else {
      group.exampleDesktop.classList.remove(CLASSES.BOOKMARKED);
    }
  });
}

function clearHighlight() {
  document.querySelectorAll(SELECTORS.PLAYALL_HIGHLIGHT).forEach((el) => {
    el.classList.remove(CLASSES.HIGHLIGHT);
  });
}

// ============================================================================
// Pagination
// ============================================================================

function getNextPageButton(): HTMLElement | null {
  // Common pagination patterns in ImmersionKit
  for (const sel of SELECTORS.NEXT_PAGE) {
    const btn = document.querySelector(sel) as HTMLElement | null;
    if (btn && !btn.classList.contains('disabled')) {
      return btn;
    }
  }
  return null;
}

function waitForPageLoad(timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const check = () => {
      const groups = getExampleGroups();
      if (groups.length > 0) {
        resolve(true);
        return;
      }

      if (Date.now() - startTime > timeoutMs) {
        resolve(false);
        return;
      }

      setTimeout(check, 200);
    };

    // Start checking after a short delay for page transition
    setTimeout(check, 300);
  });
}

async function goToNextPage(): Promise<boolean> {
  const btn = getNextPageButton();
  if (!btn) return false;

  btn.click();
  return waitForPageLoad();
}

// ============================================================================
// Audio Playback
// ============================================================================

async function playAudioAtIndex(index: number): Promise<boolean> {
  const groups = getExampleGroups();
  if (index < 0 || index >= groups.length) return false;

  const group = groups[index];
  const triggerEl = group.buttonSpanDesktop;

  try {
    const captured = await captureAudioUrlFromMining(triggerEl);
    if (!captured || !captured.url) {
      console.warn(`[PlayAll] Could not capture audio for index ${index}`);
      return false;
    }

    // Stop any currently playing audio
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }

    return new Promise<boolean>((resolve) => {
      const audio = new Audio(captured.url);
      currentAudio = audio;

      // Clean up function
      const cleanup = () => {
        skipResolve = null;
        currentAudio = null;
      };

      // Register skip resolver so skip functions can immediately resolve this promise
      skipResolve = () => {
        cleanup();
        resolve(true); // Return true to continue the loop
      };

      audio.addEventListener('ended', () => {
        cleanup();
        resolve(true);
      });

      audio.addEventListener('error', (e) => {
        console.error('[PlayAll] Audio error:', e);
        cleanup();
        resolve(false);
      });

      audio.play().catch((err) => {
        console.error('[PlayAll] Play failed:', err);
        cleanup();
        resolve(false);
      });
    });
  } catch (err) {
    console.error('[PlayAll] Error playing audio at index', index, err);
    return false;
  }
}

// ============================================================================
// Main Playback Loop
// ============================================================================

async function playLoop() {
  while (state.status === 'playing') {
    const groups = getExampleGroups();
    state.totalOnPage = groups.length;
    notifyStateChange();

    if (state.currentIndex >= groups.length) {
      // Try to go to next page
      const hasNextPage = await goToNextPage();
      if (hasNextPage) {
        state.currentIndex = 0;
        notifyStateChange();
        continue;
      } else {
        // No more pages
        if (state.loopEnabled) {
          // Restart from beginning - need to go back to first page
          // For now, just restart current page
          state.currentIndex = 0;
          notifyStateChange();
          continue;
        } else {
          // Stop playback
          state.status = 'stopped';
          state.currentIndex = 0;
          clearHighlight();
          notifyStateChange();
          return;
        }
      }
    }

    // Highlight current example
    highlightExample(state.currentIndex);

    // Play audio
    await playAudioAtIndex(state.currentIndex);

    // Check if paused during playback
    if (getState().status === 'paused') {
      // Wait until resumed or stopped
      await new Promise<void>((resolve) => {
        const unsubscribe = onStateChange((s) => {
          if (s.status !== 'paused') {
            unsubscribe();
            resolve();
          }
        });
      });

      if (getState().status === 'stopped') {
        clearHighlight();
        return;
      }
    }

    if (getState().status === 'stopped') {
      clearHighlight();
      return;
    }

    // Move to next only if not skipped (skip functions already update the index)
    if (!wasSkipped) {
      state.currentIndex++;
      notifyStateChange();
    }
    wasSkipped = false;
  }
}

// ============================================================================
// Public Controls
// ============================================================================

export function startPlayAll(fromIndex = 0) {
  if (state.status === 'playing') return;

  state.status = 'playing';
  state.currentIndex = fromIndex;
  state.totalOnPage = getExampleGroups().length;
  notifyStateChange();

  playLoop();
}

export function pausePlayback() {
  if (state.status !== 'playing') return;

  state.status = 'paused';
  if (currentAudio) {
    currentAudio.pause();
  }
  notifyStateChange();
}

export function resumePlayback() {
  if (state.status !== 'paused') return;

  state.status = 'playing';
  if (currentAudio) {
    currentAudio.play().catch(console.error);
  }
  notifyStateChange();

  // Continue the loop
  playLoop();
}

export function stopPlayback() {
  state.status = 'stopped';
  state.currentIndex = 0;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  clearHighlight();
  notifyStateChange();
}

export function toggleLoop() {
  state.loopEnabled = !state.loopEnabled;
  notifyStateChange();
}

// ============================================================================
// Bookmark Controls
// ============================================================================

export function toggleBookmark() {
  const idx = state.currentIndex;
  if (state.bookmarkedIndices.has(idx)) {
    state.bookmarkedIndices.delete(idx);
  } else {
    state.bookmarkedIndices.add(idx);
  }
  updateBookmarkVisuals();
  notifyStateChange();
}

export function isCurrentBookmarked(): boolean {
  return state.bookmarkedIndices.has(state.currentIndex);
}

export function getBookmarkCount(): number {
  return state.bookmarkedIndices.size;
}

export function clearAllBookmarks() {
  state.bookmarkedIndices.clear();
  updateBookmarkVisuals();
  notifyStateChange();
}

export function skipToNextBookmark() {
  if (state.status === 'idle' || state.status === 'stopped') return;
  if (state.bookmarkedIndices.size === 0) return;

  const sortedBookmarks = Array.from(state.bookmarkedIndices).sort((a, b) => a - b);
  const nextBookmark = sortedBookmarks.find((idx) => idx > state.currentIndex);

  if (nextBookmark !== undefined) {
    wasSkipped = true;
    state.currentIndex = nextBookmark;
    notifyStateChange();

    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    if (skipResolve) {
      skipResolve();
    }
  } else if (state.loopEnabled && sortedBookmarks.length > 0) {
    // Loop to first bookmark
    wasSkipped = true;
    state.currentIndex = sortedBookmarks[0];
    notifyStateChange();

    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    if (skipResolve) {
      skipResolve();
    }
  }
}

export function skipToPrevBookmark() {
  if (state.status === 'idle' || state.status === 'stopped') return;
  if (state.bookmarkedIndices.size === 0) return;

  const sortedBookmarks = Array.from(state.bookmarkedIndices).sort((a, b) => b - a);
  const prevBookmark = sortedBookmarks.find((idx) => idx < state.currentIndex);

  if (prevBookmark !== undefined) {
    wasSkipped = true;
    state.currentIndex = prevBookmark;
    notifyStateChange();

    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    if (skipResolve) {
      skipResolve();
    }
  } else if (state.loopEnabled && sortedBookmarks.length > 0) {
    // Loop to last bookmark
    wasSkipped = true;
    state.currentIndex = sortedBookmarks[0]; // sortedBookmarks is reverse sorted, so [0] is highest
    notifyStateChange();

    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    if (skipResolve) {
      skipResolve();
    }
  }
}

export function skipToNext() {
  if (state.status === 'idle' || state.status === 'stopped') return;

  // Mark as skipped so playLoop doesn't double-increment
  wasSkipped = true;

  // Update index first
  state.currentIndex++;
  notifyStateChange();

  // Stop current audio and trigger skip
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  // Immediately resolve the playAudioAtIndex promise so loop continues
  if (skipResolve) {
    skipResolve();
  }
}

export function skipToPrevious() {
  if (state.status === 'idle' || state.status === 'stopped') return;

  // Mark as skipped so playLoop doesn't double-increment
  wasSkipped = true;

  // Update index first
  if (state.currentIndex > 0) {
    state.currentIndex--;
  }
  notifyStateChange();

  // Stop current audio and trigger skip
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  // Immediately resolve the playAudioAtIndex promise so loop continues
  if (skipResolve) {
    skipResolve();
  }
}

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

function handleKeydown(e: KeyboardEvent) {
  // Ignore if typing in an input
  const target = e.target as HTMLElement;
  const tag = (target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
    return;
  }

  switch (e.key.toLowerCase()) {
    case ' ': // Space - play/pause
      e.preventDefault();
      if (state.status === 'playing') {
        pausePlayback();
      } else if (state.status === 'paused') {
        resumePlayback();
      } else if (state.status === 'idle' || state.status === 'stopped') {
        startPlayAll(0);
      }
      break;

    case 'escape': // Esc - stop
      if (state.status !== 'idle' && state.status !== 'stopped') {
        e.preventDefault();
        stopPlayback();
      }
      break;

    case 'arrowright': // Right arrow - next (Shift for bookmark)
      if (state.status === 'playing' || state.status === 'paused') {
        e.preventDefault();
        if (e.shiftKey) {
          skipToNextBookmark();
        } else {
          skipToNext();
        }
      }
      break;

    case 'arrowleft': // Left arrow - previous (Shift for bookmark)
      if (state.status === 'playing' || state.status === 'paused') {
        e.preventDefault();
        if (e.shiftKey) {
          skipToPrevBookmark();
        } else {
          skipToPrevious();
        }
      }
      break;

    case 'l': // L - toggle loop
      e.preventDefault();
      toggleLoop();
      break;

    case 'b': // B - toggle bookmark
      if (state.status === 'playing' || state.status === 'paused') {
        e.preventDefault();
        toggleBookmark();
      }
      break;
  }
}

export function registerKeyboardShortcuts() {
  if (shortcutRegistered) return;
  window.addEventListener('keydown', handleKeydown);
  shortcutRegistered = true;
}

export function unregisterKeyboardShortcuts() {
  if (!shortcutRegistered) return;
  window.removeEventListener('keydown', handleKeydown);
  shortcutRegistered = false;
}
