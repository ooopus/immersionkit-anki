/**
 * Menu Injector Module
 * 
 * Handles injecting Anki buttons into ImmersionKit page menus.
 */

import { getExampleGroups, getExampleIndexFromMenu, validatePageStructure } from './exampleGroup';
import { hasImageAtIndex, addMediaToAnkiForIndex, addBothMediaToAnkiForIndex } from './mediaHandler';

/**
 * Inject Anki buttons into a menu element.
 * @param menuEl - The .ui.secondary.menu element to inject buttons into
 * @param exampleIndex - The index of the example this menu corresponds to
 */
export function injectMenuButtons(menuEl: Element, exampleIndex: number): void {
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
 * Inject Yahoo search button next to the search box.
 */
export function injectYahooSearchButton(): void {
  // Check if already injected
  if (document.querySelector('[data-anki="yahoo-search"]')) return;

  // Get keyword from URL
  const url = new URL(window.location.href);
  const keyword = url.searchParams.get('keyword');
  if (!keyword) return;

  // Find the search input container
  const searchContainer = document.querySelector('.ui.fluid.right.action.left.icon.right.labeled.input.icon');
  if (!searchContainer) return;

  // Create Yahoo search button
  const yahooBtn = document.createElement('a');
  yahooBtn.className = 'ui basic button';
  yahooBtn.href = `https://news.yahoo.co.jp/search?p=${encodeURIComponent(keyword)}&ei=utf-8`;
  yahooBtn.target = '_blank';
  yahooBtn.rel = 'noopener noreferrer';
  yahooBtn.dataset.anki = 'yahoo-search';
  yahooBtn.textContent = 'Yahoo同词';
  yahooBtn.style.marginLeft = '8px';
  yahooBtn.style.whiteSpace = 'nowrap';

  // Insert after the search container
  searchContainer.parentNode?.insertBefore(yahooBtn, searchContainer.nextSibling);
  console.log('[Anki] Yahoo同词按钮已添加到搜索框旁边');
}

/**
 * Insert Anki buttons using the new 5-element grouping strategy.
 */
export function insertAnkiButtons() {
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

let menuObserver: MutationObserver | null = null;

/**
 * Observe for new menus being added to the page and inject buttons into them.
 * Uses MutationObserver to handle dynamically loaded content.
 */
export function observeNewMenus() {
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
