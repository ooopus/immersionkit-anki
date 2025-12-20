import { getConfig } from './config';
import { sleep, filenameFromUrl, isHttpUrl, $all } from './utils';


function findSecondaryMenuFromTrigger(triggerEl?: Element | null): Element | null {
  if (!triggerEl) return null;
  const menu = triggerEl.closest('.ui.secondary.menu');
  if (menu) return menu;
  // try sibling scan when trigger is not inside menu
  const container = triggerEl.closest('span.mobile.or.lower.hidden') || triggerEl.closest('span.mobile.only');
  if (container) {
    const m = container.querySelector('.ui.secondary.menu');
    if (m) return m;
  }
  return null;
}

function findShellAfterItemFromMenu(menu: Element | null): Element | null {
  if (!menu) return null;
  // menu is inside span.mobile..., want that span
  const span = menu.closest('span.mobile.or.lower.hidden') || menu.closest('span.mobile.only');
  if (!span) return null;
  return span as Element;
}

function findMiningAnchor(menu: Element | null): HTMLAnchorElement | null {
  if (!menu) return null;
  const items = $all('a.item', menu) as HTMLAnchorElement[];
  const a = items.find((el) => /mining/i.test((el.textContent || '').trim()));
  return (a as HTMLAnchorElement) || null;
}

function findActiveMiningSegment(shell: Element | null): Element | null {
  if (!shell) return null;
  return (
    shell.querySelector('div.ui.segment.active.tab, div.ui.tab.segment.active, div.ui.segment.active') || null
  );
}

function findSoundButton(seg: Element | null): HTMLButtonElement | null {
  if (!seg) return null;
  const btns = $all('button.ui.basic.icon.left.labeled.button, button.ui.icon.button, button', seg);
  const b = btns.find(
    (el) => !!(el.querySelector('i.sound.icon') || /sound|audio/i.test((el.textContent || '').trim())),
  );
  return (b as HTMLButtonElement) || null;
}

export async function captureAudioUrlFromMining(triggerEl?: Element | null): Promise<{ url: string; filename: string } | null> {
  // 1) resolve menu and Mining tab
  const menu = findSecondaryMenuFromTrigger(triggerEl);
  if (!menu) return null;
  const miningA = findMiningAnchor(menu);
  if (!miningA) return null;

  // 2) ensure Mining active
  if (!miningA.classList.contains('active')) {
    try { miningA.click(); } catch { }
    await sleep(120);
  }

  // 3) find mining segment + sound button
  const shell = findShellAfterItemFromMenu(menu);
  if (!shell) return null;
  const seg = findActiveMiningSegment(shell);
  if (!seg) return null;
  const soundBtn = findSoundButton(seg);
  if (!soundBtn) return null;

  // 4) install one-shot capture: intercept writeText + copy fallback
  const captured = { fromWriteText: null as string | null, fromCopy: null as string | null, done: false };
  const onCopy = (e: ClipboardEvent) => {
    try {
      const t = e.clipboardData?.getData('text/plain');
      if (t && !captured.done) {
        captured.fromCopy = String(t);
        captured.done = true;
        cleanup();
      }
    } catch { }
  };
  document.addEventListener('copy', onCopy, true);

  const clip: Clipboard = navigator.clipboard as Clipboard;
  let restore = () => { };
  try {
    const orig = (clip.writeText as (t: string) => Promise<void>).bind(clip);
    (clip as any).writeText = async function(text: unknown) {
      if (!captured.done && isHttpUrl(text)) {
        captured.fromWriteText = String(text);
        captured.done = true;
        cleanup();
      }
      try { return await orig(String(text ?? '')); } catch (e) { return Promise.reject(e); }
    };
    restore = () => { try { (clip as any).writeText = orig; } catch { } };
  } catch {
    try {
      const proto = Object.getPrototypeOf(clip);
      const orig2 = proto.writeText.bind(clip);
      Object.defineProperty(proto, 'writeText', {
        configurable: true,
        value: async function(text: unknown) {
          if (!captured.done && isHttpUrl(text)) {
            captured.fromWriteText = String(text);
            captured.done = true;
            cleanup();
          }
          try { return await orig2(String(text ?? '')); } catch (e) { return Promise.reject(e); }
        }
      });
      restore = () => { try { Object.defineProperty(Object.getPrototypeOf(clip), 'writeText', { configurable: true, value: orig2 }); } catch { } };
    } catch { }
  }

  function cleanup() {
    try { document.removeEventListener('copy', onCopy, true); } catch { }
    try { restore(); } catch { }
  }

  // 5) click sound
  try { soundBtn.click(); } catch { }

  // 6) await capture
  const t0 = performance.now();
  const { CAPTURE_TIMEOUT_MS } = getConfig();
  while (!captured.done && performance.now() - t0 < CAPTURE_TIMEOUT_MS) {
    await sleep(40);
  }
  cleanup();

  const finalUrl = captured.fromWriteText || captured.fromCopy;
  if (!finalUrl || !isHttpUrl(finalUrl)) return null;
  const filename = filenameFromUrl(finalUrl, 'audio.mp3');
  return { url: finalUrl, filename };
}
