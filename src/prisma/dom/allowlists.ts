export const ALLOWED_TAGS = new Set([
  'div', 'span', 'button', 'p', 'img', 'hr', 'ul', 'li', 'a',
]);

export const ALLOWED_STYLE_PROPS = new Set([
  'color', 'background-color', 'opacity', 'display', 'visibility',
  'border', 'border-radius', 'padding', 'margin', 'font-size',
  'text-decoration', 'cursor', 'overflow', 'gap', 'flex',
  'align-items', 'justify-content', 'width', 'height',
  'max-height', 'max-width', 'min-height', 'min-width',
  'pointer-events',
]);

export const ALLOWED_EVENTS = new Set([
  'click', 'mouseenter', 'mouseleave', 'mousedown', 'mouseup',
  'keydown', 'keyup', 'focus', 'blur',
]);

const BLOCKED_VALUE_RE = /url\s*\(|expression\s*\(|javascript:/i;
const BLOCKED_CSS_RE = /url\s*\(|expression\s*\(|javascript:|@import/i;

export function sanitizeStyleValue(value: string): string | undefined {
  return BLOCKED_VALUE_RE.test(value) ? undefined : value;
}

export function sanitizeCss(css: string): string | undefined {
  return BLOCKED_CSS_RE.test(css) ? undefined : css;
}

export function validateSelector(selector: string): boolean {
  if (selector === '*') return false;
  if (/\[data-(?:user|peer|chat)-id\]/i.test(selector)) return false;
  return true;
}
