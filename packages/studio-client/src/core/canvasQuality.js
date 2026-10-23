const DENSE_VIEWPORT_ZOOM = 0.55;
const DENSE_VIEWPORT_NODE_COUNT = 80;
const DENSE_VIEWPORT_WIRE_COUNT = 100;
//
export function getEffectiveCanvasQuality({ mode, performanceReduced, zoom, visibleNodeCount, visibleWireCount }) {
  const qualityMode = ['auto', 'fast', 'optimal', 'quality'].includes(mode) ? mode : 'auto';
  const reductionRequested = qualityMode === 'fast'
    || qualityMode === 'optimal'
    || qualityMode === 'auto' && performanceReduced;
  const denseZoomedOutViewport = zoom <= DENSE_VIEWPORT_ZOOM
    && visibleNodeCount >= DENSE_VIEWPORT_NODE_COUNT
    && visibleWireCount >= DENSE_VIEWPORT_WIRE_COUNT;

  if (!reductionRequested || !denseZoomedOutViewport) return 'quality';
  return qualityMode === 'optimal' ? 'optimal' : 'fast';
}
