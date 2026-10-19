const propertiesToCopy = [
  'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
  'fontSizeAdjust', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform',
  'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing',
  'tabSize', 'MozTabSize'
];
/**
 * Returns caret pixel coordinates relative to the input or textarea element's inner content.
 * @param {HTMLInputElement|HTMLTextAreaElement} element
 * @param {number} position Character index
 * @returns {{ top: number, left: number, height: number }}
 */
export function getCaretCoordinates(element, position) {
  if (!element || typeof window === 'undefined') return { top: 0, left: 0, height: 18 };
  const isInput = element.nodeName === 'INPUT';
  const div = document.createElement('div');
  div.id = 'arc-caret-position-mirror';
  document.body.appendChild(div);

  const style = div.style;
  const computed = window.getComputedStyle(element);

  style.whiteSpace = isInput ? 'nowrap' : 'pre-wrap';
  if (!isInput) style.wordWrap = 'break-word';
  style.position = 'absolute';
  style.visibility = 'hidden';
  style.top = '0';
  style.left = '-9999px';

  for (const prop of propertiesToCopy) {
    style[prop] = computed[prop];
  }

  div.textContent = (element.value || '').substring(0, position);
  if (isInput) div.textContent = div.textContent.replace(/\s/g, '\u00a0');

  const span = document.createElement('span');
  span.textContent = (element.value || '').substring(position) || '.';
  div.appendChild(span);

  const coordinates = {
    top: span.offsetTop + (parseInt(computed.borderTopWidth, 10) || 0),
    left: span.offsetLeft + (parseInt(computed.borderLeftWidth, 10) || 0),
    height: parseInt(computed.lineHeight, 10) || parseInt(computed.fontSize, 10) || 18
  };

  document.body.removeChild(div);
  return coordinates;
}
