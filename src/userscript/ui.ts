/**
 * UI Module - Entry Point
 * 
 * This is the main entry point for the userscript.
 * It coordinates initialization and provides the public API.
 */

import { injectStyles } from './dom';
import { GM_registerMenuCommand } from '$';
import { openSettingsOverlay } from './settings-ui';
import { injectPlayAllBar } from './playAllBar';
import { insertAnkiButtons, observeNewMenus, injectYahooSearchButton } from './menuInjector';

let stylesInjected = false;

function init() {
  if (!stylesInjected) {
    injectStyles();
    stylesInjected = true;
  }
  observeNewMenus();
  setTimeout(() => {
    insertAnkiButtons();
    injectPlayAllBar();
    injectYahooSearchButton();
  }, 1000);
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

export function registerMenu() {
  GM_registerMenuCommand('设置（ImmersionKit → Anki）', () => {
    openSettingsOverlay();
  });
}
