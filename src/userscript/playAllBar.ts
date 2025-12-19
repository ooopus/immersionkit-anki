/**
 * Play All Audio Control Bar UI
 * Creates and manages the floating control bar for play-all functionality.
 */

import {
  getState,
  onStateChange,
  startPlayAll,
  pausePlayback,
  resumePlayback,
  stopPlayback,
  toggleLoop,
  skipToPrevious,
  skipToNext,
  registerKeyboardShortcuts,
  toggleBookmark,
  skipToNextBookmark,
  skipToPrevBookmark,
  type PlayAllState,
} from './playAllAudio';

let barElement: HTMLElement | null = null;
let unsubscribe: (() => void) | null = null;

function createControlBar(): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'anki-playall-bar';
  bar.id = 'anki-playall-bar';

  bar.innerHTML = `
    <button class="anki-playall-btn primary" data-action="play" title="播放全部 (Space)">
      ▶ 播放全部
    </button>
    <button class="anki-playall-btn warning" data-action="pause" title="暂停 (Space)" style="display: none;">
      ⏸ 暂停
    </button>
    <button class="anki-playall-btn primary" data-action="resume" title="继续 (Space)" style="display: none;">
      ▶ 继续
    </button>
    <button class="anki-playall-btn danger" data-action="stop" title="停止 (Esc)" style="display: none;">
      ⏹ 停止
    </button>
    <button class="anki-playall-btn" data-action="prev" title="上一个 (←)" style="display: none;">
      ⏮
    </button>
    <button class="anki-playall-btn" data-action="next" title="下一个 (→)" style="display: none;">
      ⏭
    </button>
    <div class="anki-playall-progress" style="display: none;">
      <span class="current">0</span> / <span class="total">0</span>
    </div>
    <button class="anki-playall-btn" data-action="bookmark" title="标记当前 (B)" style="display: none;">
      🔖 标记
    </button>
    <button class="anki-playall-btn" data-action="prevBookmark" title="上一标记 (Shift+←)" style="display: none;">
      ⏮🔖
    </button>
    <button class="anki-playall-btn" data-action="nextBookmark" title="下一标记 (Shift+→)" style="display: none;">
      🔖⏭
    </button>
    <div class="anki-playall-bookmark-count" style="display: none;">
      <span class="count">0</span> 个标记
    </div>
    <button class="anki-playall-btn" data-action="loop" title="循环模式 (L)">
      🔁 循环
    </button>
    <div class="anki-playall-shortcuts">
      <kbd>Space</kbd> 播放/暂停
      <kbd>Esc</kbd> 停止
      <kbd>← →</kbd> 上/下一个
      <kbd>B</kbd> 标记
      <kbd>Shift+← →</kbd> 标记跳转
      <kbd>L</kbd> 循环
    </div>
  `;

  // Attach event listeners
  bar.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const action = (btn as HTMLElement).dataset.action;
      switch (action) {
        case 'play':
          startPlayAll(0);
          break;
        case 'pause':
          pausePlayback();
          break;
        case 'resume':
          resumePlayback();
          break;
        case 'stop':
          stopPlayback();
          break;
        case 'prev':
          skipToPrevious();
          break;
        case 'next':
          skipToNext();
          break;
        case 'loop':
          toggleLoop();
          break;
        case 'bookmark':
          toggleBookmark();
          break;
        case 'prevBookmark':
          skipToPrevBookmark();
          break;
        case 'nextBookmark':
          skipToNextBookmark();
          break;
      }
    });
  });

  return bar;
}

function updateBarUI(state: PlayAllState) {
  if (!barElement) return;

  const playBtn = barElement.querySelector('[data-action="play"]') as HTMLElement;
  const pauseBtn = barElement.querySelector('[data-action="pause"]') as HTMLElement;
  const resumeBtn = barElement.querySelector('[data-action="resume"]') as HTMLElement;
  const stopBtn = barElement.querySelector('[data-action="stop"]') as HTMLElement;
  const prevBtn = barElement.querySelector('[data-action="prev"]') as HTMLElement;
  const nextBtn = barElement.querySelector('[data-action="next"]') as HTMLElement;
  const progress = barElement.querySelector('.anki-playall-progress') as HTMLElement;
  const loopBtn = barElement.querySelector('[data-action="loop"]') as HTMLElement;
  const bookmarkBtn = barElement.querySelector('[data-action="bookmark"]') as HTMLElement;
  const prevBookmarkBtn = barElement.querySelector('[data-action="prevBookmark"]') as HTMLElement;
  const nextBookmarkBtn = barElement.querySelector('[data-action="nextBookmark"]') as HTMLElement;
  const bookmarkCount = barElement.querySelector('.anki-playall-bookmark-count') as HTMLElement;

  // Hide all first
  playBtn.style.display = 'none';
  pauseBtn.style.display = 'none';
  resumeBtn.style.display = 'none';
  stopBtn.style.display = 'none';
  prevBtn.style.display = 'none';
  nextBtn.style.display = 'none';
  progress.style.display = 'none';
  bookmarkBtn.style.display = 'none';
  prevBookmarkBtn.style.display = 'none';
  nextBookmarkBtn.style.display = 'none';
  bookmarkCount.style.display = 'none';

  switch (state.status) {
    case 'idle':
    case 'stopped':
      playBtn.style.display = '';
      break;
    case 'playing':
      pauseBtn.style.display = '';
      stopBtn.style.display = '';
      prevBtn.style.display = '';
      nextBtn.style.display = '';
      progress.style.display = '';
      bookmarkBtn.style.display = '';
      prevBookmarkBtn.style.display = '';
      nextBookmarkBtn.style.display = '';
      bookmarkCount.style.display = '';
      break;
    case 'paused':
      resumeBtn.style.display = '';
      stopBtn.style.display = '';
      prevBtn.style.display = '';
      nextBtn.style.display = '';
      progress.style.display = '';
      bookmarkBtn.style.display = '';
      prevBookmarkBtn.style.display = '';
      nextBookmarkBtn.style.display = '';
      bookmarkCount.style.display = '';
      break;
  }

  // Update progress
  const currentSpan = progress.querySelector('.current');
  const totalSpan = progress.querySelector('.total');
  if (currentSpan) currentSpan.textContent = String(state.currentIndex + 1);
  if (totalSpan) totalSpan.textContent = String(state.totalOnPage);

  // Update loop button
  if (state.loopEnabled) {
    loopBtn.classList.add('active');
  } else {
    loopBtn.classList.remove('active');
  }

  // Update bookmark button and count
  if (state.bookmarkedIndices.has(state.currentIndex)) {
    bookmarkBtn.classList.add('active');
  } else {
    bookmarkBtn.classList.remove('active');
  }
  const countSpan = bookmarkCount.querySelector('.count');
  if (countSpan) countSpan.textContent = String(state.bookmarkedIndices.size);
}

export function injectPlayAllBar() {
  // Don't inject if already exists
  if (document.getElementById('anki-playall-bar')) return;

  // Find the container to inject before
  const container = document.querySelector('.ui.divided.items');
  if (!container || !container.parentElement) return;

  barElement = createControlBar();
  container.parentElement.insertBefore(barElement, container);

  // Subscribe to state changes
  unsubscribe = onStateChange(updateBarUI);

  // Initialize with current state
  updateBarUI(getState());

  // Register keyboard shortcuts
  registerKeyboardShortcuts();
}

export function removePlayAllBar() {
  if (barElement) {
    barElement.remove();
    barElement = null;
  }
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
