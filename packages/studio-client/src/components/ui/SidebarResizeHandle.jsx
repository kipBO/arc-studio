import React, { useRef } from 'react';

const MIN_WIDTH = 280;
const MAX_WIDTH = 480;
const SNAP_DISTANCE = 14;
//
export function SidebarResizeHandle({ width, defaultWidth, onResize }) {
  const dragRef = useRef(null);

  const snapWidth = (candidate, max = MAX_WIDTH) => {
    const points = [MIN_WIDTH, defaultWidth, max].filter((point) => Number.isFinite(point));
    const snapPoint = points.find((point) => Math.abs(candidate - point) <= SNAP_DISTANCE);
    return snapPoint ?? candidate;
  };

  const update = (clientX) => {
    const drag = dragRef.current;
    if (!drag) return;
    const max = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth / drag.scale - 80));
    const candidate = Math.max(MIN_WIDTH, Math.min(max, drag.startWidth + (clientX - drag.startX) / drag.scale));
    const nextWidth = snapWidth(candidate, max);
    drag.sidebar.style.width = `${nextWidth}px`;
    drag.sidebar.style.setProperty('--arc-sidebar-current-width', `${nextWidth}px`);
    drag.canvasWorkspace?.style.setProperty('--arc-active-sidebar-width', `${nextWidth}px`);
    drag.nextWidth = nextWidth;
  };

  const stop = () => {
    if (!dragRef.current) return;
    const { nextWidth, sidebar, canvasWorkspace } = dragRef.current;
    dragRef.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
    document.body.classList.remove('is-resizing-sidebar');
    if (Number.isFinite(nextWidth)) onResize?.(nextWidth);
    sidebar?.style.removeProperty('width');
    sidebar?.style.removeProperty('--arc-sidebar-current-width');
    canvasWorkspace?.style.removeProperty('--arc-active-sidebar-width');
  };

  const start = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const sidebar = event.currentTarget.parentElement;
    const canvasWorkspace = sidebar?.closest('.canvas-workspace');
    const appRoot = sidebar.closest('.app-root');
    const scale = Number.parseFloat(appRoot ? getComputedStyle(appRoot).getPropertyValue('--arc-ui-scale') : '1') || 1;
    dragRef.current = {
      sidebar,
      canvasWorkspace,
      scale,
      startX: event.clientX,
      startWidth: sidebar.getBoundingClientRect().width / scale,
      nextWidth: width
    };
    document.body.classList.add('is-resizing-sidebar');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop, { once: true });
    window.addEventListener('pointercancel', stop, { once: true });
  };

  const onMove = (event) => update(event.clientX);
  const onKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const candidate = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width + (event.key === 'ArrowRight' ? 16 : -16)));
    const nextWidth = snapWidth(candidate);
    onResize?.(nextWidth);
  };

  return <div className="sidebar-resize-handle" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" aria-valuemin={MIN_WIDTH} aria-valuemax={MAX_WIDTH} aria-valuenow={Math.round(width)} tabIndex={0} onPointerDown={start} onKeyDown={onKeyDown} />;
}
