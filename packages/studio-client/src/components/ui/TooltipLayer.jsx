import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getArcUiScale } from '../../core/uiScale.js';
import { onPageBlur } from '../../core/pageFocus.js';

const TOOLTIP_ID = 'arc-hover-tooltip';
//
export function TooltipLayer() {
  const [tooltip, setTooltip] = useState(null);
  const timerRef = useRef(null);
  const targetRef = useRef(null);
  const targetModeRef = useRef(null);
  const tooltipRef = useRef(null);
  const pointerPositionRef = useRef(null);
  const uiScale = getArcUiScale();

  useEffect(() => {
    const migrateTitle = (element) => {
      if (!(element instanceof Element)) return;
      if (element.hasAttribute('title')) {
        element.setAttribute('data-tooltip', element.getAttribute('title') || '');
        element.removeAttribute('title');
      }
      element.querySelectorAll?.('[title]').forEach((child) => migrateTitle(child));
    };

    migrateTitle(document.documentElement);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') {
          migrateTitle(record.target);
          if (record.attributeName === 'data-pin-descriptions' && record.target.matches?.('.node-canvas[data-pin-descriptions="true"]')) {
            const anchor = targetRef.current;
            if (anchor?.hasAttribute('data-pin-description') && record.target.contains(anchor)) showFor(anchor, pointerPositionRef.current);
          } else if (record.attributeName === 'data-pin-descriptions') {
            const anchor = targetRef.current;
            if (anchor?.hasAttribute('data-pin-description') && record.target.contains(anchor)) showFor(anchor, pointerPositionRef.current);
          }
        }
        else record.addedNodes.forEach(migrateTitle);
      }
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['title', 'data-pin-descriptions'] });

    const clear = () => {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
      targetRef.current = null;
      targetModeRef.current = null;
      setTooltip(null);
    };
    let pointerPressed = false;

    const showFor = (target, pointer = null) => {
      if (!(target instanceof Element)) return;
      const anchor = target.closest('[data-tooltip], [data-pin-description]');
      const isPin = anchor?.hasAttribute('data-pin-description');
      const showPinDescription = isPin && anchor.closest('.node-canvas[data-pin-descriptions="true"]');
      const mode = showPinDescription ? 'description' : 'normal';
      const message = (isPin && showPinDescription ? anchor.getAttribute('data-pin-description') : anchor?.getAttribute('data-tooltip') || anchor?.getAttribute('data-pin-description'))?.trim();
      if (!anchor || !message) return;
      if (anchor === targetRef.current) {
        if (targetModeRef.current === mode) {
          if (pointer && isPin) setTooltip((current) => current?.anchor === anchor ? { ...current, pointer } : current);
          return;
        }
        targetModeRef.current = mode;
        window.clearTimeout(timerRef.current);
        if (tooltipRef.current) {
          setTooltip((current) => current?.anchor === anchor ? { ...current, message, ...(pointer && isPin ? { pointer } : {}) } : current);
          return;
        }
        timerRef.current = window.setTimeout(() => {
          const bounds = anchor.getBoundingClientRect();
          if (bounds.width && bounds.height) setTooltip({ message, anchor, placement: 'top', ...(pointer ? { pointer } : {}) });
        }, showPinDescription ? 0 : 900);
        return;
      }
      window.clearTimeout(timerRef.current);
      targetRef.current = anchor;
      targetModeRef.current = mode;
      setTooltip(null);
      timerRef.current = window.setTimeout(() => {
        const bounds = anchor.getBoundingClientRect();
        if (!bounds.width && !bounds.height) return;
        setTooltip({ message, anchor, placement: 'top', ...(isPin && pointer ? { pointer } : {}) });
      }, showPinDescription ? 0 : 900);
    };

    const onPointerOver = (event) => {
      pointerPositionRef.current = { x: event.clientX, y: event.clientY };
      showFor(event.target, pointerPositionRef.current);
    };
    const onPointerMove = (event) => {
      pointerPositionRef.current = { x: event.clientX, y: event.clientY };
      const anchor = targetRef.current;
      if (anchor && event.target instanceof Node && anchor.contains(event.target) && anchor.hasAttribute('data-pin-description')) {
        const message = anchor.closest('.node-canvas[data-pin-descriptions="true"]') ? anchor.getAttribute('data-pin-description') : anchor.getAttribute('data-tooltip');
        setTooltip((current) => current?.anchor === anchor ? { ...current, message: message?.trim() || current.message, pointer: pointerPositionRef.current } : current);
      }
    };
    const onPointerOut = (event) => {
      const anchor = targetRef.current;
      if (anchor && event.target instanceof Node && anchor.contains(event.target) && (!event.relatedTarget || !anchor.contains(event.relatedTarget))) clear();
    };
    const onFocusIn = (event) => { if (!pointerPressed) showFor(event.target); };
    const onFocusOut = (event) => {
      const anchor = targetRef.current;
      if (anchor && event.target instanceof Node && anchor.contains(event.target) && (!event.relatedTarget || !anchor.contains(event.relatedTarget))) clear();
    };
    const onPointerDown = () => { pointerPressed = true; clear(); };
    const onPointerUp = () => { pointerPressed = false; };

    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerout', onPointerOut, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerUp, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    const removePageBlurListener = onPageBlur(clear);
    return () => {
      observer.disconnect();
      clear();
      removePageBlurListener();
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerout', onPointerOut, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerUp, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
    };
  }, []);

  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current || !tooltip.anchor?.isConnected) return;
    const margin = 10;
    const gap = 9;
    const position = () => {
      if (!tooltip.anchor.isConnected || !tooltipRef.current) return;
      const target = tooltip.anchor.getBoundingClientRect();
      const bounds = tooltipRef.current.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
      const isSidebar = Boolean(tooltip.anchor.closest('.workspace-rail'));
      const pointer = tooltip.pointer;
      const rightFits = target.right + gap + bounds.width <= viewportWidth - margin;
      const topFits = pointer ? pointer.y - gap - bounds.height >= margin : target.top - gap - bounds.height >= margin;
      const bottomFits = pointer ? pointer.y + gap + bounds.height <= viewportHeight - margin : target.bottom + gap + bounds.height <= viewportHeight - margin;
      let placement = 'top';
      let x = pointer ? pointer.x - bounds.width / 2 : target.left + (target.width - bounds.width) / 2;
      let y = pointer ? pointer.y - gap - bounds.height : target.top - gap - bounds.height;

      if (pointer && !topFits && bottomFits) {
        y = pointer.y + gap;
        placement = 'bottom';
      } else if (pointer && !topFits && !bottomFits) {
        y = viewportHeight - bounds.height - margin;
        placement = 'bottom';
      } else if (isSidebar && rightFits) {
        placement = 'right';
        x = target.right + gap;
        y = target.top + (target.height - bounds.height) / 2;
      } else if (!topFits && bottomFits) {
        placement = 'bottom';
        y = target.bottom + gap;
      } else if (!topFits && !bottomFits && viewportHeight - target.bottom > target.top) {
        placement = 'bottom';
        y = target.bottom + gap;
      }

      x = Math.max(margin, Math.min(viewportWidth - bounds.width - margin, x));
      y = Math.max(margin, Math.min(viewportHeight - bounds.height - margin, y));
      setTooltip((current) => current && current.anchor === tooltip.anchor
        ? current.x === x && current.y === y && current.placement === placement ? current : { ...current, x, y, placement }
        : current);
    };

    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position);
    observer?.observe(tooltip.anchor);
    observer?.observe(tooltipRef.current);
    const appRoot = document.querySelector('.app-root');
    if (appRoot) observer?.observe(appRoot);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
      observer?.disconnect();
    };
  }, [tooltip?.anchor, tooltip?.message, tooltip?.pointer?.x, tooltip?.pointer?.y, uiScale]);

  if (!tooltip) return null;
  const theme = document.querySelector('.app-root')?.getAttribute('data-theme') || 'dark';
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  const maxWidth = Math.max(80, Math.min(280, viewportWidth - 20));
  const maxHeight = Math.max(40, viewportHeight - 20);
  return createPortal(<div ref={tooltipRef} data-theme={theme} id={TOOLTIP_ID} role="tooltip" className={`arc-tooltip is-${tooltip.placement || 'top'}`} style={{ left: (tooltip.x ?? -10000), top: (tooltip.y ?? -10000), maxWidth, maxHeight, '--arc-tooltip-scale': uiScale }}>{tooltip.message}</div>, document.body);
}
