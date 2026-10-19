export function getArcUiScale() {
  const appRoot = typeof document === 'undefined' ? null : document.querySelector('.app-root');
  const bounds = appRoot?.getBoundingClientRect();
  if (bounds?.width > 0 && appRoot.offsetWidth > 0) {
    const renderedScale = bounds.width / appRoot.offsetWidth;
    if (Number.isFinite(renderedScale) && renderedScale > 0) return renderedScale;
  }
  const declaredScale = Number(appRoot?.dataset.uiScale) / 100;
  return Number.isFinite(declaredScale) && declaredScale > 0 ? declaredScale : 1;
}
