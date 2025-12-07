<script lang="ts">
    import type { Settings } from "../settings";
    import { saveSettings } from "../settings";
    import { invokeAnkiConnect } from "../anki";
    import { CONFIG } from "../config";

    export let initial: Settings = {
        ankiUrl: CONFIG.ANKI_CONNECT_URL,
        ankiKey: CONFIG.ANKI_CONNECT_KEY || "",
        imageField: CONFIG.IMAGE_FIELD_NAME,
        audioField: CONFIG.AUDIO_FIELD_NAME,
        exampleIndex: CONFIG.EXAMPLE_INDEX,
        confirmOverwrite: CONFIG.CONFIRM_OVERWRITE,
        targetNoteMode: CONFIG.TARGET_NOTE_MODE,
        openEditorOnKey: CONFIG.OPEN_EDITOR_ON_KEY,
        openEditorKey: CONFIG.OPEN_EDITOR_KEY,
    };
    export let onClose: () => void = () => {};

    let state: Settings = { ...initial };
    let testing = false;
    let testMessage = "";
    let testOk: boolean | null = null;
    let error = "";

    function validate(): boolean {
        error = "";
        if (!state.ankiUrl || !/^https?:\/\//i.test(state.ankiUrl)) {
            error = "AnkiConnect URL 无效";
            return false;
        }
        if (!Number.isFinite(state.exampleIndex) || state.exampleIndex < 0) {
            error = "示例索引必须为非负数";
            return false;
        }
        return true;
    }

    async function onSave() {
        if (!validate()) return;
        saveSettings({ ...state });
        onClose();
    }

    async function onTest() {
        testOk = null;
        testMessage = "";
        testing = true;
        const prevUrl = CONFIG.ANKI_CONNECT_URL;
        const prevKey = CONFIG.ANKI_CONNECT_KEY;
        try {
            CONFIG.ANKI_CONNECT_URL = state.ankiUrl.trim();
            CONFIG.ANKI_CONNECT_KEY = state.ankiKey.trim() || null;
            const version = await invokeAnkiConnect<number>("version");
            testOk = true;
            testMessage = `连接成功，版本 ${version}`;
        } catch (e) {
            testOk = false;
            testMessage = e instanceof Error ? e.message : "连接失败";
        } finally {
            CONFIG.ANKI_CONNECT_URL = prevUrl;
            CONFIG.ANKI_CONNECT_KEY = prevKey;
            testing = false;
        }
    }
</script>

<div
    class="ik-anki-overlay"
    role="button"
    tabindex="0"
    aria-label="关闭设置覆盖层"
    on:click={(e) => {
        if (e.target === e.currentTarget) onClose();
    }}
    on:keydown={(e) => {
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") onClose();
    }}
>
    <div class="ik-anki-panel" role="dialog" aria-modal="true">
        <header>
            <h2>设置（ImmersionKit → Anki）</h2>
            <button class="icon" aria-label="关闭" on:click={onClose}>✕</button>
        </header>
        <main>
            {#if error}
                <div class="alert error">{error}</div>
            {/if}
            <label for="anki-url">AnkiConnect URL</label>
            <input
                id="anki-url"
                type="text"
                bind:value={state.ankiUrl}
                placeholder="http://127.0.0.1:8765"
            />

            <label for="anki-key">AnkiConnect Key</label>
            <input
                id="anki-key"
                type="password"
                bind:value={state.ankiKey}
                placeholder="（可选）"
            />

            <div class="row">
                <div class="col">
                    <label for="image-field">图片字段名</label>
                    <input
                        id="image-field"
                        type="text"
                        bind:value={state.imageField}
                    />
                </div>
                <div class="col">
                    <label for="audio-field">音频字段名</label>
                    <input
                        id="audio-field"
                        type="text"
                        bind:value={state.audioField}
                    />
                </div>
            </div>

            <div class="row">
                <div class="col">
                    <label for="example-index">示例索引</label>
                    <input
                        id="example-index"
                        type="number"
                        min="0"
                        bind:value={state.exampleIndex}
                    />
                </div>
                <div class="col checkbox">
                    <label>
                        <input
                            type="checkbox"
                            bind:checked={state.confirmOverwrite}
                        /> 覆盖前确认
                    </label>
                </div>
            </div>

            <div class="row">
                <div class="col checkbox">
                    <label>
                        <input
                            type="checkbox"
                            bind:checked={state.openEditorOnKey}
                        /> 添加后按快捷键打开编辑器
                    </label>
                </div>
                <div class="col">
                    <label for="open-editor-key">快捷键</label>
                    <input
                        id="open-editor-key"
                        type="text"
                        maxlength="16"
                        placeholder="e"
                        bind:value={state.openEditorKey}
                        disabled={!state.openEditorOnKey}
                    />
                </div>
            </div>

            <div class="row">
                <div class="col">
                    <label for="target-mode">目标笔记</label>
                    <select id="target-mode" bind:value={state.targetNoteMode}>
                        <option value="recent">最近添加的笔记</option>
                        <option value="selected">浏览器中选中的笔记</option>
                    </select>
                </div>
            </div>

            <div class="test">
                <button class="secondary" disabled={testing} on:click={onTest}
                    >{testing ? "测试中…" : "测试连接"}</button
                >
                {#if testOk !== null}
                    <span class:ok={testOk} class:fail={!testOk}
                        >{testMessage}</span
                    >
                {/if}
            </div>
        </main>
        <footer>
            <button class="ghost" on:click={onClose}>取消</button>
            <button class="primary" on:click={onSave}>保存</button>
        </footer>
    </div>
    <div class="ik-anki-focus-guard" aria-hidden="true" tabindex="-1"></div>
    <div class="ik-anki-focus-guard" aria-hidden="true" tabindex="-1"></div>
</div>

<style>
    .ik-anki-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        z-index: 999999;
        display: grid;
        place-items: center;
        padding: 20px;
    }
    .ik-anki-panel {
        width: min(680px, 100%);
        background: #0f1227;
        color: #e7e9f0;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
        border: 1px solid rgba(255, 255, 255, 0.08);
        display: grid;
        grid-template-rows: auto 1fr auto;
        overflow: hidden;
    }
    header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    header h2 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
    }
    header .icon {
        border: none;
        background: transparent;
        color: #c7cbe1;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        padding: 6px;
        border-radius: 6px;
    }
    header .icon:hover {
        background: rgba(255, 255, 255, 0.06);
    }
    main {
        padding: 16px;
        display: grid;
        gap: 12px;
    }
    label {
        font-size: 12px;
        color: #aab0d0;
    }
    input[type="text"],
    input[type="password"],
    input[type="number"] {
        width: 100%;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: #111533;
        color: #e7e9f0;
        outline: none;
    }
    input:focus {
        border-color: #6ea8fe;
        box-shadow: 0 0 0 3px rgba(110, 168, 254, 0.15);
    }
    .row {
        display: grid;
        gap: 12px;
        grid-template-columns: 1fr 1fr;
    }
    .col.checkbox {
        display: flex;
        align-items: end;
        gap: 8px;
    }
    .test {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .test span {
        font-size: 12px;
    }
    .test span.ok {
        color: #5dd39e;
    }
    .test span.fail {
        color: #ff6b6b;
    }
    .alert.error {
        background: rgba(255, 107, 107, 0.08);
        color: #ffb3b3;
        border: 1px solid rgba(255, 107, 107, 0.35);
        padding: 10px 12px;
        border-radius: 8px;
    }
    footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        background: #0c0f22;
    }
    button {
        cursor: pointer;
        border-radius: 8px;
        padding: 8px 14px;
        border: 1px solid transparent;
        font-size: 14px;
    }
    .primary {
        background: #6ea8fe;
        color: #071223;
        border-color: #6ea8fe;
    }
    .primary:hover {
        filter: brightness(1.05);
    }
    .ghost {
        background: transparent;
        color: #c7cbe1;
        border-color: rgba(255, 255, 255, 0.2);
    }
    .ghost:hover {
        background: rgba(255, 255, 255, 0.06);
    }
    .secondary {
        background: #2a2f52;
        color: #e7e9f0;
        border-color: rgba(255, 255, 255, 0.12);
    }
</style>
