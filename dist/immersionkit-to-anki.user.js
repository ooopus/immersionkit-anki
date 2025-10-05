// ==UserScript==
// @name         ImmersionKit → Anki
// @namespace    immersionkit_to_anki
// @version      1.0.0
// @description  Add example images and audio from ImmersionKit's dictionary pages to your latest Anki note via AnkiConnect.
// @icon         https://vitejs.dev/logo.svg
// @match        https://www.immersionkit.com/dictionary*
// @connect      apiv2.immersionkit.com
// @connect      us-southeast-1.linodeobjects.com
// @connect      127.0.0.1
// @connect      localhost
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    ANKI_CONNECT_URL: "http://127.0.0.1:8765",
    ANKI_CONNECT_KEY: null,
    IMAGE_FIELD_NAME: "Picture",
    AUDIO_FIELD_NAME: "SentenceAudio",
    EXAMPLE_INDEX: 0
  };
  var _GM_addStyle = (() => typeof GM_addStyle != "undefined" ? GM_addStyle : void 0)();
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
    const css = ".anki-feedback-pending{opacity:.7;pointer-events:none;} .anki-feedback-success{color:#0a8f08 !important;} .anki-feedback-error{color:#c62828 !important;}";
    if (typeof _GM_addStyle === "function") {
      _GM_addStyle(css);
    } else {
      const style = document.createElement("style");
      style.textContent = css;
      document.head.appendChild(style);
    }
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
  function init() {
    injectStyles();
    setTimeout(insertAnkiButtons, 1e3);
  }
  function startUserscript() {
    if (document.readyState === "complete") init();
    else window.addEventListener("load", init);
  }
  (function() {
    startUserscript();
  })();

})();