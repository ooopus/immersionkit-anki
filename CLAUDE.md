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
   - Uses **5-element grouping pattern** to correctly identify page structure
   - Uses MutationObserver to handle SPA-style navigation and dynamically loaded content

### Critical DOM Structure (ImmersionKit)

**⚠️ IMPORTANT**: ImmersionKit uses a specific 5-element pattern per example:

```
.ui.divided.items (container)
  ├─ [0] div.item.mobile.or.lower.hidden     (example - desktop)
  ├─ [1] span.mobile.or.lower.hidden         (buttons container - desktop)
  │      └─ .ui.secondary.menu               (menu with Mining/Download)
  ├─ [2] div.item.mobile.only                (example - mobile)
  ├─ [3] span.mobile.only                    (buttons container - mobile)
  │      └─ .ui.secondary.menu               (menu - mobile)
  ├─ [4] nav.react-contextmenu               (right-click menu)
  └─ ... (next example, same 5-element pattern)
```

**Key Implementation**:
- `getExampleGroups()` in ui.ts:102-122 - Returns structured groups using this pattern
- `getExampleIndexFromMenu()` in ui.ts:144-156 - Calculates index: `Math.floor(spanIndex / 5)`
- `validatePageStructure()` in ui.ts:440-471 - Validates the 5-element pattern before injection
- Menu elements are in **sibling elements** of example containers, not nested inside them

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

The script uses a **primary 5-element grouping strategy** with fallback (ui.ts:476-560):

1. **Primary Method** (5-element grouping):
   - Validates page structure using `validatePageStructure()`
   - Gets all example groups via `getExampleGroups()`
   - Iterates through groups and injects into both desktop and mobile menus
   - Each menu gets: "Anki Both", "Anki Image" (if image exists), "Anki Audio"
   - Buttons include `data-anki` and `data-anki-index` attributes for tracking

2. **Fallback Method** (button-based):
   - Activates if 5-element structure not found after 20 attempts
   - Searches for legacy "Image" and "Sound" text in buttons
   - Creates new button elements next to existing ones
   - Used for backwards compatibility if page structure changes

3. **Dynamic Content Handling**:
   - `observeNewMenus()` uses MutationObserver to watch for new content
   - Re-calculates example index for each dynamically added menu
   - Ensures buttons appear even on lazy-loaded examples

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

### Index Calculation and Validation

**Critical for correct operation**:

```typescript
// Get example index from a menu element (ui.ts:144-156)
function getExampleIndexFromMenu(menuEl: Element): number {
  const container = document.querySelector('.ui.divided.items');
  const children = Array.from(container.children);
  const spanIndex = children.findIndex(child => child.contains(menuEl));
  return Math.floor(spanIndex / 5); // Divide by 5 due to grouping pattern
}

// Validate index before operations (ui.ts:207-218)
const groups = getExampleGroups();
if (exampleIndex < 0 || exampleIndex >= groups.length) {
  // Error handling
}
```

**Why this matters**: The old method looked for menu inside example containers (wrong), while the correct method recognizes that menus are in sibling span elements at positions 1 and 3 within each 5-element group.

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
4. Navigate to ImmersionKit dictionary page (e.g., https://www.immersionkit.com/dictionary?keyword=営み&exact=true&sort=sentence_length%3Aasc)
5. Check browser console for: `ImmersionKit → Anki: Found X example groups`
6. Verify 3 buttons per example: "Anki Both", "Anki Image" (if image), "Anki Audio"
7. Test media attachment to recent/selected notes

### Debugging Page Structure Issues

If buttons don't appear:

1. Open browser console and check for validation errors
2. Verify 5-element pattern:
   ```javascript
   // Run in console
   const container = document.querySelector('.ui.divided.items');
   console.log('Total children:', container?.children.length);
   console.log('Should be multiple of 5:', container?.children.length % 5 === 0);
   ```
3. Check structure validation logs in ui.ts:440-471
4. If structure changed, update `validatePageStructure()` and `getExampleGroups()`

## Configuration Files

- **vite.config.ts** - Build configuration and userscript metadata
- **tsconfig.json** - TypeScript config (extends @tsconfig/svelte)
- **tsconfig.node.json** - Node-specific TypeScript config
- **svelte.config.js** - Svelte compiler configuration