/**
 * Shared Utility Functions
 * 
 * Common utility functions used across the userscript modules.
 */

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Resolve a relative URL to an absolute URL.
 */
export function resolveAbsoluteUrl(srcAttr: string): string {
  try {
    return new URL(srcAttr, window.location.origin).href;
  } catch {
    return srcAttr;
  }
}

/**
 * Extract filename from a URL, with fallback.
 */
export function filenameFromUrl(u: string, fallback: string): string {
  try {
    const name = (new URL(u).pathname.split('/').pop() || '').split('?')[0];
    return decodeURIComponent(name) || fallback;
  } catch {
    const p = (u || '').split('/').pop() || '';
    return decodeURIComponent(p.split('?')[0]) || fallback;
  }
}

/**
 * Check if a value is an HTTP/HTTPS URL string.
 */
export function isHttpUrl(text: unknown): text is string {
  return typeof text === 'string' && /^https?:\/\//i.test(text);
}

/**
 * Select all elements matching a selector.
 */
export function $all(sel: string, root: Document | Element = document): Element[] {
  return Array.from(root.querySelectorAll(sel));
}

/**
 * Wait for an element to appear in the DOM.
 * @param selector CSS selector to wait for
 * @param timeoutMs Maximum time to wait (default 10000ms)
 * @returns Promise that resolves with the element or null if timeout
 */
export function waitForElement(selector: string, timeoutMs = 10000): Promise<Element | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector(selector));
    }, timeoutMs);
  });
}

/**
 * Check if the event target is a text input element.
 * Used to prevent keyboard shortcuts from firing when typing in inputs.
 */
export function isTextInputTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as HTMLElement;
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return Boolean(el.isContentEditable);
}
