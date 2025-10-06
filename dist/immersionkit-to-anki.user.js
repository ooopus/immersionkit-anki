// ==UserScript==
// @name         ImmersionKit → Anki
// @namespace    immersionkit_to_anki
// @version      1.1.0
// @description  Add example images and audio from ImmersionKit's dictionary pages to your latest Anki note via AnkiConnect.
// @icon         https://vitejs.dev/logo.svg
// @match        https://www.immersionkit.com/dictionary*
// @connect      apiv2.immersionkit.com
// @connect      us-southeast-1.linodeobjects.com
// @connect      127.0.0.1
// @connect      localhost
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    ANKI_CONNECT_URL: "http://127.0.0.1:8765",
    ANKI_CONNECT_KEY: null,
    IMAGE_FIELD_NAME: "Picture",
    AUDIO_FIELD_NAME: "SentenceAudio",
    EXAMPLE_INDEX: 0,
    CONFIRM_OVERWRITE: true
  };
  var _GM_addStyle = (() => typeof GM_addStyle != "undefined" ? GM_addStyle : void 0)();
  var _GM_getValue = (() => typeof GM_getValue != "undefined" ? GM_getValue : void 0)();
  var _GM_registerMenuCommand = (() => typeof GM_registerMenuCommand != "undefined" ? GM_registerMenuCommand : void 0)();
  var _GM_setValue = (() => typeof GM_setValue != "undefined" ? GM_setValue : void 0)();
  var _GM_xmlhttpRequest = (() => typeof GM_xmlhttpRequest != "undefined" ? GM_xmlhttpRequest : void 0)();
  function fetchExamples(keyword) {
    return new Promise((resolve, reject) => {
      const url = `https://apiv2.immersionkit.com/search?q=${encodeURIComponent(keyword)}`;
      _GM_xmlhttpRequest({
        method: "GET",
        url,
        onload: (res) => {
          try {
            const data = JSON.parse(res.responseText);
            if (data && Array.isArray(data.examples) && data.examples.length > 0) {
              resolve(data.examples);
            } else {
              reject(new Error("No examples returned from ImmersionKit API"));
            }
          } catch (e) {
            reject(new Error("Failed to parse ImmersionKit API response" + e));
          }
        },
        onerror: () => reject(new Error("Failed to request ImmersionKit API"))
      });
    });
  }
  function buildMediaTargets(example, mediaType) {
    const prefix = "https://us-southeast-1.linodeobjects.com/immersionkit/media";
    let category = "";
    if (example.id && typeof example.id === "string") {
      const parts = example.id.split("_");
      if (parts.length > 0) category = parts[0];
    }
    function toTitleCaseWords(s) {
      return s.split(/\s+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
    let rawTitle = typeof example.title === "string" ? example.title : "";
    rawTitle = rawTitle.replace(/_/g, " ").replace(/\s+/g, " ").trim();
    const titleFolder = toTitleCaseWords(rawTitle);
    const encTitleFolder = encodeURIComponent(titleFolder);
    const filename = mediaType === "picture" ? example.image || "" : example.sound || "";
    const encFilename = encodeURIComponent(filename);
    const directUrl = `${prefix}/${category}/${encTitleFolder}/media/${encFilename}`;
    const rawPath = `media/${category}/${titleFolder}/media/${filename}`;
    const apiUrl = `https://apiv2.immersionkit.com/download_media?path=${encodeURIComponent(rawPath)}`;
    return { directUrl, apiUrl, filename };
  }
  function invokeAnkiConnect(action, params = {}) {
    const payload = { action, version: 6, params };
    if (CONFIG.ANKI_CONNECT_KEY) payload.key = CONFIG.ANKI_CONNECT_KEY;
    const endpoints = [CONFIG.ANKI_CONNECT_URL, "http://localhost:8765"];
    return new Promise((resolve, reject) => {
      let tried = 0;
      function tryNext() {
        if (tried >= endpoints.length) {
          reject(new Error("Failed to connect to AnkiConnect. Is Anki running?"));
          return;
        }
        const url = endpoints[tried++];
        _GM_xmlhttpRequest({
          method: "POST",
          url,
          data: JSON.stringify(payload),
          headers: { "Content-Type": "application/json" },
          onload: (res) => {
            try {
              const data = JSON.parse(res.responseText);
              if (data && typeof data === "object" && "error" in data) {
                const ac = data;
                if (ac.error) reject(new Error(ac.error));
                else resolve(ac.result);
              } else if (data && typeof data === "object" && "result" in data) {
                resolve(data.result);
              } else {
                resolve(data);
              }
            } catch (e) {
              reject(new Error("Failed to parse AnkiConnect response" + e));
            }
          },
          onerror: tryNext
        });
      }
      tryNext();
    });
  }
  async function getMostRecentNoteId() {
    const recentCards = await invokeAnkiConnect("findCards", { query: "added:1" });
    if (!recentCards || recentCards.length === 0) throw new Error("No cards added in the last 24 hours");
    const mostRecentCard = Math.max(...recentCards);
    const noteIds = await invokeAnkiConnect("cardsToNotes", { cards: [mostRecentCard] });
    const noteId = Array.isArray(noteIds) ? noteIds[0] : noteIds;
    if (!noteId) throw new Error("Could not resolve card to note");
    return noteId;
  }
  async function getNoteInfo(noteId) {
    const noteInfoList = await invokeAnkiConnect("notesInfo", { notes: [noteId] });
    const noteInfo = Array.isArray(noteInfoList) ? noteInfoList[0] : noteInfoList;
    return noteInfo || null;
  }
  async function ensureFieldOnNote(noteId, fieldName) {
    const noteInfoList = await invokeAnkiConnect("notesInfo", { notes: [noteId] });
    const noteInfo = Array.isArray(noteInfoList) ? noteInfoList[0] : noteInfoList;
    if (!noteInfo || !noteInfo.fields || !(fieldName in noteInfo.fields)) {
      throw new Error(`Field “${fieldName}” does not exist on the latest note`);
    }
  }
  async function attachMedia(noteId, mediaType, media, fieldName) {
    const mediaObject = { url: media.url, filename: media.filename, fields: [fieldName] };
    const noteUpdate = { id: noteId, fields: {} };
    if (mediaType === "picture") noteUpdate.picture = [mediaObject];
    else noteUpdate.audio = [mediaObject];
    await invokeAnkiConnect("updateNoteFields", { note: noteUpdate });
  }
  const modalCss = '.anki-feedback-pending {\r\n    opacity: .7;\r\n    pointer-events: none;\r\n}\r\n\r\n.anki-feedback-success {\r\n    color: #0a8f08 !important;\r\n}\r\n\r\n.anki-feedback-error {\r\n    color: #c62828 !important;\r\n}\r\n\r\n.anki-modal-overlay {\r\n    position: fixed;\r\n    inset: 0;\r\n    background: rgba(0, 0, 0, .45);\r\n    display: flex;\r\n    align-items: center;\r\n    justify-content: center;\r\n    z-index: 99999;\r\n}\r\n\r\n.anki-modal {\r\n    background: #fff;\r\n    border-radius: 10px;\r\n    box-shadow: 0 10px 30px rgba(0, 0, 0, .2);\r\n    width: min(560px, 92vw);\r\n    max-height: 90vh;\r\n    display: flex;\r\n    flex-direction: column;\r\n    overflow: hidden;\r\n    font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;\r\n}\r\n\r\n.anki-modal header {\r\n    padding: 14px 18px;\r\n    border-bottom: 1px solid #eee;\r\n    font-weight: 600;\r\n    font-size: 15px;\r\n}\r\n\r\n.anki-modal main {\r\n    padding: 16px 18px;\r\n    overflow: auto;\r\n    font-size: 14px;\r\n    line-height: 1.5;\r\n    color: #333;\r\n}\r\n\r\n.anki-modal footer {\r\n    padding: 12px 18px;\r\n    border-top: 1px solid #eee;\r\n    display: flex;\r\n    gap: 10px;\r\n    justify-content: flex-end;\r\n    background: #fafafa;\r\n}\r\n\r\n.anki-btn {\r\n    appearance: none;\r\n    border: 1px solid #ccc;\r\n    background: #fff;\r\n    border-radius: 8px;\r\n    padding: 6px 12px;\r\n    cursor: pointer;\r\n    font-size: 14px;\r\n}\r\n\r\n.anki-btn.primary {\r\n    background: #2563eb;\r\n    border-color: #2563eb;\r\n    color: #fff;\r\n}\r\n\r\n.anki-btn.danger {\r\n    background: #c62828;\r\n    border-color: #c62828;\r\n    color: #fff;\r\n}\r\n\r\n.anki-form {\r\n    display: grid;\r\n    grid-template-columns: 130px 1fr;\r\n    gap: 10px 12px;\r\n    align-items: center;\r\n}\r\n\r\n.anki-form label {\r\n    font-weight: 600;\r\n    color: #444;\r\n}\r\n\r\n.anki-form input[type="text"],\r\n.anki-form input[type="number"],\r\n.anki-form input[type="password"] {\r\n    width: 100%;\r\n    padding: 8px 10px;\r\n    border: 1px solid #ddd;\r\n    border-radius: 8px;\r\n    font-size: 14px;\r\n}\r\n\r\n.anki-form .row-span-2 {\r\n    grid-column: 1 / -1\r\n}\r\n\r\n.anki-kv {\r\n    display: grid;\r\n    grid-template-columns: 120px 1fr;\r\n    gap: 8px 10px;\r\n    margin-bottom: 8px\r\n}\r\n\r\n.anki-kv .key {\r\n    color: #555;\r\n    font-weight: 600\r\n}\r\n\r\n.anki-pre {\r\n    background: #f7f7f9;\r\n    border: 1px solid #eee;\r\n    border-radius: 8px;\r\n    padding: 10px;\r\n    max-height: 180px;\r\n    overflow: auto;\r\n    white-space: pre-wrap;\r\n    word-break: break-word;\r\n}';
  function setButtonState(el, state, text) {
    if (!el) return;
    const node = el;
    if (!node.dataset.ankiOriginalText) {
      node.dataset.ankiOriginalText = node.textContent || "";
    }
    node.classList.remove("anki-feedback-pending", "anki-feedback-success", "anki-feedback-error");
    if (state === "idle") {
      node.textContent = node.dataset.ankiOriginalText;
      if (node.tagName === "BUTTON") node.disabled = false;
      return;
    }
    if (state === "pending") {
      node.classList.add("anki-feedback-pending");
      if (node.tagName === "BUTTON") node.disabled = true;
      node.textContent = text || "添加中…";
      return;
    }
    if (state === "success") {
      node.classList.add("anki-feedback-success");
      if (node.tagName === "BUTTON") node.disabled = false;
      node.textContent = text || "已添加";
      return;
    }
    if (state === "error") {
      node.classList.add("anki-feedback-error");
      if (node.tagName === "BUTTON") node.disabled = false;
      node.textContent = text || "添加失败";
    }
  }
  function revertButtonState(el) {
    if (!el) return;
    const node = el;
    node.classList.remove("anki-feedback-pending", "anki-feedback-success", "anki-feedback-error");
    if (node.tagName === "BUTTON") node.disabled = false;
    node.textContent = node.dataset.ankiOriginalText || node.textContent;
  }
  function getSuccessText(mediaType) {
    return mediaType === "picture" ? "图片添加成功" : "音频添加成功";
  }
  function injectStyles() {
    const css = modalCss;
    if (typeof _GM_addStyle === "function") {
      _GM_addStyle(css);
    } else {
      const style = document.createElement("style");
      style.textContent = css;
      document.head.appendChild(style);
    }
  }
  function showModal(opts) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "anki-modal-overlay";
      const modal = document.createElement("div");
      modal.className = "anki-modal";
      modal.innerHTML = `
      <header>${opts.title || ""}</header>
      <main>${opts.html || ""}</main>
      <footer>
        ${opts.allowCancel === false ? "" : `<button class="anki-btn">${opts.cancelText || "取消"}</button>`}
        <button class="anki-btn ${opts.danger ? "danger" : "primary"}">${opts.confirmText || "确定"}</button>
      </footer>
    `;
      overlay.appendChild(modal);
      function cleanup() {
        overlay.remove();
      }
      function onResolve(val) {
        cleanup();
        resolve(val);
      }
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay && opts.allowCancel !== false) onResolve(false);
      });
      const footer = modal.querySelector("footer");
      const buttons = Array.from(footer.querySelectorAll("button"));
      const cancelBtn = buttons.length === 2 ? buttons[0] : null;
      const confirmBtn = buttons[buttons.length - 1];
      if (cancelBtn) cancelBtn.addEventListener("click", () => onResolve(false));
      confirmBtn.addEventListener("click", async () => {
        if (opts.onConfirm) {
          try {
            const ok = await opts.onConfirm(modal);
            if (ok === false) return;
          } catch {
          }
        }
        onResolve(true);
      });
      document.body.appendChild(overlay);
    });
  }
  async function addMediaToAnkiForIndex(mediaType, exampleIndex, triggerEl) {
    const url = new URL(window.location.href);
    const keywordParam = url.searchParams.get("keyword");
    if (!keywordParam) {
      if (triggerEl) {
        setButtonState(triggerEl, "error", "未检测到关键词");
        setTimeout(() => revertButtonState(triggerEl), 2e3);
      }
      console.warn("Cannot determine keyword from URL");
      return;
    }
    const keyword = decodeURIComponent(keywordParam);
    try {
      if (triggerEl) setButtonState(triggerEl, "pending", "添加中…");
      const examples = await fetchExamples(keyword);
      let index = Number.isFinite(exampleIndex) ? exampleIndex : 0;
      if (index < 0) index = 0;
      if (index >= examples.length) index = examples.length - 1;
      const example = examples[index];
      if (!example) throw new Error("No example available");
      if (mediaType === "picture" && !example.image) throw new Error("Example has no image");
      if (mediaType === "audio" && !example.sound) throw new Error("Example has no audio");
      const { apiUrl, filename } = buildMediaTargets(example, mediaType);
      const fieldName = mediaType === "picture" ? CONFIG.IMAGE_FIELD_NAME : CONFIG.AUDIO_FIELD_NAME;
      const noteId = await getMostRecentNoteId();
      await ensureFieldOnNote(noteId, fieldName);
      if (CONFIG.CONFIRM_OVERWRITE) {
        const info = await getNoteInfo(noteId);
        const model = info?.modelName || "";
        const existing = info?.fields?.[fieldName]?.value || "";
        const hasExisting = typeof existing === "string" && existing.trim().length > 0;
        const html = `
        <div class="anki-kv"><div class="key">Note ID</div><div>${noteId}</div></div>
        <div class="anki-kv"><div class="key">Note Type</div><div>${model || "未知"}</div></div>
        <div class="anki-kv"><div class="key">字段</div><div>${fieldName}</div></div>
        ${hasExisting ? `<div class="anki-kv row-span-2"><div class="key">原有内容</div><div><div class="anki-pre">${escapeHtml(existing)}</div></div></div>` : ""}
        <div class="anki-kv"><div class="key">将添加</div><div>${filename}</div></div>
      `;
        const proceed = await showModal({
          title: hasExisting ? "覆盖字段内容？" : "添加媒体",
          html,
          confirmText: hasExisting ? "覆盖并添加" : "添加",
          danger: hasExisting
        });
        if (!proceed) {
          if (triggerEl) revertButtonState(triggerEl);
          return;
        }
      }
      await attachMedia(noteId, mediaType, { url: apiUrl, filename }, fieldName);
      if (triggerEl) {
        setButtonState(triggerEl, "success", getSuccessText(mediaType));
        setTimeout(() => revertButtonState(triggerEl), 2e3);
      }
    } catch (err) {
      if (triggerEl) {
        setButtonState(triggerEl, "error", "添加失败");
        setTimeout(() => revertButtonState(triggerEl), 2500);
      }
      console.error("Failed to add " + mediaType, err);
    }
  }
  function addMediaToAnki(mediaType, triggerEl) {
    return addMediaToAnkiForIndex(mediaType, CONFIG.EXAMPLE_INDEX, triggerEl);
  }
  function insertAnkiButtons() {
    let attempts = 0;
    const maxAttempts = 40;
    const interval = setInterval(() => {
      attempts++;
      const desktopMenus = Array.from(
        document.querySelectorAll("span.mobile.or.lower.hidden .ui.secondary.menu")
      );
      const mobileMenus = Array.from(
        document.querySelectorAll("span.mobile.only .ui.secondary.menu")
      );
      const menus = desktopMenus.length > 0 ? desktopMenus : mobileMenus;
      if (menus.length > 0) {
        let createAnkiMenuItem = function(label, key, index, onClickFn) {
          const a = document.createElement("a");
          a.className = "item";
          a.href = "#";
          a.dataset.anki = key;
          a.dataset.ankiIndex = String(index);
          a.textContent = label;
          a.addEventListener("click", (e) => {
            e.preventDefault();
            onClickFn(e.currentTarget, index);
          });
          return a;
        };
        menus.forEach((menuEl, idx) => {
          if (!menuEl.querySelector('a.item[data-anki="image"]')) {
            const imgItem = createAnkiMenuItem(
              "Anki Image",
              "image",
              idx,
              (el, i) => addMediaToAnkiForIndex("picture", i, el)
            );
            menuEl.appendChild(imgItem);
          }
          if (!menuEl.querySelector('a.item[data-anki="audio"]')) {
            const audioItem = createAnkiMenuItem(
              "Anki Audio",
              "audio",
              idx,
              (el, i) => addMediaToAnkiForIndex("audio", i, el)
            );
            menuEl.appendChild(audioItem);
          }
        });
        clearInterval(interval);
        return;
      }
      const allButtons = Array.from(document.querySelectorAll("button, a, span, div"));
      const imageButton = allButtons.find((el) => el.textContent && el.textContent.trim() === "Image");
      const soundButton = allButtons.find((el) => el.textContent && el.textContent.trim() === "Sound");
      if (imageButton || soundButton) {
        let createAnkiBtn = function(label, key, onClickFn) {
          const btn = document.createElement("button");
          btn.textContent = label;
          btn.style.marginLeft = "6px";
          btn.style.padding = "4px 8px";
          btn.style.fontSize = "90%";
          btn.style.cursor = "pointer";
          btn.dataset.anki = key;
          btn.addEventListener("click", (e) => onClickFn(e.currentTarget));
          return btn;
        };
        clearInterval(interval);
        if (imageButton) {
          const ankiImgBtn = createAnkiBtn("Anki Image", "image", (el) => addMediaToAnki("picture", el));
          imageButton.parentNode?.insertBefore(ankiImgBtn, imageButton.nextSibling);
        }
        if (soundButton) {
          const ankiSoundBtn = createAnkiBtn("Anki Audio", "audio", (el) => addMediaToAnki("audio", el));
          soundButton.parentNode?.insertBefore(ankiSoundBtn, soundButton.nextSibling);
        }
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.warn("ImmersionKit → Anki: Could not find Image/Sound buttons");
      }
    }, 500);
  }
  let stylesInjected = false;
  function init() {
    if (!stylesInjected) {
      injectStyles();
      stylesInjected = true;
    }
    setTimeout(insertAnkiButtons, 1e3);
  }
  function isDictionaryPage(u) {
    const url = new URL(window.location.href);
    return url.pathname.startsWith("/dictionary");
  }
  let lastInitializedHref = null;
  function maybeInitForDictionary() {
    if (!isDictionaryPage()) return;
    const href = window.location.href;
    if (href === lastInitializedHref) return;
    lastInitializedHref = href;
    init();
  }
  function startUserscript() {
    const onReady = () => {
      maybeInitForDictionary();
      let lastHref = window.location.href;
      window.addEventListener("popstate", maybeInitForDictionary);
      window.addEventListener("hashchange", maybeInitForDictionary);
      setInterval(() => {
        const current = window.location.href;
        if (current !== lastHref) {
          lastHref = current;
          maybeInitForDictionary();
        }
      }, 400);
    };
    if (document.readyState === "complete") onReady();
    else window.addEventListener("load", onReady);
  }
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function getSettings() {
    return {
      ankiUrl: _GM_getValue?.("ankiUrl") || CONFIG.ANKI_CONNECT_URL,
      ankiKey: _GM_getValue?.("ankiKey") || (CONFIG.ANKI_CONNECT_KEY || ""),
      imageField: _GM_getValue?.("imageField") || CONFIG.IMAGE_FIELD_NAME,
      audioField: _GM_getValue?.("audioField") || CONFIG.AUDIO_FIELD_NAME,
      exampleIndex: Number(_GM_getValue?.("exampleIndex") ?? CONFIG.EXAMPLE_INDEX) || 0,
      confirmOverwrite: Boolean(_GM_getValue?.("confirmOverwrite") ?? CONFIG.CONFIRM_OVERWRITE)
    };
  }
  function saveSettings(s) {
    _GM_setValue?.("ankiUrl", s.ankiUrl.trim());
    _GM_setValue?.("ankiKey", s.ankiKey.trim());
    _GM_setValue?.("imageField", s.imageField.trim());
    _GM_setValue?.("audioField", s.audioField.trim());
    _GM_setValue?.("exampleIndex", Number.isFinite(s.exampleIndex) ? s.exampleIndex : 0);
    _GM_setValue?.("confirmOverwrite", !!s.confirmOverwrite);
    CONFIG.ANKI_CONNECT_URL = s.ankiUrl.trim() || CONFIG.ANKI_CONNECT_URL;
    CONFIG.ANKI_CONNECT_KEY = s.ankiKey.trim() || null;
    CONFIG.IMAGE_FIELD_NAME = s.imageField.trim() || CONFIG.IMAGE_FIELD_NAME;
    CONFIG.AUDIO_FIELD_NAME = s.audioField.trim() || CONFIG.AUDIO_FIELD_NAME;
    CONFIG.EXAMPLE_INDEX = Number.isFinite(s.exampleIndex) ? s.exampleIndex : CONFIG.EXAMPLE_INDEX;
    CONFIG.CONFIRM_OVERWRITE = !!s.confirmOverwrite;
  }
  function renderSettingsHtml(s) {
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
      <input type="checkbox" name="confirmOverwrite" ${s.confirmOverwrite ? "checked" : ""} />
    </form>
  `;
  }
  function registerMenu() {
    if (typeof _GM_registerMenuCommand !== "function") return;
    _GM_registerMenuCommand("设置（ImmersionKit → Anki）", async () => {
      const s = getSettings();
      const html = renderSettingsHtml(s);
      await showModal({
        title: "设置（ImmersionKit → Anki）",
        html,
        confirmText: "保存",
        onConfirm: (root) => {
          const form = root.querySelector("form");
          if (!form) return true;
          const next = {
            ankiUrl: form.querySelector('[name="ankiUrl"]')?.value || s.ankiUrl,
            ankiKey: form.querySelector('[name="ankiKey"]')?.value || "",
            imageField: form.querySelector('[name="imageField"]')?.value || s.imageField,
            audioField: form.querySelector('[name="audioField"]')?.value || s.audioField,
            exampleIndex: Number(form.querySelector('[name="exampleIndex"]')?.value || s.exampleIndex) || 0,
            confirmOverwrite: !!form.querySelector('[name="confirmOverwrite"]')?.checked
          };
          saveSettings(next);
          return true;
        }
      });
    });
  }
  (function() {
    startUserscript();
    registerMenu();
  })();

})();