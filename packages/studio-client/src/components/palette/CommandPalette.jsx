import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Puzzle, Search, X, Plus, Workflow } from 'lucide-react';
import { NodeTypeIcon } from '../nodes/NodeTypeIcon.jsx';

const NODE_SEARCH_ALIASES = {
  event_message_create: ['message', 'message received', 'message trigger', 'chat message'],
  event_slash_command: ['slash', 'command', 'interaction command', 'slash command'],
  event_button: ['button click', 'component interaction'],
  action_send_message: ['send', 'reply', 'create message', 'send reply'],
  action_edit_message: ['edit message', 'update message'],
  math_random: ['random', 'rand', 'random number', 'random integer', 'random float'],
  branch_if: ['if', 'condition', 'conditional', 'branch'],
  delay: ['wait', 'sleep', 'timeout'],
  repeat_while: ['loop', 'repeat', 'interval', 'retry'],
  variable_get: ['get variable', 'read variable', 'variable'],
  variable_set: ['set variable', 'write variable', 'assign variable'],
  build_embed: ['embed', 'create embed', 'embed builder'],
  data_permission_overwrites: ['permissions', 'channel permissions', 'permission overwrites'],
  function_call: ['call graph', 'subgraph', 'function'],
  action_http_request: ['http', 'fetch', 'api request', 'web request']
};
//
export function CommandPalette({ isOpen, graphs = [], definitions = [], plugins = [], onClose, onAddNode, onOpenGraph, onOpenPlugin, onGoToNode }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  const items = useMemo(() => {
    const nodeItems = definitions.filter((node) => !node.hidden).map((node) => ({
      id: `add:${node.type}`, kind: 'add', group: node.pluginAdapter ? 'Plugin nodes' : 'Nodes', label: node.label,
      detail: `${node.category || 'Node'}${node.pluginName ? ` · ${node.pluginName}` : ''}`, searchText: `${node.label} ${node.description || ''} ${node.category || ''} ${node.pluginName || ''} ${(NODE_SEARCH_ALIASES[node.type] || []).join(' ')} ${node.type.replaceAll('_', ' ')}`,
      icon: node, onSelect: () => onAddNode?.(node.type)
    }));
    const graphItems = graphs.map((graph) => ({
      id: `graph:${graph.id}`, kind: 'graph', group: 'Graphs', label: graph.name || 'Untitled graph',
      detail: graph.graphType === 'function' ? 'Function graph' : 'Open graph', searchText: `${graph.name || ''} ${graph.graphType || ''} ${graph.id}`,
      icon: null, onSelect: () => onOpenGraph?.(graph)
    }));
    const instanceItems = graphs.flatMap((graph) => (graph.nodes || []).map((node) => {
      const definition = definitions.find((item) => item.type === node.type);
      return {
        id: `node:${graph.id}:${node.id}`, kind: 'instance', group: 'Nodes in graphs', label: node.label || definition?.label || node.type,
        detail: `${graph.name || 'Untitled graph'} · ${definition?.label || node.type}`,
        searchText: `${node.label || ''} ${node.type} ${definition?.label || ''} ${definition?.description || ''} ${(NODE_SEARCH_ALIASES[node.type] || definition?.aliases || []).join(' ')} ${graph.name || ''}`,
        graphId: graph.id, nodeId: node.id, icon: definition || null, onSelect: () => onGoToNode?.(graph.id, node.id)
      };
    }));
    const pluginMap = new Map(plugins.map((plugin) => [plugin.id, {
      id: `plugin:${plugin.id}`, kind: 'plugin', group: 'Plugins', label: plugin.name || plugin.id,
      detail: 'Installed plugin', searchText: `${plugin.name || ''} ${plugin.id || ''} ${plugin.description || ''}`,
      icon: null, pluginId: plugin.id, nodeCount: 0
    }]));
    for (const node of definitions.filter((item) => item.pluginAdapter)) {
      const id = node.pluginId || node.pluginName || 'plugin';
      const entry = pluginMap.get(id) || { id: `plugin:${id}`, kind: 'plugin', group: 'Plugins', label: node.pluginName || node.pluginId || 'Installed plugin', detail: 'Installed node pack', searchText: '', icon: null, pluginId: id, nodeCount: 0 };
      entry.searchText += ` ${node.pluginName || ''} ${node.pluginId || ''} ${node.label || ''}`;
      entry.nodeCount += 1;
      pluginMap.set(id, entry);
    }
    const pluginItems = [...pluginMap.values()].map((item) => ({ ...item, detail: `${item.nodeCount} node${item.nodeCount === 1 ? '' : 's'} · installed`, onSelect: () => onOpenPlugin?.(item.pluginId) }));
    const all = [...nodeItems, ...instanceItems, ...graphItems, ...pluginItems];
    const rawQuery = query.trim();
    const command = rawQuery.match(/^([!@#])\s*/);
    const needle = rawQuery.replace(/^([!@#])\s*/, '').trim().toLowerCase();
    const commandKind = command?.[1] === '!' ? 'add' : command?.[1] === '@' ? 'instance' : command?.[1] === '#' ? 'graph' : null;
    const candidates = commandKind ? all.filter((item) => item.kind === commandKind) : all;
    if (!needle) {
      if (commandKind) return candidates.slice(0, 80);
      const suggestedNodes = nodeItems.filter((node) => ['event_message_create', 'event_slash_command', 'action_send_message', 'branch_if', 'delay'].includes(node.icon?.type)).slice(0, 5);
      const graphNodes = instanceItems.slice(0, 5);
      return [...suggestedNodes, ...graphNodes];
    }
    return candidates.filter((item) => `${item.label} ${item.detail} ${item.searchText}`.toLowerCase().includes(needle)).slice(0, 80);
  }, [definitions, graphs, onAddNode, onGoToNode, onOpenGraph, onOpenPlugin, plugins, query]);

  const groups = useMemo(() => {
    const result = [];
    for (const item of items) {
      let group = result.find((entry) => entry.label === item.group);
      if (!group) { group = { label: item.group, items: [] }; result.push(group); }
      group.items.push(item);
    }
    return result;
  }, [items]);

  useEffect(() => {
    if (!isOpen) return undefined;
    setQuery('');
    setActiveIndex(0);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(focusTimer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose?.(); }
      if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((value) => Math.min(value + 1, items.length - 1)); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((value) => Math.max(value - 1, 0)); }
      if (event.key === 'Enter' && items[activeIndex]) { event.preventDefault(); items[activeIndex].onSelect?.(); onClose?.(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, isOpen, items, onClose]);

  useEffect(() => setActiveIndex(0), [query]);
  if (!isOpen) return null;

  let index = -1;
  return <div className="dialog-scrim command-palette-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
    <section className="command-palette" role="dialog" aria-modal="true" aria-label="Search ARC Studio">
      <div className="command-palette-search"><Search size={17} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search… · ! nodes · @ nodes in graphs · # graphs" aria-label="Search graphs, nodes, and plugins. Use exclamation mark for nodes, at sign for nodes in graphs, or number sign for graphs." /><kbd>⌘ K</kbd><button type="button" onClick={onClose} aria-label="Close search"><X size={15} /></button></div>
      <div className="command-palette-results" role="listbox">
        {groups.map((group) => <div className="command-palette-group" key={group.label}>
          <div className="command-palette-heading">{group.label}</div>
          {group.items.map((item) => {
            index += 1;
            const itemIndex = index;
            return <button key={item.id} type="button" role="option" aria-selected={activeIndex === itemIndex} className={`command-palette-result ${activeIndex === itemIndex ? 'is-active' : ''}`} onMouseEnter={() => setActiveIndex(itemIndex)} onClick={() => { item.onSelect?.(); onClose?.(); }}>
              <span className={`command-palette-item-icon ${item.kind === 'add' ? 'is-node' : ''}`}>
                {item.icon ? <NodeTypeIcon type={item.icon.type} color={item.icon.color} size={15} /> : item.kind === 'plugin' ? <Puzzle size={15} /> : <Workflow size={15} />}
              </span>
              <span className="command-palette-copy"><strong>{item.label}</strong><small>{item.detail}</small></span>
              <span className="command-palette-action" title={item.kind === 'add' ? 'Add node' : item.kind === 'instance' ? 'Go to node' : item.kind === 'graph' ? 'Open graph' : 'Open plugin store'} aria-label={item.kind === 'add' ? 'Add node' : 'Go to'}>
                {item.kind === 'add' ? <Plus size={15} /> : <ArrowRight size={15} />}
              </span>
            </button>;
          })}
        </div>)}
        {!items.length && <div className="command-palette-empty">No matching graphs, nodes, or plugins.</div>}
      </div>
      <footer className="command-palette-footer"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Open or add</span><span><kbd>esc</kbd> Close</span></footer>
    </section>
  </div>;
}
