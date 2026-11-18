// Координаты каретки внутри textarea (техника зеркального div) — для меню /slash-команд.
const PROPS = [
  'boxSizing', 'width', 'overflowX', 'overflowY',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'lineHeight', 'fontFamily',
  'textAlign', 'textTransform', 'textIndent', 'letterSpacing', 'wordSpacing', 'tabSize',
] as const;

export function caretCoordinates(el: HTMLTextAreaElement, position: number) {
  const div = document.createElement('div');
  const cs = window.getComputedStyle(el);
  const style = div.style as unknown as Record<string, string>;
  PROPS.forEach((p) => (style[p] = cs[p as keyof CSSStyleDeclaration] as string));
  style.position = 'absolute';
  style.visibility = 'hidden';
  style.whiteSpace = 'pre-wrap';
  style.wordWrap = 'break-word';
  style.top = '0';
  style.left = '-9999px';
  div.textContent = el.value.substring(0, position);
  const span = document.createElement('span');
  span.textContent = el.value.substring(position) || '.';
  div.appendChild(span);
  document.body.appendChild(div);
  const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.45;
  const coords = {
    top: span.offsetTop + parseFloat(cs.borderTopWidth) - el.scrollTop,
    left: span.offsetLeft + parseFloat(cs.borderLeftWidth),
    height: lineHeight,
  };
  document.body.removeChild(div);
  return coords;
}
