/**
 * Play All Audio Module
 * Provides sequential audio playback with auto-pagination, keyboard shortcuts, and loop mode.
 */

import { captureAudioUrlFromMining } from './miningSoundCapture';
import { getExampleGroups } from './exampleGroup';
import { SELECTORS, CLASSES } from './selectors';
import { StateManager } from './state';
import { isTextInputTarget } from './utils';
import type { PlayAllStatus, PlayAllState } from './types';

// Re-export types for consumers
export type { PlayAllStatus, PlayAllState };

/**
 * Internal state extends the public PlayAllState with additional fields
 * for managing playback internals.
 */
interface PlayAllInternalState extends PlayAllState {
  wasSkipped: boolean;
}

// Initialize state manager with internal state
const stateManager = new StateManager<PlayAllInternalState>({
  status: 'idle',
  currentIndex: 0,
  totalOnPage: 0,
  loopEnabled: false,
  bookmarkedIndices: new Set<number>(),
  wasSkipped: false,
});

// Non-state runtime references (these are not part of serializable state)
let currentAudio: HTMLAudioElement | null = null;
let skipResolve: (() => void) | null = null;
let shortcutRegistered = false;

// ============================================================================
// State Helpers
// ============================================================================

export function onStateChange(fn: (s: PlayAllState) => void): () => void {
  return stateManager.subscribe(fn);
}

export function getState(): PlayAllState {
  const s = stateManager.getState();
  // Return only public state (exclude internal fields like wasSkipped)
  return {
    status: s.status,
    currentIndex: s.currentIndex,
    totalOnPage: s.totalOnPage,
    loopEnabled: s.loopEnabled,
    bookmarkedIndices: s.bookmarkedIndices,
  };
}

function highlightExample(index: number) {
  const groups = getExampleGroups();
  const group = groups[index];
  if (!group) return;

  // Move previous highlight to "leaving" state for fade-out animation
  document.querySelectorAll(SELECTORS.PLAYALL_HIGHLIGHT).forEach((el) => {
    el.classList.remove(CLASSES.HIGHLIGHT);
    // Only add leaving class if it's a different element
    if (el !== group.exampleDesktop) {
      el.classList.add(CLASSES.LEAVING);
      // Clean up leaving class after animation completes
      setTimeout(() => {
        el.classList.remove(CLASSES.LEAVING);
      }, 800);
    }
  });

  // Also handle the mining segment - find and animate the sibling segment
  document.querySelectorAll(`.${CLASSES.HIGHLIGHT_SEGMENT}`).forEach((el) => {
    el.classList.remove(CLASSES.HIGHLIGHT_SEGMENT);
  });

  // Also clean up any existing leaving elements that might conflict
  document.querySelectorAll(`.${CLASSES.LEAVING}`).forEach((el) => {
    if (el === group.exampleDesktop) {
      el.classList.remove(CLASSES.LEAVING);
    }
  });

  // Add highlight to desktop example with enter animation
  group.exampleDesktop.classList.add(CLASSES.HIGHLIGHT);

  // Find and highlight the following mining segment (ui segment active tab)
  // It's typically a sibling element after the example item
  const miningSpan = group.exampleDesktop.nextElementSibling;
  if (miningSpan) {
    const miningSegment = miningSpan.querySelector('div.ui.segment.active.tab');
    if (miningSegment) {
      miningSegment.classList.add(CLASSES.HIGHLIGHT_SEGMENT);
    }
  }

  // Scroll into view
  group.exampleDesktop.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function updateBookmarkVisuals() {
  const groups = getExampleGroups();
  const { bookmarkedIndices } = stateManager.getState();
  groups.forEach((group, idx) => {
    if (bookmarkedIndices.has(idx)) {
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
  while (stateManager.getState().status === 'playing') {
    const groups = getExampleGroups();
    stateManager.setState({ totalOnPage: groups.length });

    const state = stateManager.getState();
    if (state.currentIndex >= groups.length) {
      // Try to go to next page
      const hasNextPage = await goToNextPage();
      if (hasNextPage) {
        stateManager.setState({ currentIndex: 0 });
        continue;
      } else {
        // No more pages
        if (state.loopEnabled) {
          // Restart from beginning - need to go back to first page
          // For now, just restart current page
          stateManager.setState({ currentIndex: 0 });
          continue;
        } else {
          // Stop playback
          stateManager.setState({ status: 'stopped', currentIndex: 0 });
          clearHighlight();
          return;
        }
      }
    }

    // Highlight current example
    highlightExample(state.currentIndex);

    // Play audio
    await playAudioAtIndex(state.currentIndex);

    // Check if paused during playback
    if (stateManager.getState().status === 'paused') {
      // Wait until resumed or stopped
      await new Promise<void>((resolve) => {
        const unsubscribe = onStateChange((s) => {
          if (s.status !== 'paused') {
            unsubscribe();
            resolve();
          }
        });
      });

      if (stateManager.getState().status === 'stopped') {
        clearHighlight();
        return;
      }
    }

    if (stateManager.getState().status === 'stopped') {
      clearHighlight();
      return;
    }

    // Move to next only if not skipped (skip functions already update the index)
    const currentState = stateManager.getState();
    if (!currentState.wasSkipped) {
      stateManager.setState({ currentIndex: currentState.currentIndex + 1 });
    }
    stateManager.setState({ wasSkipped: false });
  }
}

// ============================================================================
// Public Controls
// ============================================================================

export function startPlayAll(fromIndex = 0) {
  if (stateManager.getState().status === 'playing') return;

  stateManager.setState({
    status: 'playing',
    currentIndex: fromIndex,
    totalOnPage: getExampleGroups().length,
  });

  playLoop();
}

export function pausePlayback() {
  if (stateManager.getState().status !== 'playing') return;

  stateManager.setState({ status: 'paused' });
  if (currentAudio) {
    currentAudio.pause();
  }
}

export function resumePlayback() {
  if (stateManager.getState().status !== 'paused') return;

  stateManager.setState({ status: 'playing' });
  if (currentAudio) {
    currentAudio.play().catch(console.error);
  }

  // Continue the loop
  playLoop();
}

export function stopPlayback() {
  stateManager.setState({ status: 'stopped', currentIndex: 0 });
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  clearHighlight();
}

export function toggleLoop() {
  const { loopEnabled } = stateManager.getState();
  stateManager.setState({ loopEnabled: !loopEnabled });
}

// ============================================================================
// Bookmark Controls
// ============================================================================

export function toggleBookmark() {
  const { currentIndex, bookmarkedIndices } = stateManager.getState();
  const newBookmarks = new Set(bookmarkedIndices);
  if (newBookmarks.has(currentIndex)) {
    newBookmarks.delete(currentIndex);
  } else {
    newBookmarks.add(currentIndex);
  }
  stateManager.setState({ bookmarkedIndices: newBookmarks });
  updateBookmarkVisuals();
}

export function isCurrentBookmarked(): boolean {
  const { currentIndex, bookmarkedIndices } = stateManager.getState();
  return bookmarkedIndices.has(currentIndex);
}

export function getBookmarkCount(): number {
  return stateManager.getState().bookmarkedIndices.size;
}

export function clearAllBookmarks() {
  stateManager.setState({ bookmarkedIndices: new Set() });
  updateBookmarkVisuals();
}

export function skipToNextBookmark() {
  const state = stateManager.getState();
  if (state.status === 'idle' || state.status === 'stopped') return;
  if (state.bookmarkedIndices.size === 0) return;

  const sortedBookmarks = Array.from(state.bookmarkedIndices).sort((a, b) => a - b);
  const nextBookmark = sortedBookmarks.find((idx) => idx > state.currentIndex);

  if (nextBookmark !== undefined) {
    stateManager.setState({ wasSkipped: true, currentIndex: nextBookmark });

    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    if (skipResolve) {
      skipResolve();
    }
  } else if (state.loopEnabled && sortedBookmarks.length > 0) {
    // Loop to first bookmark
    stateManager.setState({ wasSkipped: true, currentIndex: sortedBookmarks[0] });

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
  const state = stateManager.getState();
  if (state.status === 'idle' || state.status === 'stopped') return;
  if (state.bookmarkedIndices.size === 0) return;

  const sortedBookmarks = Array.from(state.bookmarkedIndices).sort((a, b) => b - a);
  const prevBookmark = sortedBookmarks.find((idx) => idx < state.currentIndex);

  if (prevBookmark !== undefined) {
    stateManager.setState({ wasSkipped: true, currentIndex: prevBookmark });

    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    if (skipResolve) {
      skipResolve();
    }
  } else if (state.loopEnabled && sortedBookmarks.length > 0) {
    // Loop to last bookmark
    stateManager.setState({ wasSkipped: true, currentIndex: sortedBookmarks[0] }); // sortedBookmarks is reverse sorted, so [0] is highest

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
  const state = stateManager.getState();
  if (state.status === 'idle' || state.status === 'stopped') return;

  // Mark as skipped so playLoop doesn't double-increment
  stateManager.setState({ wasSkipped: true, currentIndex: state.currentIndex + 1 });

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
  const state = stateManager.getState();
  if (state.status === 'idle' || state.status === 'stopped') return;

  // Mark as skipped so playLoop doesn't double-increment
  const newIndex = state.currentIndex > 0 ? state.currentIndex - 1 : 0;
  stateManager.setState({ wasSkipped: true, currentIndex: newIndex });

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
  if (isTextInputTarget(e.target)) {
    return;
  }

  const state = stateManager.getState();

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
