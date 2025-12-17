import { GM_addStyle } from '$';
import modalCss from './modal.css?raw';
import type { ButtonState } from './types';

export function setButtonState(el: Element | null, state: ButtonState, text?: string) {
  if (!el) return;
  const node = el as HTMLElement;
  if (!node.dataset.ankiOriginalText) {
    node.dataset.ankiOriginalText = node.textContent || '';
  }
  node.classList.remove('anki-feedback-pending', 'anki-feedback-success', 'anki-feedback-error');
  if (state === 'idle') {
    node.textContent = node.dataset.ankiOriginalText;
    if (node.tagName === 'BUTTON') (node as HTMLButtonElement).disabled = false;
    return;
  }
  if (state === 'pending') {
    node.classList.add('anki-feedback-pending');
    if (node.tagName === 'BUTTON') (node as HTMLButtonElement).disabled = true;
    node.textContent = text || '添加中…';
    return;
  }
  if (state === 'success') {
    node.classList.add('anki-feedback-success');
    if (node.tagName === 'BUTTON') (node as HTMLButtonElement).disabled = false;
    node.textContent = text || '已添加';
    return;
  }
  if (state === 'error') {
    node.classList.add('anki-feedback-error');
    if (node.tagName === 'BUTTON') (node as HTMLButtonElement).disabled = false;
    node.textContent = text || '添加失败';
  }
}

export function revertButtonState(el: Element | null) {
  if (!el) return;
  const node = el as HTMLElement;
  node.classList.remove('anki-feedback-pending', 'anki-feedback-success', 'anki-feedback-error');
  if (node.tagName === 'BUTTON') (node as HTMLButtonElement).disabled = false;
  node.textContent = node.dataset.ankiOriginalText || node.textContent;
}

export function getSuccessText(mediaType: 'picture' | 'audio') {
  return mediaType === 'picture' ? '图片添加成功' : '音频添加成功';
}

export function injectStyles() {
  const css = modalCss;
  if (typeof GM_addStyle === 'function') {
    GM_addStyle(css);
  } else {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }
}


export function showModal(opts: {
  title: string;
  html: string;
  confirmText?: string;
  cancelText?: string;
  allowCancel?: boolean;
  danger?: boolean;
  onConfirm?: (root: HTMLElement) => boolean | Promise<boolean>;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'anki-modal-overlay';
    const modal = document.createElement('div');
    modal.className = 'anki-modal';
    modal.innerHTML = `
      <header>${opts.title || ''}</header>
      <main>${opts.html || ''}</main>
      <footer>
        ${opts.allowCancel === false ? '' : `<button class="anki-btn">${opts.cancelText || '取消'}</button>`}
        <button class="anki-btn ${opts.danger ? 'danger' : 'primary'}">${opts.confirmText || '确定'}</button>
      </footer>
    `;
    overlay.appendChild(modal);
    function cleanup() {
      overlay.remove();
    }
    function onResolve(val: boolean) {
      cleanup();
      resolve(val);
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && opts.allowCancel !== false) onResolve(false);
    });
    const footer = modal.querySelector('footer')!;
    const buttons = Array.from(footer.querySelectorAll('button')) as HTMLButtonElement[];
    const cancelBtn = buttons.length === 2 ? buttons[0] : null;
    const confirmBtn = buttons[buttons.length - 1];
    if (cancelBtn) cancelBtn.addEventListener('click', () => onResolve(false));
    confirmBtn.addEventListener('click', async () => {
      if (opts.onConfirm) {
        try {
          const ok = await opts.onConfirm(modal);
          if (ok === false) return;
        } catch { }
      }
      onResolve(true);
    });
    document.body.appendChild(overlay);
  });
}
