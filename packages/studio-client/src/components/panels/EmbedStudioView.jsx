import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, ExternalLink, MessageSquare, Layers, Save, Bot, Moon, Sun, Upload } from 'lucide-react';
import { EmbedNodeBuilder, getEmbedBlocks } from '../nodes/EmbedNodeBuilder.jsx';
import { CharacterLimit } from '../ui/Inputs.jsx';
import { MessageComponentsBuilder, toDiscordComponents } from './MessageComponentsBuilder.jsx';
import { TemplateSyntaxHelp } from '../ui/TemplateSyntaxHelp.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { useStudioEscape } from './useStudioEscape.js';

const EMPTY_ATTACHMENTS = [];
//
export function renderDiscordFormattedText(text) {
  if (!text) return null;
  const str = String(text);
  const renderMarkdown = (value, key = 'md') => {
    const tokenPattern = /(\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\|\|[^|\n]+\|\||`[^`\n]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*(?!\s)[^*\n]+\*(?!\*)|_(?!\s)[^_\n]+_(?!_))/g;
    const nodes = [];
    let cursor = 0;
    let token;
    while ((token = tokenPattern.exec(value)) !== null) {
      if (token.index > cursor) nodes.push(value.slice(cursor, token.index));
      const raw = token[0];
      const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(raw);
      if (link) {
        if (value[token.index - 1] === '!') {
          nodes.push(raw);
          cursor = tokenPattern.lastIndex;
          continue;
        }
        let href = '';
        try { const parsed = new URL(link[2]); if (['http:', 'https:'].includes(parsed.protocol)) href = parsed.href; } catch { /* Leave malformed links as text. */ }
        nodes.push(href ? <a key={`${key}_${token.index}`} href={href} target="_blank" rel="noreferrer">{link[1]}</a> : raw);
        cursor = tokenPattern.lastIndex;
        continue;
      }
      const inner = raw.startsWith('**') || raw.startsWith('__') || raw.startsWith('~~') || raw.startsWith('||') ? raw.slice(2, -2) : raw.slice(1, -1);
      const child = raw.startsWith('**') ? <strong key={`${key}_${token.index}`}>{renderMarkdown(inner, `${key}_${token.index}`)}</strong>
        : raw.startsWith('__') ? <u key={`${key}_${token.index}`}>{renderMarkdown(inner, `${key}_${token.index}`)}</u>
          : raw.startsWith('~~') ? <s key={`${key}_${token.index}`}>{renderMarkdown(inner, `${key}_${token.index}`)}</s>
            : raw.startsWith('||') ? <span className="discord-spoiler" key={`${key}_${token.index}`}>{renderMarkdown(inner, `${key}_${token.index}`)}</span>
              : raw.startsWith('`') ? <code key={`${key}_${token.index}`}>{inner}</code>
                : raw.startsWith('*') ? <em key={`${key}_${token.index}`}>{renderMarkdown(inner, `${key}_${token.index}`)}</em>
                  : <em key={`${key}_${token.index}`}>{renderMarkdown(inner, `${key}_${token.index}`)}</em>;
      nodes.push(child);
      cursor = tokenPattern.lastIndex;
    }
    if (cursor < value.length) nodes.push(value.slice(cursor));
    return nodes;
  };
  const renderLines = (value, key = 'line') => value.split('\n').map((line, index) => {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const subtext = /^-#\s+(.+)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    const content = heading?.[2] || subtext?.[1] || quote?.[1] || line;
    const formatted = renderMarkdown(content, `${key}_${index}`);
    if (heading) return <React.Fragment key={`${key}_${index}`}><strong className={`discord-markdown-heading level-${heading[1].length}`}>{formatted}</strong>{index < value.split('\n').length - 1 ? '\n' : ''}</React.Fragment>;
    if (subtext) return <React.Fragment key={`${key}_${index}`}><small className="discord-markdown-subtext">{formatted}</small>{index < value.split('\n').length - 1 ? '\n' : ''}</React.Fragment>;
    if (quote) return <React.Fragment key={`${key}_${index}`}><span className="discord-markdown-quote">{formatted}</span>{index < value.split('\n').length - 1 ? '\n' : ''}</React.Fragment>;
    return <React.Fragment key={`${key}_${index}`}>{formatted}{index < value.split('\n').length - 1 ? '\n' : ''}</React.Fragment>;
  });
  const customEmojiRegex = /<(a?):([a-zA-Z0-9_]+):([0-9]+)>/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = customEmojiRegex.exec(str)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...renderLines(str.slice(lastIndex, match.index), `text_${match.index}`));
    }
    const isAnimated = match[1] === 'a';
    const name = match[2];
    const id = match[3];
    const ext = isAnimated ? 'gif' : 'webp';
    const url = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=48&quality=lossless`;

    parts.push(
      <img
        key={`emoji_${id}_${match.index}`}
        className="discord-custom-emoji"
        src={url}
        alt={`:${name}:`}
        title={`:${name}:`}
      />
    );
    lastIndex = customEmojiRegex.lastIndex;
  }

  if (lastIndex < str.length) {
    parts.push(...renderLines(str.slice(lastIndex), 'text_tail'));
  }

  return parts;
}
//
export function EmbedStudioView({
  name,
  content = '',
  blocks = [],
  wiredFields = {},
  attachments = EMPTY_ATTACHMENTS,
  components = [],
  componentsOnly = false,
  isContentWired = false,
  isEmbedWired = false,
  isComponentsWired = false,
  contentSourceLabel = '',
  embedSourceLabel = '',
  componentsSourceLabel = '',
  appEmojis = [],
  graphVariables = [],
  templateSuggestions = [],
  botProfile = null,
  botStatus = 'DISCONNECTED',
  theme = 'dark',
  collaborators = [],
  onNameChange,
  onContentChange,
  onBlocksChange,
  onAttachmentsChange,
  onOpenTextStudio,
  onComponentsChange,
  onSave,
  onSaveAs,
  onClose,
  saveLabel = 'Save embed',
  saveAsLabel = 'Save to library',
  showSaveAs = true,
  showSave = true
}) {
  const [activeTab, setActiveTab] = useState(componentsOnly ? 'components' : 'embed');
  const [selectedComponentId, setSelectedComponentId] = useState(null);
  const [expandedSelectMenuId, setExpandedSelectMenuId] = useState(null);
  const [selectedMenuValues, setSelectedMenuValues] = useState({});
  const [previewTheme, setPreviewTheme] = useState(() => (theme === 'light' ? 'light' : 'dark'));
  const [attachedFiles, setAttachedFiles] = useState(attachments);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [thumbnailContextMenu, setThumbnailContextMenu] = useState(null);
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState('');
  const [failedImageUrl, setFailedImageUrl] = useState('');
  const [discardPromptOpen, setDiscardPromptOpen] = useState(false);
  const initialDraftRef = React.useRef(JSON.stringify({ name, content, blocks, components, attachments }));
  const closeStudio = () => {
    const currentDraft = JSON.stringify({ name, content, blocks, components, attachments: attachedFiles });
    if (currentDraft !== initialDraftRef.current) { setDiscardPromptOpen(true); return; }
    onClose?.();
  };
  useStudioEscape(closeStudio);

  useEffect(() => {
    setPreviewTheme(theme === 'light' ? 'light' : 'dark');
  }, [theme]);

  useEffect(() => { setAttachedFiles(attachments || []); }, [attachments]);

  useEffect(() => {
    if (!thumbnailContextMenu) return undefined;
    const close = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && event.target instanceof Element && event.target.closest('.embed-thumbnail-context-menu')) return;
      setThumbnailContextMenu(null);
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', close, true);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', close, true);
    };
  }, [thumbnailContextMenu]);

  const isBotConnected = botStatus === 'ONLINE' || Boolean(botProfile?.username);
  const botDisplayName = isBotConnected
    ? (botProfile?.application?.name || botProfile?.username || 'Bot')
    : 'Arc Studio';
  const botAvatarUrl = isBotConnected && botProfile?.id && botProfile?.avatar
    ? `https://cdn.discordapp.com/avatars/${botProfile.id}/${botProfile.avatar}.png?size=128`
    : '/arc.png';

  const items = getEmbedBlocks({ blocks });
  const wireFor = (block, key) => wiredFields?.[`block_${block?.id}_${key}`] || null;
  const previewItems = items.map((block) => {
    const preview = { ...block };
    const keys = block.type === 'title' || block.type === 'description' || block.type === 'color' || block.type === 'timestamp' ? ['value']
      : block.type === 'field' ? ['name', 'value']
        : block.type === 'author' ? ['name', 'url', 'icon']
          : block.type === 'footer' ? ['text', 'icon']
            : ['image', 'thumbnail', 'url'].includes(block.type) ? ['url'] : [];
    for (const key of keys) {
      const wire = wireFor(block, key);
      if (wire) preview[key] = wire.token;
    }
    if (block.type === 'timestamp' && wireFor(block, 'value')) preview.now = false;
    return preview;
  });
  const title = previewItems.find((block) => block.type === 'title')?.value;
  const description = previewItems.find((block) => block.type === 'description')?.value;
  const author = previewItems.find((block) => block.type === 'author');
  const footer = previewItems.find((block) => block.type === 'footer');
  const timestampBlock = footer ? previewItems.find((block) => block.type === 'timestamp') : null;
  const timestampWire = timestampBlock && wireFor(timestampBlock, 'value');
  const timestamp = timestampWire ? '' : timestampBlock?.now ? new Date().toISOString() : timestampBlock?.value;
  const timestampLabel = timestampWire?.token || (timestamp && !Number.isNaN(new Date(timestamp).getTime())
    ? new Date(timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : '');
  const imageBlock = previewItems.find((block) => block.type === 'image');
  const thumbnailBlock = previewItems.find((block) => block.type === 'thumbnail');
  const imageWire = imageBlock && wireFor(imageBlock, 'url');
  const thumbnailWire = thumbnailBlock && wireFor(thumbnailBlock, 'url');
  const image = imageWire ? '' : imageBlock?.url;
  const thumbnail = thumbnailWire ? '' : thumbnailBlock?.url;
  const colorBlock = previewItems.find((block) => block.type === 'color');
  const colorWire = colorBlock && wireFor(colorBlock, 'value');
  const color = colorWire ? (items.find((block) => block.type === 'color')?.value || '#5865F2') : colorBlock ? (colorBlock.value || '') : '#5865F2';
  useEffect(() => { setFailedThumbnailUrl(''); }, [thumbnail]);
  useEffect(() => { setFailedImageUrl(''); }, [image]);
  const fields = previewItems.filter((block) => block.type === 'field' && (block.name || block.value));
  
  const textCount = items.reduce((total, block) => {
    if (block.type === 'title' || block.type === 'description') return total + String(block.value || '').length;
    if (block.type === 'field') return total + String(block.name || '').length + String(block.value || '').length;
    if (block.type === 'author') return total + String(block.name || '').length;
    if (block.type === 'footer') return total + String(block.text || '').length;
    return total;
  }, 0);

  const validation = {};
  const setError = (block, key, message) => {
    validation[block.id] = { ...validation[block.id], [key]: message };
  };

  const validUrl = (value, allowAttachment = false) => {
    const normalized = String(value || '').trim();
    if (!normalized) return true;
    if (allowAttachment && /^attachment:\/\/[^?#\r\n]{1,100}$/.test(normalized)) return true;
    try {
      return ['http:', 'https:'].includes(new URL(normalized).protocol);
    } catch {
      return false;
    }
  };

  for (const block of items) {
    if (block.type === 'field' && (block.name || block.value)) {
      if (!block.name) setError(block, 'name', 'Field name is required.');
      if (!block.value) setError(block, 'value', 'Field value is required.');
    }
    for (const key of ['url', 'icon']) {
      if (block[key] && ['url', 'image', 'thumbnail', 'author', 'footer'].includes(block.type) && !validUrl(block[key], ['image', 'thumbnail'].includes(block.type))) {
        setError(block, key, 'Enter an HTTP or HTTPS URL. For attached images, use attachment://filename.');
      }
    }
  }

  const componentErrors = [];
  const selectTypes = new Set(['string_select', 'user_select', 'role_select', 'mentionable_select', 'channel_select']);
  const customIds = new Set();

  if (components.length > 5) componentErrors.push('Discord messages support up to 5 action rows.');

  components.slice(0, 5).forEach((row, rowIndex) => {
    const rowItems = Array.isArray(row.components) ? row.components : [];
    if (rowItems.length > 5) componentErrors.push(`Action row ${rowIndex + 1} supports up to 5 components.`);
    const select = rowItems.find((item) => selectTypes.has(item.type));
    if (select && (rowItems.length !== 1 || (rowItems.length && rowItems[0] !== select))) {
      componentErrors.push(`Action row ${rowIndex + 1}: a select menu must be the only component in its row.`);
    }

    rowItems.forEach((component, componentIndex) => {
      const label = `Row ${rowIndex + 1}, component ${componentIndex + 1}`;
      if (selectTypes.has(component.type)) {
        if (!String(component.customId || '').trim()) componentErrors.push(`${label}: enter a custom ID for the select menu.`);
        if (component.type === 'string_select') {
          if (!component.options?.length || component.options.length > 25) componentErrors.push(`${label}: add between 1 and 25 options.`);
          if (component.options?.some((option) => !String(option.label || '').trim() || !String(option.value || '').trim())) {
            componentErrors.push(`${label}: every option needs a label and value.`);
          }
          if (new Set((component.options || []).map((option) => option.value)).size !== (component.options || []).length) {
            componentErrors.push(`${label}: option values must be unique.`);
          }
          if ((component.options || []).length && Number(component.maxValues) > component.options.length) {
            componentErrors.push(`${label}: maximum selections cannot exceed the number of options.`);
          }
        }
        if (Number(component.minValues) > Number(component.maxValues)) {
          componentErrors.push(`${label}: minimum selections cannot exceed maximum selections.`);
        }
        const customId = String(component.customId || '').trim();
        if (customId && customIds.has(customId)) componentErrors.push(`${label}: custom IDs must be unique in the message.`);
        if (customId) customIds.add(customId);
      } else if (component.style === 'link') {
        if (!String(component.label || '').trim()) componentErrors.push(`${label}: enter a button label.`);
        if (!String(component.url || '').trim() || !validUrl(component.url)) componentErrors.push(`${label}: enter a valid HTTP or HTTPS URL.`);
      } else {
        if (!String(component.label || '').trim()) componentErrors.push(`${label}: enter a button label.`);
        const customId = String(component.customId || '').trim();
        if (!customId) componentErrors.push(`${label}: enter a custom ID for the button.`);
        if (customId && customIds.has(customId)) componentErrors.push(`${label}: custom IDs must be unique in the message.`);
        if (customId) customIds.add(customId);
      }
    });
  });

  const hasValidationErrors = textCount > 6000 || Object.keys(validation).length > 0 || componentErrors.length > 0;
  const saveDisabledTitle = hasValidationErrors ? 'Fix the highlighted issues before saving.' : undefined;

  const safePreviewUrl = (value) => {
    const normalized = String(value || '').trim();
    if (!validUrl(normalized)) return '';
    try { return new URL(normalized).href; } catch { return ''; }
  };
  const attachmentName = (value) => /^attachment:\/\/(.+)$/.exec(String(value || ''))?.[1] || '';
  const attachedImage = attachmentName(image);
  const attachedThumbnail = attachmentName(thumbnail);
  const titleUrlBlock = previewItems.find((block) => block.type === 'url');
  const titleUrlWire = titleUrlBlock && wireFor(titleUrlBlock, 'url');
  const titleLink = safePreviewUrl(titleUrlBlock?.url);
  const authorLink = safePreviewUrl(author?.url);
  const authorUrlWire = author && wireFor(author, 'url');
  const authorIconWire = author && wireFor(author, 'icon');
  const footerIconWire = footer && wireFor(footer, 'icon');

  const hasEmbedContent = Boolean(
    title || description || fields.length || author?.name || footer?.text || timestampLabel ||
    safePreviewUrl(image) || safePreviewUrl(thumbnail) || attachedImage || attachedThumbnail || Object.keys(wiredFields || {}).length > 0
  );

  const focusEditorBlock = (blockType) => {
    setActiveTab('embed');
    setTimeout(() => {
      const el = document.getElementById(`embed_block_${blockType}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const focusComponent = (componentId) => {
    setActiveTab('components');
    setSelectedComponentId(componentId);
  };

  const addImageAttachment = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return window.alert('Choose an image file.');
    if (file.size > 8 * 1024 * 1024) return window.alert('Images must be 8 MB or smaller.');
    setUploadingImage(true);
    const reader = new FileReader();
    reader.onload = () => {
      const filename = file.name.replace(/[\\/\0-\x1f]/g, '_').slice(0, 100) || 'image.png';
      const attachment = { filename, contentType: file.type, data: String(reader.result), description: '' };
      const nextAttachments = [...attachedFiles.filter((item) => item.filename !== filename), attachment];
      setAttachedFiles(nextAttachments);
      onAttachmentsChange?.(nextAttachments);
      const imageBlock = blocks.find((item) => item.type === 'image');
      onBlocksChange?.(imageBlock
        ? blocks.map((item) => item.id === imageBlock.id ? { ...item, url: `attachment://${filename}` } : item)
        : [...blocks, { id: `image_${Date.now()}`, type: 'image', url: `attachment://${filename}` }]);
      setUploadingImage(false);
    };
    reader.onerror = () => { setUploadingImage(false); window.alert('Could not read this image file.'); };
    reader.readAsDataURL(file);
  };

  return (
    <>
    <section className="embed-studio" aria-label="Embed Studio">
      <header className="embed-studio-header">
        <button className="embed-studio-back" onClick={closeStudio} title="Return to node graph">
          <ArrowLeft size={15} />
          <span>Back to graph</span>
        </button>

        <div className="embed-studio-title">
          <span>{componentsOnly ? 'Message Components' : 'Embed Studio'}</span>
          {!componentsOnly && (
            <>
              <i>/</i>
              <CharacterLimit className="is-inline" value={name} maxLength={64}>
                <input
                  value={name}
                  onChange={(event) => onNameChange?.(event.target.value)}
                  maxLength={64}
                  aria-label="Embed name"
                  placeholder="Untitled embed"
                />
              </CharacterLimit>
            </>
          )}
        </div>

        {collaborators.length > 0 && <div className="studio-collaborators" title={collaborators.map((peer) => peer.username).join(', ')} aria-label={`Editing with ${collaborators.map((peer) => peer.username).join(', ')}`}>
          {collaborators.slice(0, 5).map((peer) => <span key={peer.userId} style={{ '--collaborator-color': peer.color }}>{peer.username.slice(0, 1).toUpperCase()}</span>)}
        </div>}

        <div className="embed-studio-actions">
          {showSaveAs && !componentsOnly && (
            <button
              className={`embed-studio-secondary ${!showSave ? 'is-primary' : ''}`}
              onClick={onSaveAs}
              disabled={hasValidationErrors}
              title={saveDisabledTitle}
            >
              <Save size={14} />
              <span>{saveAsLabel}</span>
            </button>
          )}
          {showSave && (
            <button
              className="embed-studio-save"
              onClick={onSave}
              disabled={hasValidationErrors}
              title={saveDisabledTitle}
            >
              <Check size={15} />
              <span>{saveLabel}</span>
            </button>
          )}
        </div>
      </header>

      <div className="embed-studio-body">
        <div className="embed-studio-editor">
          {(!componentsOnly || blocks.length > 0) && (
            <div className="embed-studio-nav-header">
              <div className="embed-studio-tabs" role="tablist" aria-label="Message sections">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'components'}
                  className={`embed-tab-btn ${activeTab === 'components' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('components')}
                >
                  <MessageSquare size={13} />
                  <span>Components</span>
                  <span className="embed-tab-badge">{components.length} rows</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'embed'}
                  className={`embed-tab-btn ${activeTab === 'embed' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('embed')}
                >
                  <Layers size={13} />
                  <span>Embed Content</span>
                  <span className={`embed-tab-count ${textCount > 6000 ? 'is-over-limit' : ''}`}>
                    {textCount.toLocaleString()} / 6,000
                  </span>
                </button>
              </div>
              {!componentsOnly && <label className="embed-studio-upload"><Upload size={13} />{uploadingImage ? 'Adding image…' : 'Choose image'}<input type="file" accept="image/*" disabled={uploadingImage} onChange={(event) => { addImageAttachment(event.target.files?.[0]); event.target.value = ''; }} /></label>}
            </div>
          )}


          {activeTab === 'components' && isComponentsWired && (
            <div className="embed-wired-notice">
              <Layers size={14} />
              <span>Supplied by {componentsSourceLabel || 'a connected node'}. Edit that source node on the canvas.</span>
            </div>
          )}
          {activeTab === 'components' && isContentWired && (
            <div className="embed-wired-notice">
              <Layers size={14} />
              <span>Message content comes from {contentSourceLabel || 'a connected node'}; edit that source node on the canvas.</span>
            </div>
          )}
          {activeTab === 'embed' && isEmbedWired && (
            <div className="embed-wired-notice">
              <Layers size={14} />
              <span>Supplied by {embedSourceLabel || 'a connected node'}. Edit that source node on the canvas.</span>
            </div>
          )}

          <div className="embed-studio-editor-content" style={((activeTab === 'components' && isComponentsWired) || (activeTab === 'embed' && isEmbedWired)) ? { opacity: 0.5, pointerEvents: 'none', userSelect: 'none' } : undefined}>
            {activeTab === 'embed' ? (
              <EmbedNodeBuilder
                mode="studio"
                data={{ blocks: items }}
                wiredFields={wiredFields}
                appEmojis={appEmojis}
                graphVariables={graphVariables}
                templateSuggestions={templateSuggestions}
                onChange={onBlocksChange}
                onOpenTextStudio={onOpenTextStudio}
                validation={validation}
              />
            ) : (
              <MessageComponentsBuilder
                rows={components}
                messageContent={content}
                onMessageContentChange={onContentChange}
                isContentWired={isContentWired}
                appEmojis={appEmojis}
                graphVariables={graphVariables}
                onChange={onComponentsChange}
                selectedComponentId={selectedComponentId}
                onSelectComponent={setSelectedComponentId}
              />
            )}
          </div>

          {componentErrors.length > 0 && (
            <div className="embed-studio-validation-banner" role="alert">
              <span className="validation-banner-title">Component Warning:</span>
              <span>{componentErrors[0]}</span>
              {componentErrors.length > 1 && <small> (+{componentErrors.length - 1} more)</small>}
            </div>
          )}

          {Object.keys(validation).length > 0 && (
            <div className="embed-studio-validation-banner">
              <span>Please review and fix the highlighted fields in your embed blocks.</span>
            </div>
          )}
          <div className="embed-studio-help-footer"><TemplateSyntaxHelp /></div>
        </div>

        <aside className={`embed-studio-preview ${previewTheme === 'light' ? 'is-discord-light' : ''}`} aria-label="Live Discord Message Preview">
          <div className="embed-studio-preview-heading">
            <div className="preview-heading-title">
              <span>PREVIEW</span>
            </div>
            <div className="preview-heading-controls">
              <div className="preview-theme-toggle" role="group" aria-label="Preview theme">
                <button
                  type="button"
                  className={`preview-theme-btn ${previewTheme === 'dark' ? 'is-active' : ''}`}
                  onClick={() => setPreviewTheme('dark')}
                  title="Dark mode preview"
                >
                  <Moon size={11} />
                  <span>Dark</span>
                </button>
                <button
                  type="button"
                  className={`preview-theme-btn ${previewTheme === 'light' ? 'is-active' : ''}`}
                  onClick={() => setPreviewTheme('light')}
                  title="Light mode preview"
                >
                  <Sun size={11} />
                  <span>Light</span>
                </button>
              </div>
            </div>
          </div>

          <div className="discord-chat-viewport">
            <div className="discord-message">
              {/* Bot Avatar */}
              <div className="discord-avatar" aria-hidden="true">
                <img
                  src={botAvatarUrl}
                  alt={botDisplayName}
                  className="discord-avatar-img"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = '/arc.png';
                  }}
                />
              </div>

              <div className="discord-message-body">
                <div className="discord-message-header">
                  <span className="discord-username">{botDisplayName}</span>
                  <span className="discord-bot-tag">APP</span>
                  <span className="discord-timestamp">Today at 4:20 PM</span>
                </div>

                {content ? (
                  <div className="discord-message-content">
                    {renderDiscordFormattedText(content)}
                  </div>
                ) : null}

                {hasEmbedContent ? (
                  <div
                    className="embed-preview-card"
                    style={{ '--embed-preview-accent': color || 'transparent' }}
                  >
                    {colorWire && <div className="embed-preview-wire-note">Accent color: <code>{colorWire.token}</code></div>}
                    <div className="embed-preview-content">
                      <div className="embed-preview-main">
                        {/* Author */}
                        {(author?.name || authorUrlWire || authorIconWire) && (
                          <div
                            className="embed-preview-author is-interactive"
                            onClick={() => focusEditorBlock('author')}
                            title="Click to edit author"
                          >
                            {!authorIconWire && safePreviewUrl(author.icon) && (
                              <img src={author.icon} alt="" className="embed-preview-author-icon" />
                            )}
                            {authorLink ? (
                              <a href={authorLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                                {renderDiscordFormattedText(author.name)}
                              </a>
                            ) : (
                              <span>{renderDiscordFormattedText(author.name)}</span>
                            )}
                            {authorIconWire && <code className="embed-preview-wire-label">{authorIconWire.token}</code>}
                            {authorUrlWire && <code className="embed-preview-wire-label">{authorUrlWire.token}</code>}
                          </div>
                        )}

                        {title && (
                          <div
                            className="embed-preview-title-wrapper is-interactive"
                            onClick={() => focusEditorBlock('title')}
                            title="Click to edit title"
                          >
                            {titleLink ? (
                              <a className="embed-preview-title" href={titleLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                                {renderDiscordFormattedText(title)}
                              </a>
                            ) : (
                              <strong className="embed-preview-title">{renderDiscordFormattedText(title)}</strong>
                            )}
                          </div>
                        )}
                        {titleUrlWire && <code className="embed-preview-wire-label is-block">Title URL: {titleUrlWire.token}</code>}

                        {description && (
                          <div
                            className="embed-preview-description is-interactive"
                            onClick={() => focusEditorBlock('description')}
                            title="Click to edit description"
                          >
                            <p>{renderDiscordFormattedText(description)}</p>
                          </div>
                        )}

                        {!!fields.length && (
                          <div className="embed-preview-fields">
                            {fields.map((field) => (
                              <div
                                key={field.id}
                                className={`embed-preview-field ${field.inline ? 'is-inline' : 'is-full'} is-interactive`}
                                onClick={() => focusEditorBlock('field')}
                                title="Click to edit field"
                              >
                                <b>{renderDiscordFormattedText(field.name || 'Field name')}</b>
                                <span>{renderDiscordFormattedText(field.value || 'Field value')}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {thumbnailWire ? <div className="embed-preview-wire-media is-thumbnail">{thumbnailWire.token}</div> : safePreviewUrl(thumbnail) ? (failedThumbnailUrl === safePreviewUrl(thumbnail) ? (
                        <div className="embed-preview-image-error" onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setThumbnailContextMenu({ x: event.clientX, y: event.clientY, url: safePreviewUrl(thumbnail) }); }}>
                          <span>Image could not be loaded</span>
                          <a href={safePreviewUrl(thumbnail)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Open image <ExternalLink size={11} /></a>
                        </div>
                      ) : (
                        <img
                          className="embed-preview-thumbnail is-interactive"
                          src={safePreviewUrl(thumbnail)}
                          alt="Thumbnail preview"
                          referrerPolicy="no-referrer"
                          onError={() => setFailedThumbnailUrl(safePreviewUrl(thumbnail))}
                          onClick={() => focusEditorBlock('thumbnail')}
                          onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setThumbnailContextMenu({ x: event.clientX, y: event.clientY, url: safePreviewUrl(thumbnail) }); }}
                          title="Click to edit thumbnail · Right-click to open image"
                        />
                      )) : attachedThumbnail ? (
                        <div
                          className="embed-preview-attachment-thumb is-interactive"
                          onClick={() => focusEditorBlock('thumbnail')}
                          title={`Uploaded attachment: ${attachedThumbnail}`}
                        >
                          📎
                        </div>
                      ) : null}
                    </div>

                    {imageWire ? <div className="embed-preview-wire-media">{imageWire.token}</div> : safePreviewUrl(image) && failedImageUrl !== safePreviewUrl(image) ? (
                      <img
                        className="embed-preview-image is-interactive"
                        src={safePreviewUrl(image)}
                        alt="Image preview"
                        referrerPolicy="no-referrer"
                        onError={() => setFailedImageUrl(safePreviewUrl(image))}
                        onClick={() => focusEditorBlock('image')}
                        title="Click to edit image"
                      />
                    ) : safePreviewUrl(image) ? (
                      <div className="embed-preview-image-error embed-preview-image-error-large">
                        <span>Image could not be loaded</span>
                        <a href={safePreviewUrl(image)} target="_blank" rel="noreferrer">Open image <ExternalLink size={11} /></a>
                      </div>
                    ) : attachedImage ? (
                      <div
                        className="embed-preview-attachment-image is-interactive"
                        onClick={() => focusEditorBlock('image')}
                      >
                        <span>Attached image:</span> <code>{attachedImage}</code>
                      </div>
                    ) : null}

                    {(footer?.text || footerIconWire || timestampLabel) && (
                      <div
                        className="embed-preview-footer is-interactive"
                        onClick={() => focusEditorBlock('footer')}
                        title="Click to edit footer"
                      >
                        {!footerIconWire && safePreviewUrl(footer?.icon) && (
                          <img src={footer.icon} alt="" className="embed-preview-footer-icon" />
                        )}
                        {footerIconWire && <code className="embed-preview-wire-label">{footerIconWire.token}</code>}
                        {footer?.text && <span>{renderDiscordFormattedText(footer.text)}</span>}
                        {footer?.text && timestampLabel && (
                          <span className="embed-preview-footer-dot">•</span>
                        )}
                        {timestampLabel && (
                          <time dateTime={timestamp && !Number.isNaN(new Date(timestamp).getTime()) ? new Date(timestamp).toISOString() : undefined}>{timestampLabel}</time>
                        )}
                      </div>
                    )}
                  </div>
                ) : !components.length && !content ? (
                  <div className="embed-preview-empty-card">
                    <p>Your message has no content yet.</p>
                    <span>Add embed blocks or interactive buttons from the editor on the left.</span>
                  </div>
                ) : null}

                {toDiscordComponents(components, appEmojis).map((row, rowIndex) => {
                  const sourceRow = components.filter((item) => item.components?.length)[rowIndex] || components[rowIndex];
                  if (!row.components?.length) return null;

                  return (
                    <div className="discord-action-row" key={sourceRow?.id || rowIndex}>
                      {row.components.map((component, componentIndex) => {
                        const originalComponent = sourceRow?.components?.[componentIndex];
                        const componentId = originalComponent?.id || `comp_${rowIndex}_${componentIndex}`;

                        if (component.type === 2) {
                          const styleClass = `is-style-${component.style === 5 ? 'link' : component.style === 1 ? 'primary' : component.style === 3 ? 'success' : component.style === 4 ? 'danger' : 'secondary'}`;
                          const isLink = component.style === 5;
                          const buttonEmoji = originalComponent?.emoji || component.emoji;

                          return (
                            <button
                              key={componentId}
                              type="button"
                              className={`discord-message-btn ${styleClass} ${component.disabled ? 'is-disabled' : ''}`}
                              disabled={component.disabled}
                              onClick={() => originalComponent?.id && focusComponent(originalComponent.id)}
                              title={originalComponent?.id ? `Configure button "${component.label || 'Button'}"` : undefined}
                            >
                              {buttonEmoji && (
                                <span className="discord-btn-emoji">
                                  {renderDiscordFormattedText(
                                    typeof buttonEmoji === 'object' && buttonEmoji?.id
                                      ? `<${buttonEmoji.animated ? 'a' : ''}:${buttonEmoji.name}:${buttonEmoji.id}>`
                                      : buttonEmoji?.name || buttonEmoji
                                  )}
                                </span>
                              )}
                              {component.label && <span>{renderDiscordFormattedText(component.label)}</span>}
                              {isLink && <ExternalLink size={13} className="discord-btn-link-icon" />}
                            </button>
                          );
                        }

                        const isExpanded = expandedSelectMenuId === componentId;
                        const selectedVal = selectedMenuValues[componentId];
                        const selectedOption = originalComponent?.options?.find((o) => o.value === selectedVal);

                        return (
                          <div
                            key={componentId}
                            className={`discord-message-select ${isExpanded ? 'is-expanded' : ''}`}
                            onClick={() => setExpandedSelectMenuId((prev) => prev === componentId ? null : componentId)}
                            title={isExpanded ? 'Click to close menu' : 'Click to preview select menu options'}
                          >
                            <div className="discord-select-trigger">
                              <span className="discord-select-placeholder">
                                {selectedOption ? (
                                  <span className="discord-select-selected-val">
                                    {selectedOption.emoji && (
                                      <span className="discord-select-item-emoji">{renderDiscordFormattedText(selectedOption.emoji)}</span>
                                    )}
                                    {renderDiscordFormattedText(selectedOption.label || selectedOption.value)}
                                  </span>
                                ) : (
                                  component.placeholder || 'Select an option…'
                                )}
                              </span>
                              <span className="discord-select-chevron">{isExpanded ? '⌃' : '⌄'}</span>
                            </div>

                            {isExpanded && (
                              <div className="discord-preview-select-popover" onClick={(e) => e.stopPropagation()}>
                                {originalComponent?.options?.length ? (
                                  originalComponent.options.map((opt, optIdx) => {
                                    const isOptSelected = selectedVal === opt.value;
                                    return (
                                      <div
                                        key={optIdx}
                                        className={`discord-preview-select-item ${isOptSelected ? 'is-selected' : ''}`}
                                        onClick={() => {
                                          setSelectedMenuValues((prev) => ({ ...prev, [componentId]: opt.value }));
                                          setExpandedSelectMenuId(null);
                                        }}
                                      >
                                        {opt.emoji && (
                                          <span className="discord-select-item-emoji">{renderDiscordFormattedText(opt.emoji)}</span>
                                        )}
                                        <div className="discord-select-item-text">
                                          <strong className="discord-select-item-label">{renderDiscordFormattedText(opt.label || opt.value)}</strong>
                                          {opt.description && (
                                            <span className="discord-select-item-desc">{renderDiscordFormattedText(opt.description)}</span>
                                          )}
                                        </div>
                                        {isOptSelected && <span className="discord-select-item-check">✓</span>}
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="discord-preview-select-empty">
                                    <span>No options configured yet</span>
                                    <button
                                      type="button"
                                      className="discord-preview-add-opt-link"
                                      onClick={() => {
                                        setExpandedSelectMenuId(null);
                                        originalComponent?.id && focusComponent(originalComponent.id);
                                      }}
                                    >
                                      Configure in inspector
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
    <Modal isOpen={discardPromptOpen} onClose={() => setDiscardPromptOpen(false)} title="Discard studio changes?" subtitle="These edits have not been applied to the graph." footer={<><Button variant="secondary" onClick={() => setDiscardPromptOpen(false)}>Keep editing</Button><Button variant="danger" onClick={onClose}>Discard changes</Button></>}><p className="close-graph-copy">Your graph stays unchanged until you choose Apply.</p></Modal>
    {thumbnailContextMenu && createPortal(
      <div className="canvas-context-menu embed-thumbnail-context-menu" role="menu" style={{ position: 'fixed', left: thumbnailContextMenu.x, top: thumbnailContextMenu.y, zIndex: 10000 }} onPointerDown={(event) => event.stopPropagation()}>
        <button role="menuitem" onClick={() => { window.open(thumbnailContextMenu.url, '_blank', 'noopener,noreferrer'); setThumbnailContextMenu(null); }}><ExternalLink size={14} /> Open image in browser</button>
      </div>,
      document.body
    )}
    </>
  );
}
