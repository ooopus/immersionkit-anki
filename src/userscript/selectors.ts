/**
 * DOM Selectors
 * 
 * Centralized CSS selectors for ImmersionKit page elements.
 * Keeping selectors in one place makes maintenance easier if the site structure changes.
 */

/** ImmersionKit page DOM selectors */
export const SELECTORS = {
  // Example sentence container
  EXAMPLES_CONTAINER: '.ui.divided.items',
  
  // Menu elements
  SECONDARY_MENU: '.ui.secondary.menu',
  
  // Search container
  SEARCH_CONTAINER: '.ui.fluid.right.action.left.icon.right.labeled.input.icon',
  
  // Pagination - try in order until one matches
  NEXT_PAGE: [
    'a.icon.item[aria-label="Next item"]',
    'a.icon.item:has(i.right.chevron.icon)',
    '.ui.pagination.menu a.icon.item:last-child:not(.disabled)',
  ] as const,
  
  // Image selectors - try in order of specificity
  IMAGE: [
    'div.ui.medium.image img.ui.image.clickableImage[src]:not([src=""])',
    'div.ui.small.image img.ui.image[src]:not([src=""])',
    'img[src]:not([src=""])',
  ] as const,
  
  // Mining tab related
  MOBILE_SPAN: 'span.mobile.or.lower.hidden',
  MOBILE_ONLY_SPAN: 'span.mobile.only',
  ACTIVE_SEGMENT: 'div.ui.segment.active.tab, div.ui.tab.segment.active, div.ui.segment.active',
  SOUND_BUTTON: 'button.ui.basic.icon.left.labeled.button, button.ui.icon.button, button',
  
  // Example item structure
  ITEM: '.item',
  
  // PlayAll highlight
  PLAYALL_HIGHLIGHT: '.anki-playall-highlight',
  PLAYALL_BOOKMARKED: '.anki-playall-bookmarked',
} as const;

/** CSS classes used by this userscript */
export const CLASSES = {
  HIGHLIGHT: 'anki-playall-highlight',
  BOOKMARKED: 'anki-playall-bookmarked',
  FEEDBACK_PENDING: 'anki-feedback-pending',
  FEEDBACK_SUCCESS: 'anki-feedback-success',
  FEEDBACK_ERROR: 'anki-feedback-error',
} as const;

/** Data attributes used by this userscript */
export const DATA_ATTRS = {
  ANKI: 'data-anki',
  ANKI_INDEX: 'data-anki-index',
  ANKI_OPEN_ID: 'data-anki-open-id',
  ANKI_ORIGINAL_TEXT: 'data-anki-original-text',
} as const;
