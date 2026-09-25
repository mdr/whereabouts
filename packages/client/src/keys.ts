/**
 * Whether a key press is someone typing, which shortcuts should leave alone:
 * text fields, text areas, selects and editable content. A focused slider,
 * checkbox or button is not typing (the brush slider keeps focus after a
 * drag, and [ and ] should still resize the brush).
 */
const NOT_TEXT = new Set(["range", "checkbox", "radio", "button", "submit", "reset", "color", "file", "image"]);

export function isTyping(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) return !NOT_TEXT.has(target.type);
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLElement && target.isContentEditable;
}
