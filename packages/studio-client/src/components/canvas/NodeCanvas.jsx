import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CanvasNode } from '../nodes/CanvasNode.jsx';
import { BuiltInNodeDefinitions, getArrayAppendPins, getArrayCombinePins, getArrayCreatePins, getMathListPins, getNodeArgumentPins, getPermissionOverwritePins, PinColors, getTextTemplateSlots } from '../nodes/nodeDefinitions.js';
import { FastForward, FileCode2, FolderTree, Hand, LockKeyhole, LockOpen, Maximize, Minus, MousePointer2, Plus, Scissors, StepForward, Type } from 'lucide-react';
import { embedBlockPins, getEmbedBlocks } from '../nodes/EmbedNodeBuilder.jsx';
import { getArcUiScale } from '../../core/uiScale.js';
import { onPageBlur } from '../../core/pageFocus.js';
import { readAppStorage, writeAppStorage } from '../../core/storage.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
//
const GRID_SIZE = 24;
const NODE_WIDTH = 248;
const EMPTY_PIN_SET = new Set();
const LARGE_GRAPH_NODE_LIMIT = 48;
const LARGE_GRAPH_WIRE_LIMIT = 64;
const getCanvasDisplayScale = (element) => {
  if (!element) return 1;
  const appRoot = element.closest('.app-root');
  const bounds = appRoot?.getBoundingClientRect();
  const layoutWidth = appRoot?.offsetWidth;
  if (bounds?.width > 0 && layoutWidth > 0) return bounds.width / layoutWidth;
  const canvasBounds = element.getBoundingClientRect();
  return canvasBounds.width > 0 && element.clientWidth > 0 ? canvasBounds.width / element.clientWidth : 1;
};

function getWireCutSegments(pathElement, event) {
  try {
    const length = pathElement.getTotalLength();
    const matrix = pathElement.getScreenCTM();
    const svg = pathElement.ownerSVGElement;
    if (!length || !matrix || !svg) return [];
    const click = svg.createSVGPoint();
    click.x = event.clientX;
    click.y = event.clientY;
    const localClick = click.matrixTransform(matrix.inverse());
    let splitAt = 0;
    let nearest = Infinity;
    const samples = 100;
    for (let index = 0; index <= samples; index += 1) {
      const distance = length * index / samples;
      const point = pathElement.getPointAtLength(distance);
      const delta = (point.x - localClick.x) ** 2 + (point.y - localClick.y) ** 2;
      if (delta < nearest) { nearest = delta; splitAt = distance; }
    }
    const buildSegment = (from, to, step) => {
      const points = [];
      for (let distance = from; step > 0 ? distance <= to : distance >= to; distance += step) {
        points.push(pathElement.getPointAtLength(Math.max(0, Math.min(length, distance))));
      }
      points.push(pathElement.getPointAtLength(to));
      const d = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
      const pathLength = points.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
      return { d, length: pathLength + 1 };
    };
    const stride = Math.max(length / 36, 1);
    return [buildSegment(splitAt, 0, -stride), buildSegment(splitAt, length, stride)].filter((segment) => segment.d && segment.length > 1);
  } catch { return []; }
}

export function NodeCanvas({
  nodes = [], connections = [], graphId = '', projectId = '', focusRequest = null, activePulseNodeIds = [], debugStep = null, onDebugAction, settings = {}, isLocked = false, desktopMode = false, shortcutPlatform = 'windows', authToken = '', graphName = 'Untitled graph',
  tagGroups = [], notes = [], currentUser = null, onNotesChange, onTagGroupsChange, onRequestCreateTagGroup, onRequestEditTagGroup, onRenameNode,
  graphVariables = [], functionGraphs = [], callableGraphs = functionGraphs, appEmojis = [], onNodesChange, onConnectionsChange, onOpenPalette, onViewportCenterChange, onSelectedNodeChange, onSelectedNodeCountChange, onOpenLibrary, onOpenVariables,
  onHistoryGroupStart, onHistoryGroupEnd, onNodeDrop, onSaveNodePrefab, onOpenEmbedStudio, onOpenTextStudio, onOpenPermissionStudio, onOpenSlashCommandStudio, onOpenModalStudio, onOpenFunctionGraph, remoteActions = [], onCollaborationAction
}) {
  const shortcutModifier = shortcutPlatform === 'macos' ? '⌘' : 'Ctrl';
  const containerRef = useRef(null);
  const handledFocusRequestRef = useRef(null);
  const viewportGraphKey = graphId ? `arc_project_${projectId || 'default'}_arc_canvas_view_${graphId}` : '';
  const viewportGraphKeyRef = useRef(viewportGraphKey);
  const [pan, setPan] = useState({ x: 22, y: 18 });
  const [zoom, setZoom] = useState(1);
  const viewportRef = useRef({ pan, zoom });
  viewportRef.current = { pan, zoom };
  const [isPanning, setIsPanning] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState([]);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [deleteConfirmationIds, setDeleteConfirmationIds] = useState(null);
  const [selectionBox, setSelectionBox] = useState(null);
  const [draggingNode, setDraggingNode] = useState(null);
  const [draggingNote, setDraggingNote] = useState(null);

  useEffect(() => { onSelectedNodeChange?.(selectedNodeId || null); }, [onSelectedNodeChange, selectedNodeId]);
  useEffect(() => { onSelectedNodeCountChange?.(selectedNodeIds.length); }, [onSelectedNodeCountChange, selectedNodeIds.length]);
  const [libraryDragPreview, setLibraryDragPreview] = useState(null);
  const [wireLayoutRevision, refreshWireLayout] = useState(0);
  const [connectingWire, setConnectingWire] = useState(null);
  const connectingWireRef = useRef(connectingWire);
  connectingWireRef.current = connectingWire;
  const [wireCutAnimations, setWireCutAnimations] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [viewportSectionId, setViewportSectionId] = useState(null);
  const [shakingNodeId, setShakingNodeId] = useState(null);
  const clipboardRef = useRef(null);
  const pointerPositionRef = useRef(null);
  const touchPointersRef = useRef(new Map());
  const touchPinchRef = useRef(null);
  const lastPastePositionRef = useRef(null);
  const pasteCascadeRef = useRef(0);
  const uiScale = getArcUiScale();
  const contextMenuRef = useRef(null);
  const shakeTimerRef = useRef(null);
  const wireCutTimersRef = useRef(new Map());
  const panStartRef = useRef({ x: 0, y: 0 });
  const selectionStartRef = useRef(null);
  const rightPanMovedRef = useRef(false);
  const rightPanOriginRef = useRef(null);
  const collaborationCursorRef = useRef({ x: 0, y: 0 });
  const spaceDownRef = useRef(false);
  const altDownRef = useRef(false);
  const cancelConnectingWire = useCallback(() => {
    const current = connectingWireRef.current;
    if (current?.originalConnection) onConnectionsChange?.([...connections.filter((item) => item.id !== current.originalConnection.id), current.originalConnection]);
    setConnectingWire(null);
  }, [connections, onConnectionsChange]);
  const snapToGrid = settings.snapToGrid ?? true;
  const wireStyle = settings.wireStyle || 'bezier';
  const wirePulse = settings.wirePulse ?? true;
  const reduceWireColorNoise = nodes.length >= LARGE_GRAPH_NODE_LIMIT || connections.length >= LARGE_GRAPH_WIRE_LIMIT;
  const denseWiring = connections.length >= 14;
  const wireFanout = useMemo(() => {
    const counts = new Map();
    const orders = new Map();
    const indices = new Map();
    connections.forEach((connection, index) => {
      const key = `${connection.sourceNodeId}:${connection.sourcePinId}`;
      const order = counts.get(key) || 0;
      orders.set(connection.id, order);
      indices.set(connection.id, index);
      counts.set(key, order + 1);
    });
    return { counts, orders, indices };
  }, [connections]);
  const activePulseNodeSet = useMemo(() => new Set(activePulseNodeIds), [activePulseNodeIds]);

  useLayoutEffect(() => {
    viewportGraphKeyRef.current = viewportGraphKey;
    if (!viewportGraphKey) { setPan({ x: 22, y: 18 }); setZoom(1); return; }
    try {
      const saved = JSON.parse(readAppStorage(viewportGraphKey) || 'null');
      const valid = Number.isFinite(saved?.pan?.x) && Number.isFinite(saved?.pan?.y) && Number.isFinite(saved?.zoom);
      setPan(valid ? saved.pan : { x: 22, y: 18 });
      setZoom(valid ? clamp(saved.zoom, 0.25, 2.5) : 1);
    } catch { setPan({ x: 22, y: 18 }); setZoom(1); }
  }, [viewportGraphKey]);

  useEffect(() => {
    if (!viewportGraphKeyRef.current) return;
    const timer = window.setTimeout(() => writeAppStorage(viewportGraphKeyRef.current, JSON.stringify(viewportRef.current)), 120);
    return () => window.clearTimeout(timer);
  }, [pan, zoom]);

  useLayoutEffect(() => {
    const publishCenter = () => {
      const bounds = containerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const displayScale = getCanvasDisplayScale(containerRef.current);
      onViewportCenterChange?.({
        x: Math.round((bounds.width / displayScale / 2 - pan.x) / zoom),
        y: Math.round((bounds.height / displayScale / 2 - pan.y) / zoom)
      });
    };
    publishCenter();
    const observer = typeof ResizeObserver === 'function' && containerRef.current ? new ResizeObserver(publishCenter) : null;
    if (observer && containerRef.current) observer.observe(containerRef.current);
    window.addEventListener('resize', publishCenter);
    return () => { observer?.disconnect(); window.removeEventListener('resize', publishCenter); };
  }, [pan, zoom, onViewportCenterChange]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Shift') setShiftHeld(true);
      if (event.key === 'Alt') altDownRef.current = true;
      const shortcutBlocked = isTextTarget(event.target) || (event.target instanceof HTMLElement && Boolean(event.target.closest('[role="dialog"]')));
      if (event.code === 'Space' && !event.repeat && !shortcutBlocked) spaceDownRef.current = true;
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'a' && !shortcutBlocked) {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) {
          const viewport = containerRef.current?.getBoundingClientRect();
          const visibleIds = [...(containerRef.current?.querySelectorAll('[data-node-card-id]') || [])]
            .filter((card) => {
              const rect = card.getBoundingClientRect();
              return viewport && rect.right > viewport.left && rect.left < viewport.right && rect.bottom > viewport.top && rect.top < viewport.bottom;
            })
            .map((card) => card.dataset.nodeCardId);
          selectNodes(visibleIds);
        } else selectNodes(nodes.map((node) => node.id));
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNodeIds.length && !isLocked && !shortcutBlocked) {
        event.preventDefault();
        deleteNodes(selectedNodeIds);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && selectedNodeIds.length && !shortcutBlocked) {
        event.preventDefault();
        copyNodes(selectedNodeIds);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v' && clipboardRef.current && !shortcutBlocked && !isLocked) {
        event.preventDefault();
        pasteNodes();
      }
      if (!shortcutBlocked && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === 'n' && !event.shiftKey && !isLocked) {
          event.preventDefault();
          const bounds = containerRef.current?.getBoundingClientRect();
          const pointer = pointerPositionRef.current;
          const displayScale = getCanvasDisplayScale(containerRef.current);
          const position = bounds && pointer && pointer.x >= bounds.left && pointer.x <= bounds.right && pointer.y >= bounds.top && pointer.y <= bounds.bottom
            ? { x: Math.round(((pointer.x - bounds.left) / displayScale - pan.x) / zoom), y: Math.round(((pointer.y - bounds.top) / displayScale - pan.y) / zoom) }
            : bounds ? { x: Math.round((bounds.width / displayScale / 2 - pan.x) / zoom), y: Math.round((bounds.height / displayScale / 2 - pan.y) / zoom) } : { x: 100, y: 100 };
          addNote(position);
        } else if (key === 'f' && !event.shiftKey) {
          event.preventDefault();
          setContextMenu(null);
          fitView();
        } else if (key === 'g' && event.shiftKey && !isLocked) {
          const note = notes.find((item) => item.id === contextMenu?.noteId);
          const ids = contextMenu?.nodeIds?.length ? contextMenu.nodeIds : selectedNodeIds;
          if ((note && mayEditNote(note)) || (!note && ids.length)) {
            event.preventDefault();
            onRequestCreateTagGroup?.(note ? [] : ids, note ? [note.id] : undefined);
            setContextMenu(null);
          }
        }
      }
      if (event.key === 'Escape' && connectingWire) cancelConnectingWire();
    };
    const onKeyUp = (event) => {
      if (event.code === 'Space') spaceDownRef.current = false;
      if (event.key === 'Shift') setShiftHeld(false);
      if (event.key === 'Alt') altDownRef.current = false;
    };
    const onBlur = () => { spaceDownRef.current = false; altDownRef.current = false; setShiftHeld(false); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [selectedNodeId, selectedNodeIds, connectingWire, isLocked, nodes, connections, onOpenPalette, cancelConnectingWire, pan, zoom, notes, contextMenu, onRequestCreateTagGroup, currentUser, onNotesChange]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    setIsPanning(false);
    rightPanOriginRef.current = null;
    const close = (event) => {
      if (event.target instanceof Node && contextMenuRef.current?.contains(event.target)) return;
      setContextMenu(null);
    };
    const onKeyDown = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', onKeyDown);
    const removePageBlurListener = onPageBlur(() => setContextMenu(null));
    return () => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', onKeyDown);
      removePageBlurListener();
    };
  }, [contextMenu, uiScale]);

  useEffect(() => () => {
    window.clearTimeout(shakeTimerRef.current);
    for (const timer of wireCutTimersRef.current.values()) window.clearTimeout(timer);
    wireCutTimersRef.current.clear();
  }, []);

  useLayoutEffect(() => {
    const menu = contextMenuRef.current;
    if (!contextMenu || !menu) return;
    const bounds = menu.getBoundingClientRect();
    const x = Math.max(8, Math.min(contextMenu.x, window.innerWidth - bounds.width - 8));
    const y = Math.max(8, Math.min(contextMenu.y, window.innerHeight - bounds.height - 8));
    if (x !== contextMenu.x || y !== contextMenu.y) setContextMenu((current) => current ? { ...current, x, y } : current);
  }, [contextMenu, uiScale]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const onWheel = (event) => {
      const menuOpen = Boolean(document.querySelector('.canvas-context-menu, .arc-dropdown.is-open'));
      if (menuOpen) {
        if (event.target instanceof Element && event.target.closest('.arc-dropdown')) return;
        event.preventDefault();
        return;
      }
      let scrollArea = event.target instanceof Element ? event.target : null;
      while (scrollArea && scrollArea !== container) {
        const style = window.getComputedStyle(scrollArea);
        const vertical = ['auto', 'scroll'].includes(style.overflowY) && scrollArea.scrollHeight > scrollArea.clientHeight;
        const horizontal = ['auto', 'scroll'].includes(style.overflowX) && scrollArea.scrollWidth > scrollArea.clientWidth;
        const canScrollY = event.deltaY !== 0 && vertical && (event.deltaY < 0 ? scrollArea.scrollTop > 0 : scrollArea.scrollTop + scrollArea.clientHeight < scrollArea.scrollHeight - 1);
        const canScrollX = event.deltaX !== 0 && horizontal && (event.deltaX < 0 ? scrollArea.scrollLeft > 0 : scrollArea.scrollLeft + scrollArea.clientWidth < scrollArea.scrollWidth - 1);
        if ((canScrollY || canScrollX) && !event.ctrlKey && !event.metaKey && !event.shiftKey) return;
        scrollArea = scrollArea.parentElement;
      }
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = container.getBoundingClientRect();
        const displayScale = getCanvasDisplayScale(container);
        const cursorX = (event.clientX - rect.left) / displayScale;
        const cursorY = (event.clientY - rect.top) / displayScale;
        const factor = Math.exp(-(event.deltaY / displayScale) * 0.006);
        setZoom((currentZoom) => {
          const nextZoom = clamp(currentZoom * factor, 0.25, 2.5);
          setPan((currentPan) => ({
            x: cursorX - ((cursorX - currentPan.x) / currentZoom) * nextZoom,
            y: cursorY - ((cursorY - currentPan.y) / currentZoom) * nextZoom
          }));
          return nextZoom;
        });
      } else if (event.shiftKey) {
        const displayScale = getCanvasDisplayScale(container);
        setPan((current) => ({ x: current.x - event.deltaY / displayScale, y: current.y }));
      } else {
        const displayScale = getCanvasDisplayScale(container);
        setPan((current) => ({ x: current.x - event.deltaX / displayScale, y: current.y - event.deltaY / displayScale }));
      }
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const validIds = selectedNodeIds.filter((id) => nodes.some((node) => node.id === id));
    if (validIds.length !== selectedNodeIds.length) setSelectedNodeIds(validIds);
    if (selectedNodeId && !nodes.some((node) => node.id === selectedNodeId)) setSelectedNodeId(validIds[0] || null);
  }, [nodes, selectedNodeId, selectedNodeIds]);

  const definitionsByType = new Map(BuiltInNodeDefinitions.map((definition) => [definition.type, definition]));
  const modalFieldOptions = useMemo(() => nodes.flatMap((modalNode) => {
    if (modalNode.type !== 'build_modal') return [];
    const modal = modalNode.data?.modal || {};
    return (modal.components || []).filter((field) => field.customId).map((field) => ({
      value: field.customId,
      label: `${modal.title || modal.customId || 'Popup modal'} · ${field.label || field.customId} (${field.customId})`
    }));
  }), [nodes]);

  const getNodeDefinition = useCallback((node, seen = new Set()) => {
    const definition = definitionsByType.get(node.type);
    if (!definition) return undefined;
    if (seen.has(node.id)) return definition;
    const nextSeen = new Set(seen).add(node.id);
    const withExecInputPins = (nextDefinition) => {
      const inputs = nextDefinition.inputs || [];
      const execPin = inputs.find((pin) => pin.type === 'exec');
      if (!execPin) return nextDefinition;
      const baseId = execPin.id;
      const highestConnected = connections.reduce((highest, wire) => {
        if (wire.targetNodeId !== node.id) return highest;
        if (wire.targetPinId === baseId) return Math.max(highest, 1);
        const match = new RegExp(`^${baseId}_(\\d+)$`).exec(wire.targetPinId);
        return match ? Math.max(highest, Number(match[1])) : highest;
      }, 0);
      const count = Math.min(16, Math.max(1, highestConnected + 1));
      return { ...nextDefinition, inputs: [...inputs, ...Array.from({ length: count - 1 }, (_, index) => ({ ...execPin, id: `${baseId}_${index + 2}`, label: `Exec ${index + 2}` }))] };
    };
    if (node.type === 'utility_wire_extender') {
      const resolvePin = (nodeId, pinId, direction, seen = new Set()) => {
        const key = `${nodeId}:${pinId}:${direction}`;
        if (seen.has(key)) return null;
        seen.add(key);
        const candidate = nodes.find((item) => item.id === nodeId);
        if (!candidate) return null;
        if (candidate.type !== 'utility_wire_extender') {
          const base = definitionsByType.get(candidate.type);
          return (direction === 'output' ? base?.outputs : base?.inputs)?.find((pin) => pin.id === pinId) || null;
        }
        const index = pinId.match(/_(\d+)$/)?.[1] || (pinId === 'value_in' || pinId === 'value_out' ? '1' : null);
        if (!index) return null;
        const wire = direction === 'output'
          ? connections.find((item) => item.targetNodeId === candidate.id && (item.targetPinId === `value_in_${index}` || (index === '1' && item.targetPinId === 'value_in')))
          : connections.find((item) => item.sourceNodeId === candidate.id && (item.sourcePinId === `value_out_${index}` || (index === '1' && item.sourcePinId === 'value_out')));
        if (!wire) return null;
        return direction === 'output'
          ? resolvePin(wire.sourceNodeId, wire.sourcePinId, 'output', seen)
          : resolvePin(wire.targetNodeId, wire.targetPinId, 'input', seen);
      };
      const highestUsed = connections.reduce((highest, wire) => {
        const endpoint = wire.sourceNodeId === node.id ? wire.sourcePinId : wire.targetNodeId === node.id ? wire.targetPinId : '';
        return Math.max(highest, Number(/^value_(?:in|out)_(\d+)$/.exec(endpoint)?.[1]) || (endpoint === 'value_in' || endpoint === 'value_out' ? 1 : 0));
      }, 0);
      const legacyFirst = connections.some((wire) => (wire.sourceNodeId === node.id && wire.sourcePinId === 'value_out') || (wire.targetNodeId === node.id && wire.targetPinId === 'value_in'));
      const pairCount = Math.min(7, Math.max(1, highestUsed + 1));
      const inputs = [{ ...definition.inputs[0] }];
      const outputs = [{ ...definition.outputs[0] }];
      for (let index = 1; index <= pairCount; index += 1) {
        const inputId = legacyFirst && index === 1 ? 'value_in' : `value_in_${index}`;
        const outputId = legacyFirst && index === 1 ? 'value_out' : `value_out_${index}`;
        const incoming = connections.find((wire) => wire.targetNodeId === node.id && wire.targetPinId === inputId);
        const outgoing = connections.find((wire) => wire.sourceNodeId === node.id && wire.sourcePinId === outputId);
        const inferred = (incoming && resolvePin(incoming.sourceNodeId, incoming.sourcePinId, 'output'))
          || (outgoing && resolvePin(outgoing.targetNodeId, outgoing.targetPinId, 'input'));
        const type = inferred?.type && inferred.type !== 'any' ? inferred.type : 'any';
        const label = inferred?.label || `Any Value ${index}`;
        inputs.push({ id: inputId, label, type });
        outputs.push({ id: outputId, label, type });
      }
      return withExecInputPins({ ...definition, inputs, outputs });
    }
    const withArgumentPins = (nextDefinition) => {
      const argumentPins = getNodeArgumentPins(node, nextDefinition.inputs || [], connections);
      const existingIds = new Set((nextDefinition.inputs || []).map((pin) => pin.id));
      const typedArgumentPins = argumentPins.map((pin) => {
        const wire = connections.find((connection) => connection.targetNodeId === node.id && connection.targetPinId === pin.id);
        if (!wire) return pin;
        const sourceNode = nodes.find((item) => item.id === wire.sourceNodeId);
        const sourceDefinition = sourceNode && getNodeDefinition(sourceNode, nextSeen);
        const sourcePin = sourceDefinition?.outputs?.find((item) => item.id === wire.sourcePinId);
        const colorType = sourcePin?.colorType || sourcePin?.type;
        return colorType && colorType !== 'arg' && colorType !== 'any' ? { ...pin, colorType } : pin;
      });
      const withArguments = typedArgumentPins.length ? { ...nextDefinition, inputs: [...(nextDefinition.inputs || []), ...typedArgumentPins.filter((pin) => !existingIds.has(pin.id))] } : nextDefinition;
      return withExecInputPins(withArguments);
    };
    if (node.type === 'event_message_create') {
      const highestArgument = connections.reduce((highest, wire) => wire.sourceNodeId === node.id ? Math.max(highest, Number(/^argument_(\d+)$/.exec(wire.sourcePinId)?.[1]) || 0) : highest, 0);
      const argumentOutputs = Array.from({ length: Math.min(50, Math.max(1, highestArgument + 1)) }, (_, index) => ({ id: `argument_${index + 1}`, label: `Argument ${index + 1}`, type: 'string' }));
      return withArgumentPins({ ...definition, outputs: [...definition.outputs.filter((pin) => !/^argument_\d+$/.test(pin.id)), ...argumentOutputs] });
    }
    if (node.type === 'event_slash_command') {
      const optionOutputs = (Array.isArray(node.data?.options) ? node.data.options : []).filter((option) => /^[a-z0-9_-]{1,32}$/.test(String(option.name || ''))).map((option) => ({ id: `option_${option.name}`, label: option.name, type: ({ 4: 'number', 10: 'number', 5: 'boolean' })[Number(option.type)] || 'string' }));
      return withArgumentPins({ ...definition, outputs: [...definition.outputs.filter((pin) => !pin.id.startsWith('option_')), ...optionOutputs] });
    }
    if (node.type === 'data_permission_overwrites') return withExecInputPins({ ...definition, inputs: getPermissionOverwritePins(node, connections) });
    if (node.type === 'data_string_split' || node.type === 'data_parse_prefix_command') {
      const partPrefix = node.type === 'data_string_split' ? 'part_' : 'argument_';
      const partPattern = node.type === 'data_string_split' ? /^part_(\d+)$/ : /^argument_(\d+)$/;
      const highest = connections.reduce((value, wire) => {
        if (wire.sourceNodeId !== node.id) return value;
        return Math.max(value, Number(partPattern.exec(wire.sourcePinId)?.[1]) || 0);
      }, 0);
      const partCount = Math.min(50, Math.max(1, highest + 1));
      const partOutputs = Array.from({ length: partCount }, (_, index) => ({
        id: `${partPrefix}${index + 1}`,
        label: node.type === 'data_string_split' ? `Part ${index + 1}` : `Argument ${index + 1}`,
        type: 'string'
      }));
      return withExecInputPins({ ...definition, outputs: [...definition.outputs, ...partOutputs] });
    }
    if (node.type === 'data_array_create') return withExecInputPins({ ...definition, inputs: getArrayCreatePins(node, connections) });
    if (node.type === 'data_array_append') return withExecInputPins({ ...definition, inputs: [...definition.inputs.filter((pin) => pin.id === 'array'), ...getArrayAppendPins(node, connections)] });
    if (node.type === 'data_array_concat') return withExecInputPins({ ...definition, inputs: getArrayCombinePins(node, connections) });
    if (node.type === 'math_sum' || node.type === 'math_average') return withExecInputPins({ ...definition, inputs: getMathListPins(node, connections) });
    if (node.type === 'logic_xor_many') {
      const highest = connections.reduce((value, wire) => wire.targetNodeId === node.id ? Math.max(value, Number(/^input_(\d+)$/.exec(wire.targetPinId)?.[1]) || 0) : value, 0);
      const count = Math.min(25, Math.max(2, highest + 1));
      const inputs = Array.from({ length: count }, (_, index) => ({ id: `input_${index + 1}`, label: `Input ${index + 1}`, type: 'boolean', defaultValue: false }));
      return withExecInputPins({ ...definition, inputs });
    }
    if (node.type === 'variable_create') {
      const valueWire = connections.find((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'value');
      const sourceNode = valueWire && nodes.find((item) => item.id === valueWire.sourceNodeId);
      const sourceDefinition = sourceNode && definitionsByType.get(sourceNode.type);
      const sourcePin = sourceDefinition?.outputs?.find((pin) => pin.id === valueWire?.sourcePinId);
      const createdSource = sourceNode?.type === 'variable_create'
        ? graphVariables.find((variable) => variable.id === `nodevar_${sourceNode.id}`)
        : sourceNode?.type === 'variable_get'
          ? graphVariables.find((variable) => variable.id === sourceNode.data?.variableId || variable.sourceNodeId === connections.find((wire) => wire.targetNodeId === sourceNode.id && wire.targetPinId === 'variable')?.sourceNodeId)
          : null;
      let inferredType = createdSource?.type || sourcePin?.type || node.data?.valueType || 'string';
      if (sourcePin?.type === 'object' && ['data_array_create', 'data_array_append', 'data_array_concat'].includes(sourceNode?.type)) inferredType = 'array';
      if (sourceNode?.type === 'data_parse_json' && !connections.some((wire) => wire.targetNodeId === sourceNode.id && wire.targetPinId === 'json')) {
        try { inferredType = Array.isArray(JSON.parse(sourceNode.data?.json || '')) ? 'array' : 'object'; } catch {}
      }
      const socketType = ['array', 'object'].includes(inferredType) ? 'object' : inferredType;
      const inputs = definition.inputs.map((pin) => pin.id === 'value' ? { ...pin, colorType: inferredType } : pin);
      const outputs = definition.outputs.map((pin) => pin.id === 'value' ? { ...pin, type: socketType, colorType: inferredType } : pin);
      return withExecInputPins({ ...definition, inputs, outputs });
    }
    if (node.type === 'variable_get' || node.type === 'variable_set') {
      const resolveVariable = (targetNode, seen = new Set()) => {
        if (!targetNode || seen.has(targetNode.id)) return null;
        const nextSeen = new Set(seen).add(targetNode.id);
        const referenceWire = connections.find((wire) => wire.targetNodeId === targetNode.id && wire.targetPinId === 'variable');
        if (referenceWire) {
          const sourceNode = nodes.find((item) => item.id === referenceWire.sourceNodeId);
          const sourceVariable = graphVariables.find((item) => item.sourceNodeId === sourceNode?.id);
          if (sourceVariable) return sourceVariable;
          if (sourceNode && ['variable_get', 'variable_set'].includes(sourceNode.type)) return resolveVariable(sourceNode, nextSeen);
        }
        return graphVariables.find((item) => item.id === targetNode.data?.variableId) || null;
      };
      const variable = resolveVariable(node);
      const pinType = ['array', 'object'].includes(variable?.type) ? 'object' : variable?.type || 'string';
      const pinLabel = variable?.name || 'Value';
      return node.type === 'variable_get'
        ? withArgumentPins({ ...definition, outputs: definition.outputs.map((pin) => pin.id === 'value' ? { ...pin, label: pinLabel, type: pinType, colorType: variable?.type || pinType } : pin) })
        : withArgumentPins({ ...definition, inputs: definition.inputs.map((pin) => pin.id === 'value' ? { ...pin, label: pinLabel, type: pinType, colorType: variable?.type || pinType, defaultValue: variable?.initialValue ?? '' } : pin) });
    }
    if (node.type === 'build_embed' && Array.isArray(node.data?.blocks)) {
      return withArgumentPins({ ...definition, inputs: embedBlockPins(getEmbedBlocks(node.data)) });
    }
    if (node.type === 'build_embed' && Array.isArray(node.data?.fields) && node.data.fields.length) {
      return withArgumentPins({
        ...definition,
        inputs: [...definition.inputs, ...node.data.fields.flatMap((field, index) => [
          { id: `field_${field.id}_name`, label: `Field ${index + 1} name`, type: 'string', defaultValue: field.name || '' },
          { id: `field_${field.id}_value`, label: `Field ${index + 1} value`, type: 'string', defaultValue: field.value || '' }
        ])]
      });
    }
    if (node.type === 'format_text') {
      const placeholders = getTextTemplateSlots(node.data?.template);
      return withArgumentPins({ ...definition, inputs: placeholders.map((name) => {
        const argument = /^arg(\d+)$/i.exec(name);
        return argument
          ? { id: `arg_${argument[1]}`, label: `arg${argument[1]}`, type: 'arg', defaultValue: '' }
          : { id: `slot_${name}`, label: name, type: graphVariables.find((variable) => variable.name.toLowerCase() === name.toLowerCase())?.type || 'string', defaultValue: '' };
      }) });
    }
    if (node.type === 'function_input') {
      const type = node.data?.valueType || 'number';
      return withExecInputPins({ ...definition, outputs: [{ id: 'value', label: node.data?.name || 'Value', type }] });
    }
    if (node.type === 'function_return') {
      const type = node.data?.valueType || 'number';
      return withExecInputPins({ ...definition, inputs: [{ id: 'value', label: 'Return', type, defaultValue: defaultForType(type) }] });
    }
    if (node.type === 'function_call') {
      const target = callableGraphs.find((graph) => graph.id === node.data?.graphId);
      const params = (target?.nodes || []).filter((item) => item.type === 'function_input');
      const returnNode = target?.nodes?.find((item) => item.type === 'function_return');
      return withExecInputPins({
        ...definition,
        inputs: params.map((param) => ({ id: `arg_${param.data?.paramId || param.id}`, label: `${param.data?.name || 'Input'}${param.data?.optional !== false ? ' (optional)' : ''}`, type: param.data?.valueType || 'number', defaultValue: param.data?.defaultValue ?? defaultForType(param.data?.valueType) })),
        outputs: returnNode ? [{ id: 'result', label: 'Result', type: returnNode.data?.valueType || 'number' }] : []
      });
    }
    return withArgumentPins(definition);
  }, [definitionsByType, callableGraphs, graphVariables, connections, nodes]);
  const templateSocketSuggestions = useMemo(() => {
    const suggestions = [];
    const seenNames = new Set();
    for (const sourceNode of nodes) {
      const definition = getNodeDefinition(sourceNode);
      for (const pin of definition?.outputs || []) {
        if (pin.type === 'exec' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(pin.id) || seenNames.has(pin.id.toLowerCase())) continue;
        seenNames.add(pin.id.toLowerCase());
        suggestions.push({ name: pin.id, nodeId: sourceNode.id, label: `${sourceNode.label || definition.label} · ${pin.label || pin.id}` });
      }
    }
    return suggestions;
  }, [nodes, getNodeDefinition]);
  const breadcrumbNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) : null;
  const breadcrumbNodeLabel = breadcrumbNode?.label || (breadcrumbNode ? getNodeDefinition(breadcrumbNode)?.label || breadcrumbNode.type : '');

  useEffect(() => {
    if (!focusRequest || focusRequest.graphId !== graphId || handledFocusRequestRef.current === focusRequest.requestId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const node = nodes.find((item) => item.id === focusRequest.nodeId);
      const container = containerRef.current;
      if (!node || !container) return;
      const bounds = container.getBoundingClientRect();
      const displayScale = getCanvasDisplayScale(container);
      const card = [...container.querySelectorAll('[data-node-card-id]')].find((item) => item.dataset.nodeCardId === node.id);
      const cardBounds = card?.getBoundingClientRect();
      const width = cardBounds?.width ? cardBounds.width / displayScale / zoom : NODE_WIDTH;
      const height = cardBounds?.height ? cardBounds.height / displayScale / zoom : estimateNodeHeight(getNodeDefinition(node));
      const viewportWidth = bounds.width / displayScale;
      const viewportHeight = bounds.height / displayScale;
      setPan({
        x: viewportWidth / 2 - (node.x + width / 2) * zoom,
        y: viewportHeight / 2 - (node.y + height / 2) * zoom
      });
      setSelectedNodeId(node.id);
      setSelectedNodeIds([node.id]);
      handledFocusRequestRef.current = focusRequest.requestId;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequest, graphId, nodes, zoom, getNodeDefinition]);

  useEffect(() => {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    let changed = false;
    const repaired = connections.map((connection) => {
      const source = nodesById.get(connection.sourceNodeId);
      const target = nodesById.get(connection.targetNodeId);
      if (source?.type !== 'data_permission_overwrites' || connection.sourcePinId !== 'overwrites' || connection.targetPinId !== 'exec' || !['action_create_channel', 'action_edit_channel'].includes(target?.type)) return connection;
      changed = true;
      return { ...connection, targetPinId: 'permission_overwrites' };
    });
    if (changed) onConnectionsChange?.(repaired);
  }, [connections, nodes, onConnectionsChange]);

  useLayoutEffect(() => {
    refreshWireLayout((revision) => revision + 1);
  }, [nodes, connections, pan, zoom, graphVariables, functionGraphs, callableGraphs, settings.uiScale]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => refreshWireLayout((revision) => revision + 1));
    observer.observe(container);
    const appRoot = container.closest('.app-root');
    if (appRoot) observer.observe(appRoot);
    container.querySelectorAll('[data-node-card-id]').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [nodes.length]);

  const showLibraryDragPreview = useCallback((payload, clientX, clientY) => {
    const container = containerRef.current;
    if (!container) return;
    const target = document.elementFromPoint(clientX, clientY);
    if (!target || !container.contains(target)) { setLibraryDragPreview(null); return; }
    const bounds = container.getBoundingClientRect();
    const type = payload?.previewNode?.type || payload?.prefabNode?.type || payload?.nodeType || (payload?.type === 'graph-call' ? 'function_call' : payload?.type === 'embed-asset' ? 'build_embed' : null);
    const definition = definitionsByType.get(type);
    if (!definition) { setLibraryDragPreview(null); return; }
    const targetGraph = payload.type === 'graph-call' ? callableGraphs.find((graph) => graph.id === payload.graphId) : null;
    const sourceNode = payload.previewNode || payload.prefabNode || (targetGraph ? { type, label: `Call ${targetGraph.name || 'Graph'}`, data: { graphId: targetGraph.id } } : payload.type === 'embed-asset' ? { type, label: payload.name || 'Embed', data: { blocks: payload.blocks || [], embedName: payload.name || 'Untitled embed' } } : null);
    const node = sourceNode
      ? { ...sourceNode, id: '__arc_drag_preview__', type, x: 0, y: 0, data: sourceNode.data || {} }
      : { id: '__arc_drag_preview__', type, x: 0, y: 0, data: {} };
    const displayScale = getCanvasDisplayScale(container);
    const x = ((clientX - bounds.left) / displayScale - pan.x) / zoom;
    const y = ((clientY - bounds.top) / displayScale - pan.y) / zoom;
    const preview = { node, definition: getNodeDefinition(node), x, y };
    setLibraryDragPreview(preview);
    onCollaborationAction?.({ kind: 'library-drag', cursor: { x: preview.x, y: preview.y }, nodeType: type, label: node.label || preview.definition?.label || type });
  }, [definitionsByType, callableGraphs, getNodeDefinition, onCollaborationAction, pan, zoom]);

  const updateLibraryDragPreview = (event) => {
    const activePayload = window.__arcNodeDragPayload || window.__arcGraphDragPayload || window.__arcEmbedDragPayload;
    const raw = readTransferData(event.dataTransfer, 'application/x-arc-node');
    const graphRaw = readTransferData(event.dataTransfer, 'application/x-arc-graph-call');
    const embedRaw = readTransferData(event.dataTransfer, 'application/x-arc-embed-asset');
    const fallback = parseLibraryTransferText(readTransferData(event.dataTransfer, 'text/plain'));
    let payload = activePayload;
    if (!payload && raw) { try { payload = JSON.parse(raw); } catch {} }
    if (!payload && graphRaw) { try { payload = { type: 'graph-call', ...JSON.parse(graphRaw) }; } catch {} }
    if (!payload && embedRaw) { try { payload = JSON.parse(embedRaw); } catch {} }
    if (!payload && fallback) payload = window.__arcLibraryDragPayloads?.[fallback.token]?.payload;
    if (!payload || (!payload.previewNode?.type && !payload.nodeType && !payload.prefabNode?.type && payload.type !== 'graph-call' && payload.type !== 'embed-asset')) {
      setLibraryDragPreview(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    showLibraryDragPreview(payload, event.clientX, event.clientY);
  };

  const dropLibraryPayload = useCallback((payload, clientX, clientY, targetElement) => {
    const container = containerRef.current;
    if (!container || !targetElement || !container.contains(targetElement)) return;
    const bounds = container.getBoundingClientRect();
    const displayScale = getCanvasDisplayScale(container);
    const position = { x: Math.round(((clientX - bounds.left) / displayScale - pan.x) / zoom), y: Math.round(((clientY - bounds.top) / displayScale - pan.y) / zoom) };
    if (payload?.type === 'embed-asset') {
      const targetId = targetElement.closest?.('[data-node-card-id]')?.getAttribute('data-node-card-id');
      const target = nodes.find((node) => node.id === targetId && node.type === 'build_embed');
      if (target) onNodesChange?.(nodes.map((node) => node.id === target.id ? { ...node, data: { ...node.data, blocks: structuredCloneSafe(payload.blocks || []), embedName: payload.name || 'Untitled embed' } } : node));
      else onNodeDrop?.(payload, position);
    } else onNodeDrop?.(payload, position);
  }, [nodes, onNodesChange, onNodeDrop, pan, zoom]);

  useEffect(() => {
    if (!desktopMode) return undefined;
    const onPointerMove = (event) => showLibraryDragPreview(event.detail?.payload, event.detail?.clientX, event.detail?.clientY);
    const onPointerDrop = (event) => {
      const { payload, clientX, clientY } = event.detail || {};
      const target = document.elementFromPoint(clientX, clientY);
      dropLibraryPayload(payload, clientX, clientY, target);
      setLibraryDragPreview(null);
    };
    window.addEventListener('arc-library-pointermove', onPointerMove);
    window.addEventListener('arc-library-pointerdrop', onPointerDrop);
    return () => {
      window.removeEventListener('arc-library-pointermove', onPointerMove);
      window.removeEventListener('arc-library-pointerdrop', onPointerDrop);
    };
  }, [desktopMode, dropLibraryPayload, showLibraryDragPreview]);

  const getSocketPosition = useCallback((nodeId, pinId, direction) => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return { x: 0, y: 0 };
    const row = [...(containerRef.current?.querySelectorAll('.node-pin-row') || [])].find((element) =>
      element.dataset.nodeId === nodeId && element.dataset.pinId === pinId && element.dataset.direction === direction
    );
    const socket = row?.querySelector('.pin-socket');
    const card = row?.closest('[data-node-card-id]');
    const socketBounds = socket?.getBoundingClientRect();
    const cardBounds = card?.getBoundingClientRect();
    if (socketBounds && cardBounds && cardBounds.width > 0) {
      const scale = cardBounds.width / NODE_WIDTH;
      return {
        x: node.x + (socketBounds.left + socketBounds.width / 2 - cardBounds.left) / scale,
        y: node.y + (socketBounds.top + socketBounds.height / 2 - cardBounds.top) / scale
      };
    }
    const definition = getNodeDefinition(node);
    const pins = direction === 'output' ? definition?.outputs || [] : definition?.inputs || [];
    const index = Math.max(0, pins.findIndex((pin) => pin.id === pinId));
    return {
      x: node.x + (direction === 'output' ? NODE_WIDTH : 0),
      y: node.y + 72 + index * 23
    };
  }, [nodes, getNodeDefinition]);

  const pinFromRow = useCallback((row) => row ? ({
    nodeId: row.dataset.nodeId,
    pinId: row.dataset.pinId,
    direction: row.dataset.direction,
    pinType: row.dataset.pinType
  }) : null, []);

  const isCompatiblePin = useCallback((start, candidate) => {
    if (!candidate || !start || candidate.nodeId === start.nodeId || candidate.direction === start.direction) return false;
    const output = start.direction === 'output' ? start : candidate;
    const input = start.direction === 'input' ? start : candidate;
    if (output.pinType === 'exec' || input.pinType === 'exec') return output.pinType === 'exec' && input.pinType === 'exec';
    return output.pinType === input.pinType || output.pinType === 'any' || input.pinType === 'any' || input.pinType === 'arg';
  }, []);

  const findClosestPin = useCallback((clientX, clientY, start, maxDistance = 28) => {
    const rows = containerRef.current?.querySelectorAll('.node-pin-row') || [];
    let closest = null;
    let closestDistance = maxDistance;
    rows.forEach((row) => {
      const pin = pinFromRow(row);
      if (!isCompatiblePin(start, pin)) return;
      const socket = row.querySelector('.pin-socket');
      const bounds = socket?.getBoundingClientRect();
      if (!bounds) return;
      const x = bounds.left + bounds.width / 2;
      const y = bounds.top + bounds.height / 2;
      const distance = Math.hypot(clientX - x, clientY - y) / getCanvasDisplayScale(containerRef.current);
      if (distance <= closestDistance) {
        closestDistance = distance;
        closest = { ...pin, screenPosition: { x, y }, distance };
      }
    });
    return closest;
  }, [isCompatiblePin, pinFromRow]);

  function deleteNode(nodeId) {
    onHistoryGroupStart?.();
    onNodesChange?.(nodes.filter((node) => node.id !== nodeId));
    onConnectionsChange?.(connections.filter((connection) => connection.sourceNodeId !== nodeId && connection.targetNodeId !== nodeId));
    onHistoryGroupEnd?.();
    setSelectedNodeId((selected) => selected === nodeId ? null : selected);
    setSelectedNodeIds((selected) => selected.filter((id) => id !== nodeId));
  }

  function deleteNodes(nodeIds, confirmed = false) {
    const ids = new Set(nodeIds);
    if (ids.size > 1 && !confirmed) {
      setDeleteConfirmationIds([...ids]);
      return;
    }
    onHistoryGroupStart?.();
    onNodesChange?.(nodes.filter((node) => !ids.has(node.id)));
    onConnectionsChange?.(connections.filter((connection) => !ids.has(connection.sourceNodeId) && !ids.has(connection.targetNodeId)));
    onHistoryGroupEnd?.();
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setDeleteConfirmationIds(null);
  }

  const selectNodes = (ids, primaryId = ids[ids.length - 1] || null) => {
    const validIds = [...new Set(ids)];
    setSelectedNodeIds(validIds);
    setSelectedNodeId(primaryId && validIds.includes(primaryId) ? primaryId : validIds[validIds.length - 1] || null);
    onCollaborationAction?.({ kind: 'selection', selectedNodeIds: validIds });
  };

  const selectTagGroupNodes = (groupId) => {
    const group = tagGroups.find((item) => item.id === groupId);
    if (!group) return;
    const nodeIds = (group.nodeIds || []).filter((id) => nodes.some((node) => node.id === id));
    if (nodeIds.length) selectNodes(nodeIds);
  };

  function copyNodes(nodeIds) {
    const ids = new Set(nodeIds);
    const selected = nodes.filter((node) => ids.has(node.id));
    if (!selected.length) return;
    const selectedIds = new Set(selected.map((node) => node.id));
    clipboardRef.current = {
      nodes: structuredCloneSafe(selected),
      connections: structuredCloneSafe(connections.filter((wire) => selectedIds.has(wire.sourceNodeId) && selectedIds.has(wire.targetNodeId)))
    };
  }

  function pasteNodes(source = clipboardRef.current) {
    if (!source) return;
    const fragment = Array.isArray(source.nodes) ? source : { nodes: [source], connections: [] };
    const bounds = containerRef.current?.getBoundingClientRect();
    const pointer = pointerPositionRef.current;
    let pasteOrigin = null;
    if (bounds && pointer && pointer.x >= bounds.left && pointer.x <= bounds.right && pointer.y >= bounds.top && pointer.y <= bounds.bottom) {
      const displayScale = getCanvasDisplayScale(containerRef.current);
      const currentViewport = viewportRef.current;
      pasteOrigin = { x: ((pointer.x - bounds.left) / displayScale - currentViewport.pan.x) / currentViewport.zoom, y: ((pointer.y - bounds.top) / displayScale - currentViewport.pan.y) / currentViewport.zoom };
      const last = lastPastePositionRef.current;
      pasteCascadeRef.current = last && Math.hypot(pointer.x - last.x, pointer.y - last.y) < 4 ? pasteCascadeRef.current + 1 : 0;
      lastPastePositionRef.current = { ...pointer };
      pasteOrigin.x += pasteCascadeRef.current * 24;
      pasteOrigin.y += pasteCascadeRef.current * 24;
    }
    const minX = Math.min(...fragment.nodes.map((node) => Number(node.x) || 0));
    const minY = Math.min(...fragment.nodes.map((node) => Number(node.y) || 0));
    const idMap = new Map(fragment.nodes.map((node) => [node.id, `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`]));
    const pastedNodes = fragment.nodes.map((node) => ({
      ...structuredCloneSafe(node),
      id: idMap.get(node.id),
      x: Math.round(pasteOrigin ? pasteOrigin.x + ((Number(node.x) || 0) - minX) : (node.x || 0) + 40),
      y: Math.round(pasteOrigin ? pasteOrigin.y + ((Number(node.y) || 0) - minY) : (node.y || 0) + 40)
    }));
    const pastedConnections = (fragment.connections || []).filter((wire) => idMap.has(wire.sourceNodeId) && idMap.has(wire.targetNodeId)).map((wire) => ({
      ...structuredCloneSafe(wire), id: `wire_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sourceNodeId: idMap.get(wire.sourceNodeId), targetNodeId: idMap.get(wire.targetNodeId)
    }));
    onNodesChange?.([...nodes, ...pastedNodes]);
    onConnectionsChange?.([...connections, ...pastedConnections]);
    selectNodes(pastedNodes.map((node) => node.id), pastedNodes[pastedNodes.length - 1]?.id);
  }

  function duplicateNode(nodeId) {
    const source = nodes.find((node) => node.id === nodeId);
    if (!source) return;
    copyNodes([nodeId]);
    pasteNodes();
  }

  const shakeNode = (nodeId) => {
    if (!nodeId) return;
    window.clearTimeout(shakeTimerRef.current);
    setShakingNodeId(null);
    requestAnimationFrame(() => setShakingNodeId(nodeId));
    shakeTimerRef.current = window.setTimeout(() => setShakingNodeId(null), 240);
  };

  const updateNodeData = (nodeId, data, label) => {
    onCollaborationAction?.({ kind: 'node-edit', nodeId });
    const nextNodes = nodes.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, ...data }, ...(label !== undefined ? { label } : {}) } : node);
    const nodesById = new Map(nextNodes.map((node) => [node.id, node]));
    const nextConnections = connections.filter((connection) => {
      const sourceNode = nodesById.get(connection.sourceNodeId);
      const targetNode = nodesById.get(connection.targetNodeId);
      if (!sourceNode || !targetNode) return false;
      const sourcePin = getNodeDefinition(sourceNode)?.outputs?.find((pin) => pin.id === connection.sourcePinId);
      const targetPin = getNodeDefinition(targetNode)?.inputs?.find((pin) => pin.id === connection.targetPinId);
      return sourcePin && targetPin && (sourcePin.type === targetPin.type || sourcePin.type === 'arg' || targetPin.type === 'arg');
    });
    onNodesChange?.(nextNodes);
    if (nextConnections.length !== connections.length) onConnectionsChange?.(nextConnections);
  };

  const startPan = (event) => {
    if (contextMenu || document.querySelector('.arc-dropdown.is-open, .canvas-context-menu')) return;
    const isCanvasTarget = event.target === containerRef.current || event.target.classList?.contains('canvas-surface') || event.target.classList?.contains('canvas-world');
    if (event.pointerType === 'touch' && isCanvasTarget) {
      touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointersRef.current.size >= 2) {
        const pointers = [...touchPointersRef.current.values()].slice(-2);
        const midpoint = { x: (pointers[0].x + pointers[1].x) / 2, y: (pointers[0].y + pointers[1].y) / 2 };
        const distance = Math.max(1, Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y));
        const bounds = containerRef.current?.getBoundingClientRect();
        const displayScale = getCanvasDisplayScale(containerRef.current);
        if (bounds) {
          const current = viewportRef.current;
          const localMidpoint = { x: (midpoint.x - bounds.left) / displayScale, y: (midpoint.y - bounds.top) / displayScale };
          touchPinchRef.current = {
            distance,
            zoom: current.zoom,
            worldPoint: { x: (localMidpoint.x - current.pan.x) / current.zoom, y: (localMidpoint.y - current.pan.y) / current.zoom }
          };
        }
        event.preventDefault();
        setIsPanning(false);
        setDraggingNode(null);
        setDraggingNote(null);
        selectionStartRef.current = null;
        setSelectionBox(null);
        for (const pointerId of touchPointersRef.current.keys()) containerRef.current?.setPointerCapture?.(pointerId);
        return;
      }
    }
    const rightPan = event.button === 2;
    const spacePan = event.button === 0 && spaceDownRef.current;
    if (rightPan && !isCanvasTarget) return;
    if (rightPan || spacePan) {
      event.preventDefault();
      setIsPanning(true);
      rightPanOriginRef.current = rightPan ? { x: event.clientX, y: event.clientY } : null;
      rightPanMovedRef.current = false;
      const displayScale = getCanvasDisplayScale(containerRef.current);
      panStartRef.current = { x: event.clientX / displayScale - pan.x, y: event.clientY / displayScale - pan.y };
      if (Number.isInteger(event.pointerId)) containerRef.current?.setPointerCapture?.(event.pointerId);
      return;
    }
    if (event.button === 1) {
      event.preventDefault();
      setIsPanning(true);
      const displayScale = getCanvasDisplayScale(containerRef.current);
      panStartRef.current = { x: event.clientX / displayScale - pan.x, y: event.clientY / displayScale - pan.y };
      if (Number.isInteger(event.pointerId)) containerRef.current?.setPointerCapture?.(event.pointerId);
      return;
    }
    if (event.button !== 0 || !isCanvasTarget) return;
    if (event.button === 0 && isCanvasTarget) {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused !== document.body && focused !== document.documentElement) focused.blur();
    }
    event.preventDefault();
    selectionStartRef.current = { x: event.clientX, y: event.clientY, additive: event.shiftKey || event.metaKey || event.ctrlKey };
    setSelectionBox({ x1: event.clientX, y1: event.clientY, x2: event.clientX, y2: event.clientY });
    if (Number.isInteger(event.pointerId)) containerRef.current?.setPointerCapture?.(event.pointerId);
  };

  const movePointer = (event) => {
    pointerPositionRef.current = { x: event.clientX, y: event.clientY };
    if (event.pointerType === 'touch' && touchPointersRef.current.has(event.pointerId)) {
      touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPinchRef.current && touchPointersRef.current.size >= 2) {
        const pointers = [...touchPointersRef.current.values()].slice(-2);
        const midpoint = { x: (pointers[0].x + pointers[1].x) / 2, y: (pointers[0].y + pointers[1].y) / 2 };
        const distance = Math.max(1, Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y));
        const bounds = containerRef.current?.getBoundingClientRect();
        if (bounds) {
          event.preventDefault();
          const displayScale = getCanvasDisplayScale(containerRef.current);
          const localMidpoint = { x: (midpoint.x - bounds.left) / displayScale, y: (midpoint.y - bounds.top) / displayScale };
          const nextZoom = clamp(touchPinchRef.current.zoom * (distance / touchPinchRef.current.distance), 0.25, 2.5);
          setZoom(nextZoom);
          setPan({
            x: localMidpoint.x - touchPinchRef.current.worldPoint.x * nextZoom,
            y: localMidpoint.y - touchPinchRef.current.worldPoint.y * nextZoom
          });
        }
        return;
      }
    }
    if ((contextMenu || document.querySelector('.arc-dropdown.is-open, .canvas-context-menu')) && isPanning) {
      setIsPanning(false);
      rightPanOriginRef.current = null;
      return;
    }
    const bounds = containerRef.current?.getBoundingClientRect();
    if (bounds) {
      const displayScale = getCanvasDisplayScale(containerRef.current);
      const cursor = { x: ((event.clientX - bounds.left) / displayScale - pan.x) / zoom, y: ((event.clientY - bounds.top) / displayScale - pan.y) / zoom };
      collaborationCursorRef.current = cursor;
      if (connectingWire) onCollaborationAction?.({ kind: 'wire-drag', cursor, start: connectingWire.startPos, pinType: connectingWire.pinType, selectedNodeIds });
      else if (draggingNode) onCollaborationAction?.({ kind: 'node-drag', cursor, nodeIds: draggingNode.nodeIds || [draggingNode.id] });
      else if (draggingNote) onCollaborationAction?.({ kind: 'note-drag', cursor, noteId: draggingNote.id });
      else if (selectionStartRef.current) {
        const start = selectionStartRef.current;
        const toWorld = (x, y) => ({ x: ((x - bounds.left) / displayScale - pan.x) / zoom, y: ((y - bounds.top) / displayScale - pan.y) / zoom });
        const startWorld = toWorld(start.x, start.y);
        const currentWorld = toWorld(event.clientX, event.clientY);
        const selectionRect = {
          left: Math.min(startWorld.x, currentWorld.x), top: Math.min(startWorld.y, currentWorld.y),
          right: Math.max(startWorld.x, currentWorld.x), bottom: Math.max(startWorld.y, currentWorld.y)
        };
        const screenRect = {
          left: Math.min(start.x, event.clientX), top: Math.min(start.y, event.clientY),
          right: Math.max(start.x, event.clientX), bottom: Math.max(start.y, event.clientY)
        };
        const hitIds = [...(containerRef.current?.querySelectorAll('[data-node-card-id]') || [])].filter((card) => {
          const rect = card.getBoundingClientRect();
          return rect.right >= screenRect.left && rect.left <= screenRect.right && rect.bottom >= screenRect.top && rect.top <= screenRect.bottom;
        }).map((card) => card.dataset.nodeCardId);
        const selected = start.additive ? [...new Set([...selectedNodeIds, ...hitIds])] : hitIds;
        onCollaborationAction?.({ kind: 'selection', cursor, mode: 'select', selectedNodeIds: selected, selectionRect });
      }
      else {
        const target = event.target instanceof Element ? event.target : null;
        const isTextField = Boolean(target?.closest('input, textarea, [contenteditable="true"], .cm-content'));
        const isWire = Boolean(target?.closest('.wire-group, .wire-visible, .wire-hit-area'));
        const mode = isTextField ? 'text' : isWire ? 'cut' : isPanning ? 'pan' : 'move';
        onCollaborationAction?.({ kind: 'cursor', cursor, mode, selectedNodeIds });
      }
    }
    if (isPanning) {
      if (rightPanOriginRef.current && Math.hypot(event.clientX - rightPanOriginRef.current.x, event.clientY - rightPanOriginRef.current.y) > 4) rightPanMovedRef.current = true;
      const displayScale = getCanvasDisplayScale(containerRef.current);
      setPan({ x: event.clientX / displayScale - panStartRef.current.x, y: event.clientY / displayScale - panStartRef.current.y });
      return;
    }
    if (selectionStartRef.current) {
      setSelectionBox((current) => current ? { ...current, x2: event.clientX, y2: event.clientY } : current);
      return;
    }
    if (draggingNode) {
      const displayScale = getCanvasDisplayScale(containerRef.current);
      const deltaX = (event.clientX - draggingNode.startX) / displayScale;
      const deltaY = (event.clientY - draggingNode.startY) / displayScale;
      if (!draggingNode.historyStarted && Math.hypot(deltaX, deltaY) < 2) return;
      if (!draggingNode.historyStarted) {
        onHistoryGroupStart?.();
        setDraggingNode((current) => current ? { ...current, historyStarted: true } : current);
      }
      let x = draggingNode.initialX + deltaX / zoom;
      let y = draggingNode.initialY + deltaY / zoom;
      if (snapToGrid) {
        x = Math.round(x / GRID_SIZE) * GRID_SIZE;
        y = Math.round(y / GRID_SIZE) * GRID_SIZE;
      }
      const groupDeltaX = x - draggingNode.initialX;
      const groupDeltaY = y - draggingNode.initialY;
      const selectedIds = new Set(draggingNode.nodeIds || [draggingNode.id]);
      const initialPositions = draggingNode.initialPositions || { [draggingNode.id]: { x: draggingNode.initialX, y: draggingNode.initialY } };
      onNodesChange?.(nodes.map((node) => {
        if (!selectedIds.has(node.id)) return node;
        const initial = initialPositions[node.id] || { x: node.x, y: node.y };
        return { ...node, x: Math.round(initial.x + groupDeltaX), y: Math.round(initial.y + groupDeltaY) };
      }));
      return;
    }
    if (draggingNote) {
      const displayScale = getCanvasDisplayScale(containerRef.current);
      setDraggingNote((current) => current ? { ...current, x: Math.round(current.initialX + (event.clientX - current.startX) / displayScale / zoom), y: Math.round(current.initialY + (event.clientY - current.startY) / displayScale / zoom) } : current);
      return;
    }
    if (connectingWire && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const displayScale = getCanvasDisplayScale(containerRef.current);
      const snapTarget = settings.magneticSnap === false ? null : findClosestPin(event.clientX, event.clientY, connectingWire);
      const currentPos = snapTarget
        ? {
            x: ((snapTarget.screenPosition.x - rect.left) / displayScale - pan.x) / zoom,
            y: ((snapTarget.screenPosition.y - rect.top) / displayScale - pan.y) / zoom
          }
        : { x: ((event.clientX - rect.left) / displayScale - pan.x) / zoom, y: ((event.clientY - rect.top) / displayScale - pan.y) / zoom };
      setConnectingWire((current) => current ? ({
        ...current,
        currentPos,
        snapTarget
      }) : current);
    }
  };

  const connectPins = (start, end, replacedConnectionId = null) => {
    if (!isCompatiblePin(start, end)) return;
    const source = start.direction === 'output' ? start : end;
    const target = start.direction === 'input' ? start : end;
    const allowsExecFanIn = target.pinType === 'exec';
    const next = connections.filter((connection) => connection.id !== replacedConnectionId && (allowsExecFanIn || !(connection.targetNodeId === target.nodeId && connection.targetPinId === target.pinId)));
    next.push({
      id: `wire_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sourceNodeId: source.nodeId,
      sourcePinId: source.pinId,
      targetNodeId: target.nodeId,
      targetPinId: target.pinId,
      type: source.pinType
    });
    onConnectionsChange?.(next);
  };

  const finishPointer = (event) => {
    let finalSelectedNodeIds = selectedNodeIds;
    const finishedDraggingNode = draggingNode;
    if (!isLocked && finishedDraggingNode && (event.altKey || altDownRef.current || finishedDraggingNode.altKey)) {
      const selectedIds = [...new Set(finishedDraggingNode.nodeIds || [finishedDraggingNode.id])];
      const bounds = containerRef.current?.getBoundingClientRect();
      const displayScale = getCanvasDisplayScale(containerRef.current);
      const point = bounds ? {
        x: ((event.clientX - bounds.left) / displayScale - pan.x) / zoom,
        y: ((event.clientY - bounds.top) / displayScale - pan.y) / zoom
      } : null;
      const targetGroup = point && tagGroupLayouts
        .filter((group) => point.x >= group.left && point.x <= group.left + group.width && point.y >= group.top && point.y <= group.top + group.height)
        .sort((a, b) => a.width * a.height - b.width * b.height)[0];
      if (targetGroup) onTagGroupsChange?.(tagGroups.map((group) => group.id === targetGroup.id
        ? { ...group, nodeIds: [...new Set([...(group.nodeIds || []), ...selectedIds])] }
        : group));
    }
    const marqueeStart = selectionStartRef.current;
    if (marqueeStart) {
      const moved = selectionBox && Math.hypot(selectionBox.x2 - selectionBox.x1, selectionBox.y2 - selectionBox.y1) > 4;
      if (moved) {
        const box = { left: Math.min(selectionBox.x1, selectionBox.x2), right: Math.max(selectionBox.x1, selectionBox.x2), top: Math.min(selectionBox.y1, selectionBox.y2), bottom: Math.max(selectionBox.y1, selectionBox.y2) };
        const hitIds = [...(containerRef.current?.querySelectorAll('[data-node-card-id]') || [])].filter((card) => {
          const rect = card.getBoundingClientRect();
          return rect.right >= box.left && rect.left <= box.right && rect.bottom >= box.top && rect.top <= box.bottom;
        }).map((card) => card.dataset.nodeCardId);
        finalSelectedNodeIds = marqueeStart.additive ? [...new Set([...selectedNodeIds, ...hitIds])] : hitIds;
        selectNodes(finalSelectedNodeIds);
      } else if (!marqueeStart.additive) {
        finalSelectedNodeIds = [];
        selectNodes([]);
      }
      selectionStartRef.current = null;
      setSelectionBox(null);
    }
    setIsPanning(false);
    setDraggingNode(null);
    if (draggingNote) {
      onNotesChange?.(notes.map((note) => note.id === draggingNote.id ? { ...note, x: draggingNote.x, y: draggingNote.y, editedAt: new Date().toISOString(), editedBy: currentUser?.username || 'Unknown' } : note));
      setDraggingNote(null);
    }
    onHistoryGroupEnd?.();
    if (connectingWire) {
      const snapTarget = settings.magneticSnap === false ? null : findClosestPin(event.clientX, event.clientY, connectingWire, 30);
      const targetRow = document.elementFromPoint(event.clientX, event.clientY)?.closest('.node-pin-row');
      const target = snapTarget || pinFromRow(targetRow);
      if (isCompatiblePin(connectingWire, target)) connectPins(connectingWire, target, connectingWire.connectionId);
      else if (connectingWire.originalConnection) onConnectionsChange?.([...connections.filter((item) => item.id !== connectingWire.originalConnection.id), connectingWire.originalConnection]);
      else if (targetRow && targetRow.dataset.nodeId !== connectingWire.nodeId) shakeNode(targetRow.closest('[data-node-card-id]')?.dataset.nodeCardId);
      setConnectingWire(null);
    }
    if (finalSelectedNodeIds.length || marqueeStart) onCollaborationAction?.({ kind: 'selection', selectedNodeIds: finalSelectedNodeIds }, true);
    else onCollaborationAction?.({ kind: 'idle' }, true);
  };

  const finishCanvasPointer = (event) => {
    const wasPinching = event.pointerType === 'touch' && Boolean(touchPinchRef.current);
    if (event.pointerType === 'touch') touchPointersRef.current.delete(event.pointerId);
    if (wasPinching) {
      touchPinchRef.current = null;
      selectionStartRef.current = null;
      setSelectionBox(null);
      setIsPanning(false);
      setDraggingNode(null);
      setDraggingNote(null);
      onHistoryGroupEnd?.();
      onCollaborationAction?.({ kind: 'idle' }, true);
      return;
    }
    finishPointer(event);
  };

  const startWire = (event, nodeId, pinId, direction, pinType) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const position = getSocketPosition(nodeId, pinId, direction);
    const bounds = containerRef.current.getBoundingClientRect();
    const displayScale = getCanvasDisplayScale(containerRef.current);
    const pointer = { x: ((event.clientX - bounds.left) / displayScale - pan.x) / zoom, y: ((event.clientY - bounds.top) / displayScale - pan.y) / zoom };
    setConnectingWire({ nodeId, pinId, direction, pinType, startPos: position, currentPos: pointer, snapTarget: null });
    onCollaborationAction?.({ kind: 'wire-drag', cursor: pointer, start: position, pinType });
    if (Number.isInteger(event.pointerId)) containerRef.current?.setPointerCapture?.(event.pointerId);
  };

  const startWireFromConnection = (event, connection, direction = 'output', moveExisting = false) => {
    if (isLocked || !containerRef.current) return;
    const nodeId = direction === 'output' ? connection.sourceNodeId : connection.targetNodeId;
    const pinId = direction === 'output' ? connection.sourcePinId : connection.targetPinId;
    const node = nodeById.get(nodeId);
    const pin = direction === 'output'
      ? getNodeDefinition(node)?.outputs?.find((item) => item.id === pinId)
      : getNodeDefinition(node)?.inputs?.find((item) => item.id === pinId);
    if (!pin) return;
    const bounds = containerRef.current.getBoundingClientRect();
    const displayScale = getCanvasDisplayScale(containerRef.current);
    const pointer = { x: ((event.clientX - bounds.left) / displayScale - pan.x) / zoom, y: ((event.clientY - bounds.top) / displayScale - pan.y) / zoom };
    setConnectingWire({ nodeId, pinId, direction, pinType: pin.type, startPos: getSocketPosition(nodeId, pinId, direction), currentPos: pointer, snapTarget: null, connectionId: moveExisting ? connection.id : null, originalConnection: moveExisting ? connection : null });
    onCollaborationAction?.({ kind: 'wire-drag', cursor: pointer, start: getSocketPosition(nodeId, pinId, direction), pinType: pin.type });
    if (moveExisting) onConnectionsChange?.(connections.filter((item) => item.id !== connection.id));
  };

  const startWireFromInput = (event, nodeId, pinId) => {
    const connection = connections.find((item) => item.targetNodeId === nodeId && item.targetPinId === pinId);
    if (connection) startWireFromConnection(event, connection, 'output', true);
  };

  const cutWire = (event, connection) => {
    if (isLocked) return;
    const existingTimer = wireCutTimersRef.current.get(connection.id);
    if (existingTimer) window.clearTimeout(existingTimer);
    if (settings.reduceMotion) {
      setWireCutAnimations((current) => current.filter((item) => item.id !== connection.id));
      wireCutTimersRef.current.delete(connection.id);
      onConnectionsChange?.(connections.filter((item) => item.id !== connection.id));
      return;
    }
    const pathElement = event.currentTarget;
    const segments = getWireCutSegments(pathElement, event);
    const sourceNode = nodeById.get(connection.sourceNodeId);
    const targetNode = nodeById.get(connection.targetNodeId);
    const sourcePin = getNodeDefinition(sourceNode)?.outputs?.find((pin) => pin.id === connection.sourcePinId);
    const targetPin = getNodeDefinition(targetNode)?.inputs?.find((pin) => pin.id === connection.targetPinId);
    const pinType = sourcePin?.colorType || sourcePin?.type || targetPin?.colorType || targetPin?.type;
    setWireCutAnimations((current) => [...current.filter((item) => item.id !== connection.id), { id: connection.id, segments, color: PinColors[pinType] || '#9299a6' }]);
    const timer = window.setTimeout(() => {
      wireCutTimersRef.current.delete(connection.id);
      setWireCutAnimations((current) => current.filter((item) => item.id !== connection.id));
      onConnectionsChange?.(connections.filter((item) => item.id !== connection.id));
    }, 230);
    wireCutTimersRef.current.set(connection.id, timer);
  };

  const beginNodeDrag = (event, node) => {
    if (isLocked || event.button !== 0 || spaceDownRef.current || event.target.closest('button, input, textarea, select, [data-pin-id], .node-config')) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      const nextIds = selectedNodeIds.includes(node.id) ? selectedNodeIds.filter((id) => id !== node.id) : [...selectedNodeIds, node.id];
      selectNodes(nextIds, nextIds.includes(node.id) ? node.id : nextIds[nextIds.length - 1] || null);
      return;
    }
    let nextIds = selectedNodeIds;
    if (!selectedNodeIds.includes(node.id)) nextIds = [node.id];
    selectNodes(nextIds, node.id);
    const movingIds = nextIds.includes(node.id) ? nextIds : [node.id];
    const initialPositions = Object.fromEntries(nodes.filter((item) => movingIds.includes(item.id)).map((item) => [item.id, { x: item.x, y: item.y }]));
    setDraggingNode({ id: node.id, nodeIds: movingIds, initialPositions, startX: event.clientX, startY: event.clientY, initialX: node.x, initialY: node.y, historyStarted: false, altKey: event.altKey });
    containerRef.current?.setPointerCapture?.(event.pointerId);
  };

  const fitView = () => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds || !nodes.length) { setZoom(1); setPan({ x: 22, y: 18 }); return; }
    const displayScale = getCanvasDisplayScale(containerRef.current);
    const viewWidth = bounds.width / displayScale;
    const viewHeight = bounds.height / displayScale;
    const minX = Math.min(...nodes.map((node) => node.x));
    const minY = Math.min(...nodes.map((node) => node.y));
    const cards = new Map([...(containerRef.current?.querySelectorAll('[data-node-card-id]') || [])].map((card) => [card.dataset.nodeCardId, card]));
    const maxX = Math.max(...nodes.map((node) => node.x + (cards.get(node.id)?.getBoundingClientRect().width / displayScale / zoom || NODE_WIDTH)));
    const maxY = Math.max(...nodes.map((node) => node.y + (cards.get(node.id)?.getBoundingClientRect().height / displayScale / zoom || estimateNodeHeight(getNodeDefinition(node)))));
    const nextZoom = clamp(Math.min((viewWidth - 120) / (maxX - minX + 32), (viewHeight - 120) / (maxY - minY + 32), 1.2), 0.25, 1.2);
    setZoom(nextZoom);
    setPan({ x: (viewWidth - (maxX - minX) * nextZoom) / 2 - minX * nextZoom, y: (viewHeight - (maxY - minY) * nextZoom) / 2 - minY * nextZoom });
  };

  const focusWorldPoint = (x, y) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const scale = getCanvasDisplayScale(containerRef.current);
    setPan({ x: bounds.width / scale / 2 - x * zoom, y: bounds.height / scale / 2 - y * zoom });
  };

  const computePath = (x1, y1, x2, y2) => {
    if (wireStyle === 'straight') return `M ${x1} ${y1} L ${x2} ${y2}`;
    const curve = Math.max(Math.abs(x2 - x1) * 0.5, 52);
    return `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
  };

  const openContextMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (rightPanMovedRef.current) { rightPanMovedRef.current = false; rightPanOriginRef.current = null; return; }
    rightPanOriginRef.current = null;
    if (event.target.closest?.('.canvas-tools, .canvas-breadcrumbs')) return;
    const nodeCard = event.target.closest?.('[data-node-card-id]');
    const noteCard = event.target.closest?.('[data-note-id]');
    const tagGroupElement = event.target.closest?.('[data-tag-group-id]');
    const wireGroup = event.target.closest?.('[data-wire-id]');
    const nodeId = nodeCard?.dataset.nodeCardId || null;
    const groupId = tagGroupElement?.dataset.tagGroupId || null;
    if (nodeId && !selectedNodeIds.includes(nodeId)) selectNodes([nodeId], nodeId);
    setContextMenu({
      x: Math.max(8, event.clientX),
      y: Math.max(8, event.clientY),
      position: (() => {
        const bounds = containerRef.current.getBoundingClientRect();
        const displayScale = getCanvasDisplayScale(containerRef.current);
        return { x: Math.round(((event.clientX - bounds.left) / displayScale - pan.x) / zoom), y: Math.round(((event.clientY - bounds.top) / displayScale - pan.y) / zoom) };
      })(),
      nodeId,
      noteId: noteCard?.dataset.noteId || null,
      nodeIds: nodeId ? (selectedNodeIds.includes(nodeId) ? selectedNodeIds : [nodeId]) : selectedNodeIds,
      groupId,
      wireId: wireGroup?.dataset.wireId || null,
      node: nodeId ? nodes.find((node) => node.id === nodeId) : null
    });
  };

  const addNote = (position) => {
    if (isLocked) return;
    const now = new Date().toISOString();
    onNotesChange?.([...notes, { id: `note_${crypto.randomUUID()}`, x: position.x, y: position.y, text: '', color: '#f6d365', locked: false, createdAt: now, createdBy: currentUser?.username || 'Unknown', createdById: currentUser?.id || '', createdByRole: currentUser?.role || 'viewer', editedAt: now, editedBy: currentUser?.username || 'Unknown' }]);
    setContextMenu(null);
  };

  const updateNote = (noteId, patch) => onNotesChange?.(notes.map((note) => note.id === noteId ? { ...note, ...patch, editedAt: new Date().toISOString(), editedBy: currentUser?.username || 'Unknown' } : note));
  const userRank = { viewer: 1, operator: 2, editor: 3, admin: 4, owner: 5 };
  const mayEditNote = (note) => !note.locked || Boolean(currentUser && (
    (note.createdById && currentUser.id && note.createdById === currentUser.id)
    || (note.createdBy && currentUser.username && note.createdBy.toLocaleLowerCase() === currentUser.username.toLocaleLowerCase())
    || (userRank[String(currentUser.role || '').toLowerCase()] || 0) > (userRank[String(note.createdByRole || 'viewer').toLowerCase()] || 0)
  ));

  const gridSize = Math.max(12, GRID_SIZE * zoom);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const tagGroupLayouts = useMemo(() => tagGroups.map((group) => {
    const members = nodes.filter((node) => (group.nodeIds || []).includes(node.id));
    const noteMembers = notes.filter((note) => (group.noteIds || []).includes(note.id));
    if (!members.length && !noteMembers.length) return null;
    const cards = new Map(Array.from(containerRef.current?.querySelectorAll('[data-node-card-id]') || [], (card) => [card.dataset.nodeCardId, card]));
    const scale = getCanvasDisplayScale(containerRef.current) * zoom;
    const measuredNodes = members.map((node) => {
      const card = cards.get(node.id);
      const rect = card?.getBoundingClientRect();
      return { x: node.x, y: node.y, width: rect?.width && scale ? rect.width / scale : NODE_WIDTH, height: rect?.height && scale ? rect.height / scale : estimateNodeHeight(getNodeDefinition(node)) };
    });
    const measured = measuredNodes.length ? measuredNodes : noteMembers.map((note) => ({ x: note.x, y: note.y, width: 224, height: 156 }));
    const side = 28;
    const topPadding = 42;
    const left = Math.min(...measured.map((item) => item.x)) - side;
    const top = Math.min(...measured.map((item) => item.y)) - topPadding;
    const right = Math.max(...measured.map((item) => item.x + item.width)) + side;
    const bottom = Math.max(...measured.map((item) => item.y + item.height)) + side;
    return { ...group, left, top, width: right - left, height: bottom - top };
  }).filter(Boolean), [tagGroups, nodes, notes, zoom, wireLayoutRevision, getNodeDefinition]);
  const nearbyTagGroups = (nodeIds) => {
    const selectedNodes = nodes.filter((node) => nodeIds.includes(node.id));
    if (!selectedNodes.length) return [];
    const nearbyLimit = NODE_WIDTH * 2.5;
    return tagGroupLayouts.map((group) => {
      const distance = Math.min(...selectedNodes.map((node) => {
        const nodeHeight = estimateNodeHeight(getNodeDefinition(node));
        const dx = Math.max(group.left - (node.x + NODE_WIDTH), 0, node.x - (group.left + group.width));
        const dy = Math.max(group.top - (node.y + nodeHeight), 0, node.y - (group.top + group.height));
        return Math.hypot(dx, dy);
      }));
      return { group, distance };
    }).filter(({ distance }) => distance <= nearbyLimit)
      .sort((a, b) => a.distance - b.distance || a.group.name.localeCompare(b.group.name))
      .slice(0, 10)
      .map(({ group }) => group);
  };
  const tagGroupContainsNote = (group, note) => {
    if (!(group.noteIds || []).includes(note.id)) return false;
    const layout = tagGroupLayouts.find((item) => item.id === group.id);
    if (!layout) return false;
    const hasNodeMembers = nodes.some((node) => (group.nodeIds || []).includes(node.id));
    if (!hasNodeMembers) return true;
    const centerX = note.x + 112;
    const centerY = note.y + 78;
    return centerX >= layout.left && centerX <= layout.left + layout.width
      && centerY >= layout.top && centerY <= layout.top + layout.height;
  };
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const displayScale = getCanvasDisplayScale(container);
    const centerX = (bounds.width / displayScale / 2 - pan.x) / zoom;
    const centerY = (bounds.height / displayScale / 2 - pan.y) / zoom;
    const section = tagGroupLayouts
      .filter((group) => centerX >= group.left && centerX <= group.left + group.width && centerY >= group.top && centerY <= group.top + group.height)
      .sort((a, b) => a.width * a.height - b.width * b.height)[0];
    setViewportSectionId((current) => current === (section?.id || null) ? current : section?.id || null);
  }, [pan, zoom, tagGroupLayouts, wireLayoutRevision]);
  const connectedInputIds = useMemo(() => {
    const byNode = new Map();
    for (const connection of connections) {
      if (!byNode.has(connection.targetNodeId)) byNode.set(connection.targetNodeId, new Set());
      byNode.get(connection.targetNodeId).add(connection.targetPinId);
    }
    return byNode;
  }, [connections]);
  const { baseConnections, selectedConnections } = useMemo(() => {
    if (!selectedNodeIds.length) return { baseConnections: connections, selectedConnections: [] };
    const base = [];
    const selected = [];
    for (const connection of connections) {
      if (selectedNodeIds.includes(connection.sourceNodeId) || selectedNodeIds.includes(connection.targetNodeId)) {
        selected.push(connection);
      } else {
        base.push(connection);
      }
    }
    return { baseConnections: base, selectedConnections: selected };
  }, [connections, selectedNodeIds]);

  const renderWire = (connection, isSelectedNodeWire) => {
    const start = getSocketPosition(connection.sourceNodeId, connection.sourcePinId, 'output');
    const end = getSocketPosition(connection.targetNodeId, connection.targetPinId, 'input');
    const path = computePath(start.x, start.y, end.x, end.y);
    const sourceNode = nodeById.get(connection.sourceNodeId);
    const targetNode = nodeById.get(connection.targetNodeId);
    const previewOutput = (node, outputId, seen = new Set()) => {
      if (!node || seen.has(node.id) || seen.size > 24) return undefined;
      const nextSeen = new Set(seen).add(node.id);
      const data = node.data || {};
      if (node.type.startsWith('event_') || node.type === 'function_input' || node.type === 'function_call') return undefined;
      if (node.type === 'value_text' || node.type === 'value_number' || node.type === 'value_boolean') return data.value ?? (node.type === 'value_boolean');
      if (node.type === 'variable_get') return graphVariables.find((item) => item.id === data.variableId)?.initialValue;
      const definition = getNodeDefinition(node);
      const input = (id, fallback) => {
        const wire = connections.find((item) => item.targetNodeId === node.id && item.targetPinId === id);
        if (wire) return previewOutput(nodeById.get(wire.sourceNodeId), wire.sourcePinId, nextSeen);
        return data[id] ?? fallback;
      };
      if (node.type.startsWith('math_')) {
        const a = Number(input('a', 0)); const b = Number(input('b', 0)); const value = Number(input('value', 0));
        const operations = { math_add: a + b, math_subtract: a - b, math_multiply: a * b, math_divide: b ? a / b : 0, math_modulo: b ? a % b : 0, math_power: a ** b, math_min: Math.min(a, b), math_max: Math.max(a, b), math_abs: Math.abs(value), math_sqrt: value >= 0 ? Math.sqrt(value) : 0, math_round: Number(value.toFixed(Math.max(0, Math.min(12, Number(data.precision) || 0)))), math_floor: Math.floor(value), math_ceil: Math.ceil(value), math_sin: Math.sin(value), math_cos: Math.cos(value), math_tan: Math.tan(value), math_asin: Math.asin(value), math_acos: Math.acos(value), math_atan: Math.atan(value), math_log: value > 0 ? Math.log(value) : 0, math_log10: value > 0 ? Math.log10(value) : 0, math_exp: Math.exp(value), math_sign: Math.sign(value), math_clamp: Math.min(Number(input('max', 1)), Math.max(Number(input('min', 0)), value)), math_lerp: Number(input('a', 0)) + (Number(input('b', 1)) - Number(input('a', 0))) * Number(input('t', 0.5)), math_compare: ({ less_than: a < b, less_or_equal: a <= b, equal: a === b, not_equal: a !== b, greater_or_equal: a >= b, greater_than: a > b }[data.operation || 'less_than']) };
        if (node.type === 'math_constant') return ({ pi: Math.PI, tau: Math.PI * 2, e: Math.E, golden_ratio: (1 + Math.sqrt(5)) / 2, sqrt_two: Math.SQRT2 }[data.constant || 'pi']);
        const result = operations[node.type];
        return Number.isFinite(result) ? result : undefined;
      }
      if (node.type === 'logic_not') return !input('value', false);
      if (node.type === 'logic_and') return Boolean(input('a', false)) && Boolean(input('b', false));
      if (node.type === 'logic_or') return Boolean(input('a', false)) || Boolean(input('b', false));
      if (node.type === 'logic_xor') return Boolean(input('a', false)) !== Boolean(input('b', false));
      if (node.type === 'data_text_uppercase') return String(input('text', '')).toLocaleUpperCase();
      if (node.type === 'data_text_lowercase') return String(input('text', '')).toLocaleLowerCase();
      if (node.type === 'data_text_trim') return String(input('text', '')).trim();
      if (definition?.inputs?.some((pin) => pin.id === outputId)) return undefined;
      return undefined;
    };
    const outputValue = shiftHeld ? previewOutput(sourceNode, connection.sourcePinId) : undefined;
    let outputPreview = '';
    if (shiftHeld) {
      try { outputPreview = outputValue === undefined ? 'Preview unavailable · requires runtime data or an unsupported node' : `Value · ${typeof outputValue === 'string' ? outputValue : JSON.stringify(outputValue)}`; } catch { outputPreview = 'Preview unavailable'; }
      if (outputPreview.length > 180) outputPreview = `${outputPreview.slice(0, 177)}…`;
    }
    const sourcePin = getNodeDefinition(sourceNode)?.outputs?.find((pin) => pin.id === connection.sourcePinId);
    const targetPin = getNodeDefinition(targetNode)?.inputs?.find((pin) => pin.id === connection.targetPinId);
    const sourceType = sourcePin?.colorType || sourcePin?.type;
    const targetType = targetPin?.colorType || targetPin?.type;
    const pinColor = PinColors[sourceType || connection.type || targetType] || '#9299a6';
    const active = activePulseNodeSet.has(connection.sourceNodeId) && activePulseNodeSet.has(connection.targetNodeId);
    const fanoutKey = `${connection.sourceNodeId}:${connection.sourcePinId}`;
    const fanout = wireFanout.counts.get(fanoutKey) || 1;
    const fanoutOrder = wireFanout.orders.get(connection.id) || 0;
    const denseShades = [-13, -4, 5, -9, 2];
    const shade = fanout > 1 ? (fanoutOrder % 2 === 0 ? -12 : 5) : denseWiring ? denseShades[(wireFanout.indices.get(connection.id) || 0) % denseShades.length] : 0;
    const color = reduceWireColorNoise && !active && !isSelectedNodeWire ? '#737d8b' : shade ? shadeWireColor(pinColor, shade) : pinColor;
    return (
      <g key={connection.id} className={`wire-group ${fanout > 1 ? 'is-fanout' : ''} ${denseWiring ? 'is-dense' : ''} ${reduceWireColorNoise && !active && !isSelectedNodeWire ? 'is-muted' : ''} ${isLocked ? 'is-locked' : ''} ${isSelectedNodeWire ? 'is-connected-selected' : ''}`} data-wire-id={connection.id} style={{ '--wire-opacity': fanout > 1 ? 0.66 : denseWiring ? 0.68 : 0.84 }}>
        <path d={path} className="wire-hit-area" data-tooltip={shiftHeld ? outputPreview : undefined} aria-label={settings.doubleClickWireToCut ? 'Single-click to reroute; double-click to disconnect' : 'Single-click to disconnect; double-click to reroute'} onClick={(event) => {
          if (settings.doubleClickWireToCut) {
            startWireFromConnection(event, connection, 'output');
            return;
          }
          cutWire(event, connection);
        }} onDoubleClick={(event) => {
          if (isLocked) return;
          event.preventDefault();
          event.stopPropagation();
          if (settings.doubleClickWireToCut) {
            setConnectingWire(null);
            cutWire(event, connection);
          } else {
            const timer = wireCutTimersRef.current.get(connection.id);
            if (timer) window.clearTimeout(timer);
            wireCutTimersRef.current.delete(connection.id);
            setWireCutAnimations((current) => current.filter((item) => item.id !== connection.id));
            startWireFromConnection(event, connection, 'output');
          }
        }} />
        {!wireCutAnimations.some((item) => item.id === connection.id) && <path d={path} className={`wire-visible ${active && wirePulse ? 'wire-visible-active' : ''} ${isSelectedNodeWire ? 'wire-connected-selected' : ''}`} style={{ '--wire-color': color }} />}
      </g>
    );
  };

  return (
    <div
      ref={containerRef}
      className={`node-canvas ${isPanning ? 'is-panning' : ''} ${draggingNode ? 'is-dragging-node' : ''} ${connectingWire ? 'is-connecting-wire' : ''}`}
      data-pin-descriptions={settings.pinDescriptionsAlways || shiftHeld ? 'true' : undefined}
      onPointerDown={startPan}
      onPointerMove={movePointer}
      onClick={(event) => {
        if (event.detail !== 3 || event.target.closest?.('button, input, textarea, select, [data-node-card-id], [data-note-id], [data-wire-id]')) return;
        const bounds = containerRef.current?.getBoundingClientRect();
        if (!bounds) return;
        const displayScale = getCanvasDisplayScale(containerRef.current);
        const point = { x: ((event.clientX - bounds.left) / displayScale - pan.x) / zoom, y: ((event.clientY - bounds.top) / displayScale - pan.y) / zoom };
        const group = [...tagGroupLayouts].reverse().find((item) => point.x >= item.left && point.x <= item.left + item.width && point.y >= item.top && point.y <= item.top + item.height);
        if (group) {
          event.preventDefault();
          selectTagGroupNodes(group.id);
        }
      }}
      onPointerLeave={() => {
        if (connectingWire || draggingNode || draggingNote || isPanning || selectionStartRef.current) return;
        onCollaborationAction?.({ kind: 'navigation', label: 'Navigating menus' }, true);
      }}
      onPointerUp={finishCanvasPointer}
      onPointerCancel={() => { touchPointersRef.current.clear(); touchPinchRef.current = null; setIsPanning(false); setDraggingNode(null); setDraggingNote(null); selectionStartRef.current = null; setSelectionBox(null); rightPanOriginRef.current = null; rightPanMovedRef.current = false; cancelConnectingWire(); onCollaborationAction?.({ kind: 'idle' }, true); onHistoryGroupEnd?.(); }}
      onContextMenu={openContextMenu}
      onDragOver={updateLibraryDragPreview}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { setLibraryDragPreview(null); onCollaborationAction?.({ kind: 'idle' }, true); } }}
      onDrop={(event) => {
        const graphRaw = readTransferData(event.dataTransfer, 'application/x-arc-graph-call');
        const raw = readTransferData(event.dataTransfer, 'application/x-arc-node');
        const embedRaw = readTransferData(event.dataTransfer, 'application/x-arc-embed-asset');
        const fallback = parseLibraryTransferText(readTransferData(event.dataTransfer, 'text/plain'));
        let nodePayload = window.__arcNodeDragPayload;
        let graphPayload = window.__arcGraphDragPayload;
        let embedPayload = window.__arcEmbedDragPayload;
        if (raw) { try { nodePayload = JSON.parse(raw); } catch {} }
        if (graphRaw) { try { graphPayload = JSON.parse(graphRaw); } catch {} }
        if (embedRaw) { try { embedPayload = JSON.parse(embedRaw); } catch {} }
        const fallbackPayload = fallback && window.__arcLibraryDragPayloads?.[fallback.token]?.payload;
        if (!nodePayload && !graphPayload && !embedPayload && fallbackPayload) {
          if (fallback.mimeType === 'application/x-arc-node') nodePayload = fallbackPayload;
          else if (fallback.mimeType === 'application/x-arc-graph-call') graphPayload = fallbackPayload;
          else if (fallback.mimeType === 'application/x-arc-embed-asset') embedPayload = fallbackPayload;
        }
        setLibraryDragPreview(null);
        onCollaborationAction?.({ kind: 'idle' }, true);
        window.__arcNodeDragPayload = null;
        window.__arcGraphDragPayload = null;
        window.__arcEmbedDragPayload = null;
        if (!nodePayload && !graphPayload && !embedPayload) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = containerRef.current.getBoundingClientRect();
        const displayScale = getCanvasDisplayScale(containerRef.current);
        try {
          const position = { x: Math.round(((event.clientX - bounds.left) / displayScale - pan.x) / zoom), y: Math.round(((event.clientY - bounds.top) / displayScale - pan.y) / zoom) };
          if (embedPayload) {
            const targetId = event.target instanceof Element ? event.target.closest('[data-node-card-id]')?.getAttribute('data-node-card-id') : null;
            const target = nodes.find((node) => node.id === targetId && node.type === 'build_embed');
            if (target) {
              onNodesChange?.(nodes.map((node) => node.id === target.id ? { ...node, data: { ...node.data, blocks: structuredCloneSafe(embedPayload.blocks || []), embedName: embedPayload.name || 'Untitled embed' } } : node));
            } else {
              onNodeDrop?.(embedPayload, position);
            }
          } else {
            onNodeDrop?.(graphPayload ? { type: 'graph-call', ...graphPayload } : nodePayload, position);
          }
        } catch {}
      }}
      style={{ '--grid-size': `${gridSize}px`, '--grid-x': `${pan.x}px`, '--grid-y': `${pan.y}px` }}
    >
      <div className={`canvas-surface ${settings.showGrid === false ? 'is-grid-hidden' : ''}`} aria-hidden="true" />
      <div className="canvas-world" style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}>
        {tagGroupLayouts.map((group) => <div key={group.id} className="canvas-tag-group" aria-hidden="true" style={{ left: group.left, top: group.top, width: group.width, height: group.height, '--tag-group-color': group.color }} />)}
        {remoteActions.filter((peer) => peer.action?.kind === 'selection' && peer.action.selectionRect).map((peer) => {
          const rect = peer.action.selectionRect;
          return <div key={`remote-selection-box-${peer.userId}`} className="canvas-remote-selection-box" style={{ left: rect.left, top: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top, '--collaborator-color': peer.color }}><span>{peer.username}</span></div>;
        })}
        {/* base wires layer: under all nodes (z-index 1) */}
        <svg className="wire-layer wire-layer-base" width="20000" height="20000" aria-label="Graph connections">
          {baseConnections.map((connection) => renderWire(connection, false))}
        </svg>

        {nodes.map((node) => {
          const isSelected = selectedNodeIds.includes(node.id);
          const definition = getNodeDefinition(node);
          const remoteSelection = remoteActions.find((peer) => peer.action?.selectedNodeIds?.includes(node.id));
          const remoteOwner = remoteActions.find((peer) => peer.action?.kind === 'node-edit' && peer.action.nodeId === node.id
            || peer.action?.kind === 'node-drag' && peer.action.nodeIds?.includes(node.id)) || remoteSelection;
          return (
            <div
              className={`node-position ${shakingNodeId === node.id ? 'is-shaking' : ''} ${isSelected ? 'is-selected' : ''} ${remoteOwner ? 'is-collaborator-active' : ''} ${remoteSelection ? 'is-collaborator-selected' : ''}`}
              key={node.id}
              style={{ zIndex: isSelected ? 10 : undefined, '--collaborator-color': remoteOwner?.color }}
              onPointerDown={(event) => beginNodeDrag(event, node)}
            >
              <CanvasNode
                node={node}
                definition={definition}
                authToken={authToken}
                connectedInputIds={connectedInputIds.get(node.id) || EMPTY_PIN_SET}
                graphVariables={graphVariables}
                templateSocketSuggestions={templateSocketSuggestions}
                modalFieldOptions={modalFieldOptions}
                appEmojis={appEmojis}
                functionGraphs={functionGraphs}
                callableGraphs={callableGraphs}
                snappedPin={connectingWire?.snapTarget || null}
                selected={isSelected}
                illuminated={activePulseNodeIds.includes(node.id)}
                isLocked={isLocked}
                onSelect={(id, event) => { if (!event?.metaKey && !event?.ctrlKey && !event?.shiftKey) selectNodes([id], id); }}
                onDelete={deleteNode}
                onNodeDataChange={updateNodeData}
                onPinStartConnect={startWire}
                onPinDoubleClick={(event, nodeId, pinId) => startWireFromInput(event, nodeId, pinId)}
                onOpenVariables={onOpenVariables}
                onOpenEmbedStudio={onOpenEmbedStudio}
                onOpenTextStudio={onOpenTextStudio}
                onOpenPermissionStudio={onOpenPermissionStudio}
                onOpenSlashCommandStudio={onOpenSlashCommandStudio}
                onOpenModalStudio={onOpenModalStudio}
                onOpenFunctionGraph={onOpenFunctionGraph}
              />
            </div>
          );
        })}

        {/* selected wires layer: above other nodes, 1 below selected node )z-index: 9) */}
        <svg className="wire-layer wire-layer-selected" width="20000" height="20000" aria-label="Selected connections">
          {selectedConnections.map((connection) => renderWire(connection, true))}
          {wireCutAnimations.flatMap((animation) => animation.segments.map((segment, index) => <path key={`${animation.id}-${index}`} d={segment.d} className="wire-cut-segment" style={{ '--wire-color': animation.color, '--wire-cut-length': `${segment.length}px` }} />))}
          {connectingWire && <path
            d={connectingWire.direction === 'output'
              ? computePath(connectingWire.startPos.x, connectingWire.startPos.y, connectingWire.currentPos.x, connectingWire.currentPos.y)
              : computePath(connectingWire.currentPos.x, connectingWire.currentPos.y, connectingWire.startPos.x, connectingWire.startPos.y)}
            className={`wire-preview ${connectingWire.originalConnection ? 'wire-preview-reroute' : ''}`} style={{ '--wire-color': PinColors[connectingWire.pinType] || '#9299a6' }} />}
          {remoteActions.filter((peer) => peer.action?.kind === 'wire-drag' && peer.action.start && peer.action.cursor).map((peer) => <g key={`remote-wire-${peer.userId}`} className="collaboration-wire-preview" style={{ '--collaborator-color': peer.color }}>
            <path d={computePath(peer.action.start.x, peer.action.start.y, peer.action.cursor.x, peer.action.cursor.y)} />
            <circle cx={peer.action.cursor.x} cy={peer.action.cursor.y} r="4" />
          </g>)}
        </svg>
        {notes.map((note) => {
          const activePosition = draggingNote?.id === note.id ? { x: draggingNote.x, y: draggingNote.y } : note;
          const canEdit = mayEditNote(note) && !isLocked;
          const remoteOwner = remoteActions.find((peer) => peer.action?.kind === 'note-drag' && peer.action.noteId === note.id);
          return <article key={note.id} data-note-id={note.id} className={`canvas-note-card ${note.locked ? 'is-locked' : ''} ${remoteOwner ? 'is-collaborator-active' : ''}`} style={{ left: activePosition.x, top: activePosition.y, '--note-color': note.color || '#f6d365', '--collaborator-color': remoteOwner?.color }} onPointerDown={(event) => event.stopPropagation()} onContextMenu={(event) => { event.stopPropagation(); openContextMenu(event); }}>
            <header className="canvas-note-header" onPointerDown={(event) => {
              if (event.button !== 0 || event.target instanceof Element && event.target.closest('button') || isLocked || (note.locked && !canEdit)) return;
              event.preventDefault(); event.stopPropagation();
              setDraggingNote({ id: note.id, x: note.x, y: note.y, initialX: note.x, initialY: note.y, startX: event.clientX, startY: event.clientY });
              containerRef.current?.setPointerCapture?.(event.pointerId);
            }}>
              <span>Note</span>
              <span className="canvas-note-actions">
                <button type="button" title={note.locked ? 'Unlock note' : 'Lock note'} disabled={isLocked || (note.locked && !canEdit)} onClick={(event) => { event.stopPropagation(); updateNote(note.id, { locked: !note.locked }); }} aria-label={note.locked ? 'Unlock note' : 'Lock note'}>{note.locked ? <LockKeyhole size={12} /> : <LockOpen size={12} />}</button>
                <button type="button" title="Delete note" disabled={isLocked || (note.locked && !canEdit)} onClick={(event) => { event.stopPropagation(); onNotesChange?.(notes.filter((item) => item.id !== note.id)); }} aria-label="Delete note">×</button>
              </span>
            </header>
            <textarea aria-label="Graph note" value={note.text || ''} readOnly={!canEdit} placeholder="Add a note…" autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={4000} onChange={(event) => updateNote(note.id, { text: event.target.value })} />
            <div className="canvas-note-colors" aria-label="Note color">
              {['#f6d365', '#fca5a5', '#93c5fd', '#86efac', '#c4b5fd', '#f0abfc'].map((color) => <button key={color} type="button" aria-label={`Set note color ${color}`} title="Change note color" disabled={!canEdit} className={note.color === color ? 'is-selected' : ''} style={{ '--note-color': color }} onClick={() => updateNote(note.id, { color })} />)}
            </div>
            <footer title={`Created by ${note.createdBy || 'Unknown'} · ${new Date(note.createdAt).toLocaleString()}${note.editedBy ? ` · Edited by ${note.editedBy} · ${new Date(note.editedAt).toLocaleString()}` : ''}`}>
              <span>By {note.createdBy || 'Unknown'}</span>{note.editedAt && note.editedAt !== note.createdAt && <span>Edited {note.editedBy || ''}</span>}
            </footer>
          </article>;
        })}
        <div className="canvas-tag-group-label-layer" aria-label="Canvas sections">
          {tagGroupLayouts.map((group) => <div key={group.id} className={`canvas-tag-group-label-anchor ${zoom < 0.48 ? 'is-zoomed-out' : ''}`} data-tag-group-id={group.id} style={{ left: group.left, top: group.top, width: group.width, height: group.height, '--tag-group-color': group.color, '--tag-label-size': `${Math.max(11, 12 / zoom)}px` }}>
            <button type="button" className="canvas-tag-group-label" data-tag-group-id={group.id} title="Triple-click to select nodes in this section" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); if (event.detail === 3) selectTagGroupNodes(group.id); }}>{group.name}</button>
          </div>)}
        </div>
        <div className="canvas-collaborator-cursors" aria-hidden="true">
          {remoteActions.filter((peer) => peer.action?.cursor && peer.action.kind !== 'idle').map((peer) => <div key={`remote-cursor-${peer.userId}`} className={`canvas-collaborator-cursor is-${peer.action.mode || peer.action.kind}`} style={{ left: peer.action.cursor.x, top: peer.action.cursor.y, '--collaborator-color': peer.color }}>
            {peer.action.mode === 'text' ? <Type size={16} strokeWidth={2.4} /> : peer.action.mode === 'cut' ? <Scissors size={16} strokeWidth={2.4} /> : ['node-drag', 'note-drag', 'library-drag', 'pan'].includes(peer.action.kind) || peer.action.mode === 'pan' ? <Hand size={17} strokeWidth={2.4} /> : <MousePointer2 size={17} strokeWidth={2.4} />}
            <span>{peer.username}</span>
            {peer.action.kind === 'wire-drag' && <small>Connecting</small>}
            {peer.action.kind === 'node-drag' && <small>Moving {peer.action.nodeIds?.length > 1 ? `${peer.action.nodeIds.length} nodes` : 'node'}</small>}
            {peer.action.kind === 'note-drag' && <small>Moving note</small>}
            {peer.action.kind === 'node-edit' && <small>Editing node</small>}
            {peer.action.kind === 'library-drag' && <small>Adding {peer.action.label || 'node'}</small>}
            {peer.action.kind === 'studio-focus' && <small>Editing {peer.action.label || peer.action.studioType}</small>}
            {peer.action.kind === 'studio-draft' && <small>Editing {peer.action.studioType === 'text' ? 'text' : peer.action.studioType === 'arguments' ? 'command arguments' : 'embed'}</small>}
          </div>)}
        </div>
        {remoteActions.filter((peer) => peer.action?.kind === 'library-drag' && peer.action.cursor).map((peer) => {
          const definition = definitionsByType.get(peer.action.nodeType);
          if (!definition) return null;
          const node = { id: `remote-preview-${peer.userId}`, type: peer.action.nodeType, label: peer.action.label || definition.label, data: {}, x: 0, y: 0 };
          return <div key={`remote-library-preview-${peer.userId}`} className="node-position node-drag-preview is-remote" style={{ transform: `translate3d(${peer.action.cursor.x}px, ${peer.action.cursor.y}px, 0)`, '--collaborator-color': peer.color }} aria-hidden="true"><CanvasNode node={node} definition={definition} connectedInputIds={EMPTY_PIN_SET} graphVariables={graphVariables} functionGraphs={functionGraphs} callableGraphs={callableGraphs} appEmojis={appEmojis} /></div>;
        })}
        {libraryDragPreview && <div className="node-position node-drag-preview" style={{ transform: `translate3d(${libraryDragPreview.x}px, ${libraryDragPreview.y}px, 0)` }} aria-hidden="true">
          <CanvasNode node={libraryDragPreview.node} definition={libraryDragPreview.definition} connectedInputIds={EMPTY_PIN_SET} graphVariables={graphVariables} functionGraphs={functionGraphs} callableGraphs={callableGraphs} appEmojis={appEmojis} />
        </div>}
      </div>

      <div className="canvas-collaborator-navigation-layer" aria-live="polite">
        {remoteActions.filter((peer) => peer.action?.kind === 'navigation').map((peer) => <div key={`remote-navigation-${peer.userId}`} className="canvas-collaborator-navigation" tabIndex={0} title={`${peer.username} · ${peer.action.label || 'Navigating menus'}`} aria-label={`${peer.username}: ${peer.action.label || 'Navigating menus'}`} style={{ '--collaborator-color': peer.color }}><i /><b>{String(peer.username || '?').slice(0, 1).toUpperCase()}</b><span>{peer.username} · {peer.action.label || 'Navigating menus'}</span></div>)}
      </div>

      {selectionBox && (() => {
        const bounds = containerRef.current?.getBoundingClientRect();
        if (!bounds) return null;
        const displayScale = getCanvasDisplayScale(containerRef.current);
        return <div className="canvas-selection-box" aria-hidden="true" style={{ left: (Math.min(selectionBox.x1, selectionBox.x2) - bounds.left) / displayScale, top: (Math.min(selectionBox.y1, selectionBox.y2) - bounds.top) / displayScale, width: Math.abs(selectionBox.x2 - selectionBox.x1) / displayScale, height: Math.abs(selectionBox.y2 - selectionBox.y1) / displayScale }} />;
      })()}

      <nav className="canvas-breadcrumbs" aria-label="Graph path">
        <button className="breadcrumb-library" onClick={onOpenLibrary} aria-label="Open Library" title="Library"><FolderTree size={13} /><span>Library</span></button><span>/</span>
        <span className="breadcrumb-graph"><FileCode2 size={13} />{graphName}</span>
        {viewportSectionId && tagGroups.find((group) => group.id === viewportSectionId) && <><span>/</span><span className="breadcrumb-section"><i style={{ '--tag-group-color': tagGroups.find((group) => group.id === viewportSectionId)?.color || '#5865f2' }} />{tagGroups.find((group) => group.id === viewportSectionId)?.name}</span></>}
        {breadcrumbNode && <><span>/</span><span className="breadcrumb-node" title={breadcrumbNodeLabel} aria-label={`Selected node: ${breadcrumbNodeLabel}`}>{breadcrumbNodeLabel}</span></>}
      </nav>

      {nodes.length === 0 && <div className="canvas-empty-hint"><span className="empty-hint-glyph"><Plus size={17} /></span><span>Build a graph</span><button onClick={() => onOpenPalette?.()}>Add first node <span className="context-shortcut" aria-label="Shift plus A"><kbd>Shift</kbd><kbd>A</kbd></span></button></div>}

      <div className="canvas-tools" aria-label="Canvas controls">
        <button className="canvas-tool-button" onClick={() => setZoom((value) => clamp(value / 1.15, 0.25, 2.5))} title="Zoom out" aria-label="Zoom out"><Minus size={15} /></button>
        <button className="canvas-zoom-readout" onClick={() => { setZoom(1); setPan({ x: 22, y: 18 }); }} title="Reset zoom">{Math.round(zoom * 100)}%</button>
        <button className="canvas-tool-button" onClick={() => setZoom((value) => clamp(value * 1.15, 0.25, 2.5))} title="Zoom in" aria-label="Zoom in"><Plus size={15} /></button>
        <span className="canvas-tool-divider" />
        <button className="canvas-tool-button" onClick={fitView} title="Frame graph" aria-label="Frame graph"><Maximize size={15} /></button>
      </div>
      {!!(tagGroupLayouts.length || notes.length) && <aside className="canvas-note-timeline" aria-label="Graph sections and notes">
        <header>Sections &amp; notes</header>
        <div className="canvas-timeline-list">
          {tagGroupLayouts.map((group) => {
            const groupNotes = notes.filter((note) => tagGroupContainsNote(group, note));
            return <section className="canvas-timeline-section" key={group.id}>
              <button type="button" className="canvas-timeline-entry is-section" title={group.name} onClick={() => focusWorldPoint(group.left + group.width / 2, group.top + group.height / 2)}><i style={{ '--timeline-color': group.color || '#5865f2' }} /><span>{group.name}</span></button>
              {groupNotes.map((note) => <button key={note.id} type="button" className="canvas-timeline-entry is-note" title={`${note.createdBy || 'Unknown'} · ${note.text || 'Empty note'}`} onClick={() => focusWorldPoint(note.x + 112, note.y + 78)}><i style={{ '--timeline-color': note.color || group.color || '#f6d365' }} /><span>{String(note.text || 'Empty note').split('\n')[0].slice(0, 48) || 'Empty note'}</span></button>)}
            </section>;
          })}
          {notes.filter((note) => !tagGroupLayouts.some((group) => tagGroupContainsNote(group, note))).map((note, index) => <button key={note.id} type="button" className="canvas-timeline-entry is-note" title={`${note.createdBy || 'Unknown'} · ${note.text || 'Empty note'}`} onClick={() => focusWorldPoint(note.x + 112, note.y + 78)}><i style={{ '--timeline-color': note.color || '#f6d365' }} /><span>{String(note.text || `Note ${index + 1}`).split('\n')[0].slice(0, 48) || `Note ${index + 1}`}</span></button>)}
        </div>
      </aside>}
      {debugStep && <div className="canvas-debug-controls" role="group" aria-label="Paused graph debugging">
        <span><i />Paused · {debugStep.label || 'Node'}</span>
        <button onClick={() => onDebugAction?.('step')} title="Run the next node" aria-label="Step to next node"><StepForward size={14} />Step</button>
        <button onClick={() => onDebugAction?.('continue')} title="Continue until the next pause or completion" aria-label="Continue debug run"><FastForward size={14} />Continue</button>
      </div>}
      {contextMenu && createPortal(<div ref={contextMenuRef} className="canvas-context-menu" role="menu" style={{ left: contextMenu.x, top: contextMenu.y, transform: `scale(${uiScale})`, transformOrigin: 'top left' }} onPointerDown={(event) => event.stopPropagation()}>
        {contextMenu.noteId ? (() => {
          const note = notes.find((item) => item.id === contextMenu.noteId);
          return note ? <>
            <button role="menuitem" disabled={isLocked || (note.locked && !mayEditNote(note))} onClick={() => { onRequestCreateTagGroup?.([], [note.id]); setContextMenu(null); }}>Create color section… <span className="context-shortcut"><kbd>Shift</kbd><kbd>G</kbd></span></button>
            {tagGroups.map((group) => {
              const hasNote = (group.noteIds || []).includes(note.id);
              return <button key={group.id} role="menuitem" disabled={isLocked || (note.locked && !mayEditNote(note))} onClick={() => { onTagGroupsChange?.(tagGroups.map((item) => item.id === group.id ? { ...item, noteIds: hasNote ? (item.noteIds || []).filter((id) => id !== note.id) : [...(item.noteIds || []), note.id] } : item)); setContextMenu(null); }}>{hasNote ? 'Remove from' : 'Add to'} {group.name}</button>;
            })}
            <button role="menuitem" disabled={isLocked || (note.locked && !mayEditNote(note))} onClick={() => { onNotesChange?.(notes.filter((item) => item.id !== note.id)); setContextMenu(null); }}>Delete note</button>
          </> : null;
        })() : contextMenu.groupId ? (() => {
          const group = tagGroups.find((item) => item.id === contextMenu.groupId);
          return group ? <>
            <button role="menuitem" disabled={isLocked} onClick={() => { onRequestEditTagGroup?.(group); setContextMenu(null); }}>Edit section</button>
            <button role="menuitem" className="is-danger" disabled={isLocked} onClick={() => { onTagGroupsChange?.(tagGroups.filter((item) => item.id !== group.id)); setContextMenu(null); }}>Delete section</button>
          </> : null;
        })() : contextMenu.wireId ? <button role="menuitem" disabled={isLocked} onClick={() => { onConnectionsChange?.(connections.filter((wire) => wire.id !== contextMenu.wireId)); setContextMenu(null); }}>Disconnect wire</button> : contextMenu.nodeId ? <>
          {(() => {
            const ids = contextMenu.nodeIds?.length ? contextMenu.nodeIds : [contextMenu.nodeId];
            const connected = connections.filter((wire) => ids.includes(wire.sourceNodeId) || ids.includes(wire.targetNodeId));
            return <button role="menuitem" disabled={isLocked || !connected.length} onClick={() => { const selected = new Set(ids); onConnectionsChange?.(connections.filter((wire) => !selected.has(wire.sourceNodeId) && !selected.has(wire.targetNodeId))); setContextMenu(null); }}>Disconnect all sockets{ids.length > 1 ? ` (${connected.length})` : ''}</button>;
          })()}
          <button role="menuitem" onClick={() => { copyNodes(contextMenu.nodeIds?.length ? contextMenu.nodeIds : [contextMenu.nodeId]); setContextMenu(null); }}>Copy {contextMenu.nodeIds?.length > 1 ? `${contextMenu.nodeIds.length} nodes` : 'node'} <span className="context-shortcut"><kbd>{shortcutModifier}</kbd><kbd>C</kbd></span></button>
          <button role="menuitem" disabled={isLocked} onClick={() => { onRenameNode?.(nodes.find((node) => node.id === contextMenu.nodeId)); setContextMenu(null); }}>Rename node <span className="context-shortcut"><kbd>{shortcutModifier}</kbd><kbd>R</kbd></span><span className="context-shortcut"><kbd>F11</kbd></span></button>
          <button role="menuitem" disabled={isLocked} onClick={() => { onRequestCreateTagGroup?.(contextMenu.nodeIds); setContextMenu(null); }}>Create color section… <span className="context-shortcut"><kbd>Shift</kbd><kbd>G</kbd></span></button>
          {(() => {
            const selectedIds = (contextMenu.nodeIds?.length ? contextMenu.nodeIds : [contextMenu.nodeId]).filter((id) => nodes.some((node) => node.id === id));
            return nearbyTagGroups(selectedIds).map((group) => {
            const groupNodeIds = group.nodeIds || [];
            const removeSelected = selectedIds.length > 0 && selectedIds.every((id) => groupNodeIds.includes(id));
            const actionLabel = selectedIds.length > 1 ? `${removeSelected ? 'Remove selected from' : 'Add selected to'}` : `${removeSelected ? 'Remove from' : 'Add to'}`;
            return <button key={group.id} role="menuitem" disabled={isLocked} onClick={() => { onTagGroupsChange?.(tagGroups.map((item) => item.id === group.id ? { ...item, nodeIds: removeSelected ? groupNodeIds.filter((id) => !selectedIds.includes(id)) : [...new Set([...groupNodeIds, ...selectedIds])] } : item)); setContextMenu(null); }}>{actionLabel} {group.name}</button>;
            });
          })()}
          <button role="menuitem" disabled={isLocked} onClick={() => { onSaveNodePrefab?.(contextMenu.node); setContextMenu(null); }}>Save as node prefab</button>
          <button role="menuitem" disabled={isLocked} onClick={() => { duplicateNode(contextMenu.nodeId); setContextMenu(null); }}>Duplicate node</button>
          <button role="menuitem" className="is-danger" disabled={isLocked} onClick={() => { deleteNode(contextMenu.nodeId); setContextMenu(null); }}>Delete node <span className="context-shortcut"><kbd>Delete</kbd></span></button>
        </> : <>
          <button role="menuitem" onClick={() => { onOpenPalette?.(contextMenu.position); setContextMenu(null); }}>Add node <span className="context-shortcut" aria-label="Shift plus A"><kbd>Shift</kbd><kbd>A</kbd></span></button>
          <button role="menuitem" disabled={isLocked} onClick={() => addNote(contextMenu.position)}>Add note <span className="context-shortcut"><kbd>N</kbd></span></button>
          {nodes.length > 0 && <button role="menuitem" disabled={isLocked} onClick={() => { onRequestCreateTagGroup?.(contextMenu.nodeIds); setContextMenu(null); }}>Create color section… {contextMenu.nodeIds?.length > 0 && <span className="context-shortcut"><kbd>Shift</kbd><kbd>G</kbd></span>}</button>}
          {(() => {
            const selectedIds = (contextMenu.nodeIds || []).filter((id) => nodes.some((node) => node.id === id));
            if (!selectedIds.length) return null;
            return nearbyTagGroups(selectedIds).filter((group) => selectedIds.some((id) => (group.nodeIds || []).includes(id))).map((group) => {
              const groupNodeIds = group.nodeIds || [];
              const removeIds = selectedIds.filter((id) => groupNodeIds.includes(id));
              return <button key={`remove-selected-${group.id}`} role="menuitem" disabled={isLocked} onClick={() => { onTagGroupsChange?.(tagGroups.map((item) => item.id === group.id ? { ...item, nodeIds: groupNodeIds.filter((id) => !removeIds.includes(id)) } : item)); setContextMenu(null); }}>Remove {removeIds.length > 1 ? 'selected from' : 'from'} {group.name}</button>;
            });
          })()}
          <button role="menuitem" disabled={!clipboardRef.current || isLocked} onClick={() => { pasteNodes(); setContextMenu(null); }}>Paste {clipboardRef.current?.nodes?.length > 1 ? `${clipboardRef.current.nodes.length} nodes` : 'node'} <kbd>{shortcutModifier} V</kbd></button>
          <button role="menuitem" onClick={() => { fitView(); setContextMenu(null); }}>Frame graph <span className="context-shortcut"><kbd>F</kbd></span></button>
        </>}
      </div>, document.body)}
      <Modal
        isOpen={Boolean(deleteConfirmationIds)}
        onClose={() => setDeleteConfirmationIds(null)}
        onConfirm={() => deleteNodes(deleteConfirmationIds || [], true)}
        title="Delete selected nodes?"
        subtitle={`This will delete ${deleteConfirmationIds?.length || 0} nodes and their connections.`}
        footer={<><Button variant="secondary" onClick={() => setDeleteConfirmationIds(null)}>Cancel</Button><Button variant="danger" onClick={() => deleteNodes(deleteConfirmationIds || [], true)}>Delete nodes</Button></>}
      >
        <p className="close-graph-copy">This action cannot be undone.</p>
      </Modal>
    </div>
  );
}

function isTextTarget(target) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || Boolean(target.closest('.arc-dropdown')));
}

function shadeWireColor(hex, amount) {
  const normalized = /^#[\da-f]{6}$/i.test(hex) ? hex.slice(1) : '9299a6';
  const channels = [0, 2, 4].map((index) => Math.max(0, Math.min(255, Math.round(parseInt(normalized.slice(index, index + 2), 16) * (1 + amount / 100)))));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }

function estimateNodeHeight(definition) {
  const rows = Math.max(definition?.inputs?.length || 0, definition?.outputs?.length || 0);
  return 48 + rows * 23 + 28;
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function readTransferData(dataTransfer, type) {
  try { return dataTransfer.getData(type); } catch { return ''; }
}

function parseLibraryTransferText(value) {
  const prefix = 'arc-studio:';
  if (!String(value || '').startsWith(prefix)) return null;
  const payloadStart = value.indexOf(':', prefix.length);
  if (payloadStart < 0) return null;
  return { mimeType: value.slice(prefix.length, payloadStart), token: value.slice(payloadStart + 1) };
}

function defaultForType(type) {
  if (type === 'number') return 0;
  if (type === 'boolean') return false;
  if (type === 'object') return {};
  return '';
}
