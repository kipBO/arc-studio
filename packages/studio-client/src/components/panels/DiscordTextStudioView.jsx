import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Code2, X } from 'lucide-react';
import { countDiscordCodeBlocks, detectDiscordCodeLanguages, inferDiscordCodeLanguage } from '../ui/DiscordLongTextField.jsx';
import { TemplateSyntaxHelp } from '../ui/TemplateSyntaxHelp.jsx';
import { DiscordTextField } from '../ui/DiscordTextField.jsx';

const CODE_TOKENS = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*|#.*|--.*|\b\d+(?:\.\d+)?\b|\b(?:const|let|var|function|return|if|else|for|while|class|new|this|import|from|export|default|async|await|try|catch|throw|true|false|null|undefined|None|True|False|def|print|interface|type|extends|implements|public|private|static|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|TABLE|AS|AND|OR|NOT)\b|\b[A-Za-z_$][\w$]*(?=\s*\()|[{}()[\],.;:]|[=+*/<>!-]+)/gi;
const MARKDOWN_TOKENS = /(`[^`]*`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\|\|[^|]+\|\||\*[^*]+\*|_[^_]+_|https?:\/\/[^\s]+)/g;
const JSON_TOKENS = /"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}\[\],:]/g;
//
function highlightJson(line) {
  const tokens = [];
  let cursor = 0;
  for (const match of line.matchAll(JSON_TOKENS)) {
    const token = match[0];
    const start = match.index ?? cursor;
    if (start > cursor) tokens.push(line.slice(cursor, start));
    const type = token.startsWith('"') ? (line.slice(start + token.length).trimStart().startsWith(':') ? 'json-key' : 'string')
      : /^(?:true|false|null)$/.test(token) ? 'literal'
        : /^-?\d/.test(token) ? 'number' : 'punctuation';
    tokens.push(<span key={`${start}-${token}`} className={`syntax-${type}`}>{token}</span>);
    cursor = start + token.length;
  }
  if (cursor < line.length) tokens.push(line.slice(cursor));
  return tokens.length ? tokens : ' ';
}

function getJsonError(value) {
  try { JSON.parse(value); return ''; }
  catch (error) {
    const match = /position\s+(\d+)/i.exec(error?.message || '');
    const position = match ? Number(match[1]) : value.length;
    const before = value.slice(0, position).split('\n');
    return `Invalid JSON · line ${before.length}, column ${before.at(-1).length + 1}`;
  }
}

function highlightCode(line, language) {
  if (language === 'diff') {
    const kind = line.startsWith('+') ? 'diff-added' : line.startsWith('-') ? 'diff-removed' : line.startsWith('@@') ? 'diff-meta' : '';
    return kind ? <span className={`syntax-${kind}`}>{line || ' '}</span> : line || ' ';
  }
  const tokens = [];
  let cursor = 0;
  for (const match of line.matchAll(CODE_TOKENS)) {
    const token = match[0];
    const start = match.index ?? cursor;
    if (start > cursor) tokens.push(line.slice(cursor, start));
    let type = 'punctuation';
    if (/^(?:"|'|`)/.test(token)) type = 'string';
    else if (/^(?:\/\/|#|--)/.test(token)) type = 'comment';
    else if (/^\d/.test(token)) type = 'number';
    else if (/^(?:true|false|null|undefined|None|True|False)$/i.test(token)) type = 'literal';
    else if (/^(?:SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|TABLE|AS|AND|OR|NOT)$/i.test(token)) type = 'keyword';
    else if (/^(?:const|let|var|function|return|if|else|for|while|class|new|this|import|from|export|default|async|await|try|catch|throw|def|print|interface|type|extends|implements|public|private|static)$/.test(token)) type = 'keyword';
    else if (/^[A-Za-z_$]/.test(token) && /\($/.test(line.slice(start + token.length).match(/^\s*\(/)?.[0] || '')) type = 'function';
    tokens.push(<span key={`${start}-${token}`} className={`syntax-${type}`}>{token}</span>);
    cursor = start + token.length;
  }
  if (cursor < line.length) tokens.push(line.slice(cursor));
  return tokens.length ? tokens : ' ';
}

function highlightMarkdown(line) {
  const trimmed = line.trimStart();
  let lineClass = '';
  if (/^#{1,6}\s/.test(trimmed)) lineClass = 'syntax-heading';
  else if (/^>\s?/.test(trimmed)) lineClass = 'syntax-quote';
  else if (/^(?:[-*+]\s|\d+\.\s)/.test(trimmed)) lineClass = 'syntax-list';
  else if (/^-#\s/.test(trimmed)) lineClass = 'syntax-subtext';
  const tokens = [];
  let cursor = 0;
  for (const match of line.matchAll(MARKDOWN_TOKENS)) {
    const token = match[0];
    const start = match.index ?? cursor;
    if (start > cursor) tokens.push(line.slice(cursor, start));
    const type = token.startsWith('`') ? 'inline-code'
      : token.startsWith('**') || token.startsWith('__') ? 'strong'
        : token.startsWith('~~') ? 'strikethrough'
          : token.startsWith('||') ? 'spoiler'
            : token.startsWith('http') ? 'link' : 'emphasis';
    tokens.push(<span key={`${start}-${token}`} className={`syntax-${type}`}>{token}</span>);
    cursor = start + token.length;
  }
  if (cursor < line.length) tokens.push(line.slice(cursor));
  return <span className={lineClass}>{tokens.length ? tokens : line || ' '}</span>;
}

export function DiscordTextStudioView({ label, value = '', sharedDraft, remoteCursors = [], collaborators = [], appEmojis = [], graphVariables = [], maxLength, onApply, onClose, onDraftChange, onCursorChange }) {
  const [draft, setDraft] = useState(String(value ?? ''));
  const editorRef = useRef(null);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const beforeInputRef = useRef(null);
  const gutterRef = useRef(null);
  const codeLayerRef = useRef(null);
  const remoteCaretLayerRef = useRef(null);
  const lines = useMemo(() => draft.split('\n'), [draft]);
  const blocks = useMemo(() => countDiscordCodeBlocks(draft), [draft]);
  const characterCount = Array.from(draft).length;
  const jsonBlock = useMemo(() => /(```json[^\n]*\n)([\s\S]*?)(```)/i.exec(draft), [draft]);
  const isJson = useMemo(() => /json/i.test(label) || Boolean(jsonBlock) || /^[\s\uFEFF]*[\[{]/.test(draft), [draft, jsonBlock, label]);
  const jsonContent = jsonBlock?.[2] ?? draft;
  const jsonError = useMemo(() => isJson ? getJsonError(jsonContent) : '', [isJson, jsonContent]);
  useEffect(() => {
    if (typeof sharedDraft === 'string' && sharedDraft !== draft) {
      setDraft(sharedDraft);
      undoStackRef.current = [];
      redoStackRef.current = [];
      beforeInputRef.current = null;
    }
  }, [sharedDraft, draft]);
  const highlightedLines = useMemo(() => {
    let language = '';
    let inFence = false;
    return draft.split('\n').map((line, index, allLines) => {
      const fence = line.match(/^\s*```([^`]*)$/);
      if (fence && !inFence) {
        const explicit = fence[1].trim().split(/\s+/)[0];
        const end = allLines.findIndex((candidate, candidateIndex) => candidateIndex > index && /^\s*```\s*$/.test(candidate));
        language = explicit || inferDiscordCodeLanguage(allLines.slice(index + 1, end < 0 ? allLines.length : end).join('\n'));
        inFence = true;
        return { content: <span className="syntax-fence">{line || ' '}</span>, isCode: true };
      }
      if (inFence && /^\s*```\s*$/.test(line)) {
        inFence = false;
        return { content: <span className="syntax-fence">{line || ' '}</span>, isCode: true };
      }
      return { content: inFence ? (language === 'json' ? highlightJson(line) : highlightCode(line, language)) : (isJson ? highlightJson(line) : highlightMarkdown(line)), isCode: inFence || isJson };
    });
  }, [draft, isJson]);

  const close = () => {
    if (draft !== String(value ?? '') && !window.confirm('Discard unapplied text changes?')) return;
    onClose?.();
  };
  const apply = () => onApply?.(detectDiscordCodeLanguages(draft));

  useEffect(() => {
    const handleKeys = (event) => {
      if (event.key === 'Escape') close();
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') apply();
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [draft, onApply, onClose]);

  const syncScroll = (event) => {
    const editor = event.currentTarget;
    if (gutterRef.current) gutterRef.current.scrollTop = editor.scrollTop;
    if (codeLayerRef.current) codeLayerRef.current.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
    if (remoteCaretLayerRef.current) remoteCaretLayerRef.current.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
  };
  const changeDraft = (event) => {
    const next = event.target.value;
    const bounded = maxLength ? Array.from(next).slice(0, maxLength).join('') : next;
    if (bounded !== draft) {
      const previous = beforeInputRef.current || { text: draft, start: event.target.selectionStart, end: event.target.selectionEnd };
      undoStackRef.current.push(previous);
      if (undoStackRef.current.length > 200) undoStackRef.current.shift();
      redoStackRef.current = [];
    }
    beforeInputRef.current = null;
    setDraft(bounded);
    onDraftChange?.(bounded, event.target.selectionStart);
  };
  const captureSnapshot = () => ({
    text: draft,
    start: editorRef.current?.selectionStart ?? draft.length,
    end: editorRef.current?.selectionEnd ?? draft.length
  });
  const recordProgrammaticEdit = () => {
    undoStackRef.current.push(captureSnapshot());
    if (undoStackRef.current.length > 200) undoStackRef.current.shift();
    redoStackRef.current = [];
  };
  const restoreHistory = (direction) => {
    const source = direction === 'undo' ? undoStackRef.current : redoStackRef.current;
    const destination = direction === 'undo' ? redoStackRef.current : undoStackRef.current;
    if (!source.length) return;
    const current = captureSnapshot();
    const target = source.pop();
    destination.push(current);
    setDraft(target.text);
    onDraftChange?.(target.text, target.start);
    onCursorChange?.(target.start);
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      editor.setSelectionRange(Math.min(target.start, target.text.length), Math.min(target.end, target.text.length));
    });
  };
  const handleBeforeInput = (event) => {
    beforeInputRef.current = { text: draft, start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
  };
  const handleEditorKeyDown = (event) => {
    const command = event.metaKey || event.ctrlKey;
    if (command && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        restoreHistory('undo');
        return;
      }
      if ((key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey)) {
        event.preventDefault();
        restoreHistory('redo');
        return;
      }
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      const editor = event.currentTarget;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const next = `${draft.slice(0, start)}  ${draft.slice(end)}`;
      recordProgrammaticEdit();
      setDraft(next);
      onDraftChange?.(next, start + 2);
      onCursorChange?.(start + 2);
      requestAnimationFrame(() => { editor.selectionStart = editor.selectionEnd = start + 2; });
      return;
    }
    if (event.key !== 'Enter') return;
    const editor = event.currentTarget;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const before = draft.slice(0, start);
    const after = draft.slice(end);
    const currentLine = before.slice(before.lastIndexOf('\n') + 1);
    const indent = currentLine.match(/^\s*/)?.[0] || '';
    const opensContainer = isJson && /[\[{]\s*$/.test(before) && /^\s*[\]}]/.test(after);
    const extraIndent = isJson && /[\[{]\s*$/.test(before) ? '  ' : '';
    event.preventDefault();
    const insertion = opensContainer ? `\n${indent}  \n${indent}` : `\n${indent}${extraIndent}`;
    const next = `${before}${insertion}${after}`;
    const caret = before.length + (opensContainer ? indent.length + 3 : insertion.length);
    recordProgrammaticEdit();
    setDraft(next);
    onDraftChange?.(next, caret);
    onCursorChange?.(caret);
    requestAnimationFrame(() => { editor.selectionStart = editor.selectionEnd = caret; });
  };
  const formatJson = () => {
    try {
      const formatted = JSON.stringify(JSON.parse(jsonContent), null, 2);
      const next = jsonBlock ? draft.replace(jsonBlock[0], `${jsonBlock[1]}${formatted}${jsonBlock[3]}`) : formatted;
      if (next !== draft) recordProgrammaticEdit();
      setDraft(next);
      onDraftChange?.(next, next.length);
      onCursorChange?.(next.length);
    }
    catch { /* inline validator explains why formatting is unavailable */ }
  };

  return <section className="discord-text-studio" aria-label={`Edit ${label}`}>
    <header className="discord-text-studio-header">
      <button type="button" className="discord-text-studio-back" onClick={close}><ArrowLeft size={15} /><span>Back</span></button>
      <div className="discord-text-studio-title"><Code2 size={16} /><div><strong>Text editor</strong></div>{collaborators.length > 0 && <div className="studio-collaborators" title={collaborators.map((peer) => peer.username).join(', ')} aria-label={`Editing with ${collaborators.map((peer) => peer.username).join(', ')}`}>{collaborators.slice(0, 5).map((peer) => <span key={peer.userId} style={{ '--collaborator-color': peer.color }}>{peer.username.slice(0, 1).toUpperCase()}</span>)}</div>}</div>
      <div className="discord-text-studio-actions"><button type="button" className="discord-text-studio-apply" onClick={apply}>Apply</button><button type="button" className="discord-text-studio-close" onClick={close} aria-label="Close editor"><X size={16} /></button></div>
    </header>
    <div className="discord-text-studio-editor-shell">
      <div className="discord-text-studio-gutter" ref={gutterRef} aria-hidden="true">{lines.map((_, index) => <span key={index}>{index + 1}</span>)}</div>
      <div className="discord-text-studio-editor-viewport">
        <pre ref={codeLayerRef} className="discord-text-studio-code-layer" aria-hidden="true">{highlightedLines.map((line, index) => <span key={index} className={`discord-text-studio-line ${line.isCode ? 'is-code' : ''}`}>{line.content}</span>)}</pre>
        <div ref={remoteCaretLayerRef} className="discord-text-remote-caret-layer" aria-hidden="true">{remoteCursors.map((peer) => {
          const caret = Math.min(peer.caret, draft.length);
          const before = draft.slice(0, caret).split('\n');
          const line = before.length - 1;
          const column = before.at(-1).length;
          return <span key={peer.username} className="discord-text-remote-caret" style={{ left: 18 + column * 7.83, top: 15 + line * 22, '--collaborator-color': peer.color }}><i /><b>{peer.username}</b></span>;
        })}</div>
        <DiscordTextField as="textarea" ref={editorRef} className="discord-text-studio-editor" value={draft} onBeforeInput={handleBeforeInput} onChange={changeDraft} onKeyDown={handleEditorKeyDown} onKeyUp={(event) => onCursorChange?.(event.currentTarget.selectionStart)} onClick={(event) => onCursorChange?.(event.currentTarget.selectionStart)} onScroll={syncScroll} onPointerDown={(event) => event.stopPropagation()} spellCheck={false} autoFocus wrap="off" aria-label={`${label} text`} discordAutocomplete templateAutocomplete appEmojis={appEmojis} graphVariables={graphVariables} />
      </div>
    </div>
    <footer className="discord-text-studio-footer"><TemplateSyntaxHelp /><span>{characterCount.toLocaleString()}{maxLength ? ` / ${maxLength.toLocaleString()} characters` : ' characters'}</span><span>{jsonError ? <em className="text-editor-json-error" role="status">{jsonError}</em> : isJson ? 'Valid JSON' : `${lines.length.toLocaleString()} lines${blocks.length ? ` · ${blocks.length} code ${blocks.length === 1 ? 'block' : 'blocks'}` : ''}`}</span>{isJson && <button type="button" className="text-editor-format-json" disabled={Boolean(jsonError)} onClick={formatJson}>Format JSON</button>}</footer>
  </section>;
}
