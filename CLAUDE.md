# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Tampermonkey/Greasemonkey userscript that integrates ImmersionKit (Japanese language learning dictionary) with Anki via AnkiConnect. It adds buttons to ImmersionKit dictionary pages that allow users to quickly add example sentences with images and audio to their Anki cards.

**Tech Stack**: TypeScript + Svelte 5 + Vite + vite-plugin-monkey

## Development Commands

```bash
# Development mode with hot reload
pnpm run dev

# Build userscript (outputs to dist/)
pnpm run build

# Type checking
pnpm run check
```

The build outputs:
- `dist/immersionkit-to-anki.user.js` - Main userscript file
- `dist/immersionkit-to-anki.meta.js` - Metadata file for update checks

## Architecture

### Entry Point & Flow
1. **src/userscript/index.ts** - Entry point that calls `startUserscript()` and `registerMenu()`
2. **src/userscript/ui.ts** - Core UI logic:
   - Observes DOM for ImmersionKit page structure (dictionary pages only)
   - Dynamically injects "Anki Image", "Anki Audio", "Anki Both" buttons into example menus
   - Handles two injection strategies: menu-style anchors and button-style fallback
   - Uses MutationObserver to handle SPA-style navigation and dynamically loaded content

### Core Modules

**anki.ts** - AnkiConnect API communication:
- `invokeAnkiConnect()` - Base request handler with fallback URLs (127.0.0.1:8765 and localhost:8765)
- `getMostRecentNoteId()` - Finds most recently added card
- `getSelectedNoteIds()` - Gets notes selected in Anki browser
- `attachMedia()` - Attaches image/audio to note fields via AnkiConnect

**immersionkit.ts** - ImmersionKit API integration:
- `fetchExamples()` - Searches ImmersionKit API for sentence examples
- `buildMediaTargets()` - Constructs media URLs from example metadata
- Handles URL encoding for title folders and filenames

**config.ts** - Configuration system:
- Default field names: "Picture" for images, "SentenceAudio" for audio
- TARGET_NOTE_MODE: "recent" (latest card) or "selected" (Anki browser selection)
- CONFIRM_OVERWRITE: Shows modal before overwriting existing field content
- Settings persist via GM_getValue/GM_setValue

**settings.ts** + **settings-ui.ts** - Settings management with Svelte UI overlay

**miningSoundCapture.ts** - Captures audio URLs from ImmersionKit's media player

**dom.ts** - DOM manipulation utilities for button states and modal dialogs

### UI Injection Strategy

The script uses two detection approaches (in ui.ts:insertAnkiButtons):

1. **Menu-based** (preferred): Looks for `.ui.secondary.menu` elements within example items
   - Desktop: `.item.mobile.or.lower.hidden`
   - Mobile: `.item.mobile.only`
   - Injects anchor elements with `data-anki` attributes

2. **Button-based** (fallback): Searches for "Image" and "Sound" text in buttons
   - Creates new button elements next to existing ones

The script handles per-example indexing to support multiple examples on one page (`data-anki-index` attribute).

### Key Integration Points

**vite.config.ts** - Userscript metadata configuration:
- Match pattern: `https://www.immersionkit.com/*`
- Required GM permissions: GM_xmlhttpRequest, GM_addStyle, GM_registerMenuCommand, GM_getValue, GM_setValue
- Connect domains: ImmersionKit API, Linode object storage, localhost AnkiConnect

**AnkiConnect Integration**:
- Requires AnkiConnect addon running in Anki
- Default URL: http://127.0.0.1:8765
- Uses AnkiConnect API version 6
- Supports optional API key authentication

## Important Patterns

### Media Attachment Workflow
1. Extract keyword from URL query parameter (`?keyword=...`)
2. Check "Exact Search" checkbox state on page
3. Fetch examples from ImmersionKit API with search options
4. Resolve media URLs (direct object storage or API proxy)
5. For images: Extract from DOM; for audio: Use API or capture from player
6. Validate field exists on target note
7. Optional: Confirm overwrite if field has content
8. Call AnkiConnect updateNoteFields with media object

### Button State Management
Buttons show visual feedback: pending → success/error with timeouts:
- `setButtonState()` - Updates button text and appearance
- `revertButtonState()` - Returns to original state after 2-2.5 seconds

### SPA Navigation Handling
Uses multiple strategies to detect page changes:
- `popstate` and `hashchange` event listeners
- Polling interval (400ms) to detect URL changes
- Tracks `lastInitializedHref` to prevent duplicate initialization

## Type System

**types.ts** defines core interfaces:
- ImmersionKit: `ImmersionKitExample`, `ImmersionKitSearchResponse`, `ImmersionKitSearchOptions`
- Anki: `AnkiNoteId`, `AnkiCardId`, `AnkiNoteInfo`, `AnkiMediaObject`, `AnkiUpdateNotePayload`
- `MediaType`: "picture" | "audio"

## Testing Notes

Manual testing workflow:
1. Build with `pnpm run build`
2. Install `dist/immersionkit-to-anki.user.js` in Tampermonkey
3. Ensure Anki is running with AnkiConnect addon
4. Navigate to ImmersionKit dictionary page (e.g., https://www.immersionkit.com/dictionary?keyword=読む)
5. Verify buttons appear in example menus
6. Test media attachment to recent/selected notes

## Configuration Files

- **vite.config.ts** - Build configuration and userscript metadata
- **tsconfig.json** - TypeScript config (extends @tsconfig/svelte)
- **tsconfig.node.json** - Node-specific TypeScript config
- **svelte.config.js** - Svelte compiler configuration