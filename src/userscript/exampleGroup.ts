/**
 * Example Group Parsing Module
 * 
 * Handles parsing the ImmersionKit page structure to identify example sentences.
 * ImmersionKit uses a 5-element pattern per example:
 * [example-desktop, buttons-desktop, example-mobile, buttons-mobile, context-menu]
 */

import { SELECTORS } from './selectors';

/**
 * Represents a group of elements for one example sentence on the page.
 */
export interface ExampleGroup {
  exampleDesktop: Element;
  buttonSpanDesktop: Element;
  exampleMobile: Element;
  buttonSpanMobile: Element;
  contextMenu: Element;
  index: number;
}

/**
 * Get all example groups from the page using the 5-element grouping pattern.
 * Each example has 5 consecutive elements in .ui.divided.items container.
 */
export function getExampleGroups(): ExampleGroup[] {
  const container = document.querySelector(SELECTORS.EXAMPLES_CONTAINER);
  if (!container) return [];

  const children = Array.from(container.children);
  const groups: ExampleGroup[] = [];

  // Each group consists of 5 elements
  for (let i = 0; i + 4 < children.length; i += 5) {
    groups.push({
      exampleDesktop: children[i],
      buttonSpanDesktop: children[i + 1],
      exampleMobile: children[i + 2],
      buttonSpanMobile: children[i + 3],
      contextMenu: children[i + 4],
      index: Math.floor(i / 5)
    });
  }

  return groups;
}

/**
 * Get example items (desktop) from the current page structure.
 * Uses the 5-element grouping pattern.
 */
export function getExampleItems(): Element[] {
  const groups = getExampleGroups();
  return groups.map(g => g.exampleDesktop);
}

/**
 * Get the example index from a menu element.
 * Uses the 5-element grouping pattern to determine position.
 */
export function getExampleIndexFromMenu(menuEl: Element): number {
  const container = document.querySelector(SELECTORS.EXAMPLES_CONTAINER);
  if (!container) return 0;

  const children = Array.from(container.children);
  const spanIndex = children.findIndex(child => child.contains(menuEl));

  if (spanIndex === -1) return 0;

  // Button spans are at positions 1 and 3 in each group
  // Divide by 5 to get the example index
  return Math.floor(spanIndex / 5);
}

/**
 * Validate the page structure matches our expected 5-element grouping pattern.
 */
export function validatePageStructure(): { valid: boolean; reason?: string } {
  const container = document.querySelector(SELECTORS.EXAMPLES_CONTAINER);
  if (!container) {
    return { valid: false, reason: `No ${SELECTORS.EXAMPLES_CONTAINER} container found` };
  }

  const children = Array.from(container.children);
  if (children.length === 0) {
    return { valid: false, reason: 'Container is empty' };
  }

  if (children.length % 5 !== 0) {
    console.warn(`ImmersionKit → Anki: Unexpected children count: ${children.length} (expected multiple of 5)`);
    // Don't fail, but log warning - page might be partially loaded
  }

  // Check if first group has the expected structure
  if (children.length >= 5) {
    const firstExample = children[0];
    const firstButtonSpan = children[1];
    const hasExpectedPattern =
      firstExample?.classList.contains('item') &&
      firstButtonSpan?.tagName === 'SPAN' &&
      firstButtonSpan?.querySelector(SELECTORS.SECONDARY_MENU);

    if (!hasExpectedPattern) {
      return { valid: false, reason: 'Structure pattern mismatch' };
    }
  }

  return { valid: true };
}
