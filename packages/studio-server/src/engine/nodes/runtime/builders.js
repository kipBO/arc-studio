import { parseEmoji } from 'chezcord';
//
export function buildDiscordComponents(rows = [], renderText = (value) => value) {
  const styles = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5 };
  const selectTypes = { string_select: 3, user_select: 5, role_select: 6, mentionable_select: 7, channel_select: 8 };
  return (Array.isArray(rows) ? rows : []).filter((row) => Array.isArray(row.components) && row.components.length).slice(0, 5).map((row) => ({
    type: 1,
    components: row.components.slice(0, 5).map((component) => selectTypes[component.type] ? {
      type: selectTypes[component.type],
      custom_id: String(renderText(String(component.customId || ''))).slice(0, 100),
      ...(component.placeholder ? { placeholder: String(renderText(String(component.placeholder))).slice(0, 150) } : {}),
      min_values: Math.max(0, Math.min(25, Number(component.minValues) || 0)),
      max_values: Math.max(1, Math.min(25, Number(component.maxValues) || 1)),
      ...(component.type === 'string_select' ? { options: (Array.isArray(component.options) ? component.options : []).slice(0, 25).map((option) => ({
        label: String(renderText(String(option.label || ''))).slice(0, 100), value: String(renderText(String(option.value || ''))).slice(0, 100),
        ...(option.description ? { description: String(renderText(String(option.description))).slice(0, 100) } : {}),
        ...(option.emoji ? { emoji: parseEmoji(option.emoji) } : {})
      })) } : {}),
      ...(component.type === 'channel_select' && Array.isArray(component.channelTypes) && component.channelTypes.length ? { channel_types: component.channelTypes.slice(0, 8).map(Number).filter(Number.isInteger) } : {})
    } : {
      type: 2, style: styles[component.style] || 1,
      label: String(renderText(String(component.label || ''))).slice(0, 80),
      ...(component.emoji ? { emoji: parseEmoji(component.emoji) } : {}),
      ...(component.style === 'link' ? { url: String(renderText(String(component.url || ''))).slice(0, 512) } : { custom_id: String(renderText(String(component.customId || ''))).slice(0, 100) }),
      disabled: component.style === 'link' ? false : Boolean(component.disabled)
    })
  }));
}

export function buildDiscordModal(config, renderText = (value) => value) {
  const modal = config && typeof config === 'object' ? config : {};
  const customId = String(renderText(String(modal.customId || ''))).trim();
  const title = String(renderText(String(modal.title || ''))).trim();
  const fields = Array.isArray(modal.components) ? modal.components : [];
  if (!customId || customId.length > 100) throw new Error('Popup Modal needs a custom ID from 1 to 100 characters.');
  if (!title || title.length > 45) throw new Error('Popup Modal title must be from 1 to 45 characters.');
  if (fields.length < 1 || fields.length > 5) throw new Error('Popup Modal must have 1–5 fields.');
  const ids = new Set();
  const optionsFor = (field, max) => {
    const options = Array.isArray(field.options) ? field.options : [];
    if (options.length < 1 || options.length > max) throw new Error(`${field.type === 'string_select' ? 'String select' : 'Checkbox or radio group'} needs 1–${max} options.`);
    const values = new Set();
    return options.map((option) => {
      const label = String(renderText(String(option.label || ''))).trim();
      const value = String(renderText(String(option.value || ''))).trim();
      if (!label || label.length > 100 || !value || value.length > 100 || values.has(value)) throw new Error('Modal option labels and values must be unique, non-empty, and at most 100 characters.');
      values.add(value);
      return { label, value, ...(option.description ? { description: String(renderText(String(option.description))).slice(0, 100) } : {}) };
    });
  };
  const components = fields.map((field) => {
    const fieldId = String(renderText(String(field.customId || ''))).trim();
    const label = String(renderText(String(field.label || ''))).trim();
    const description = field.description ? String(renderText(String(field.description))).trim() : '';
    if (!fieldId || fieldId.length > 100 || ids.has(fieldId)) throw new Error('Each modal field needs a unique custom ID from 1 to 100 characters.');
    ids.add(fieldId);
    if (!label || label.length > 45) throw new Error('Modal field labels must be from 1 to 45 characters.');
    if (description.length > 100) throw new Error('Modal field descriptions can be at most 100 characters.');
    const type = field.type || 'text';
    let component;
    if (type === 'text') {
      const maxLength = Number(field.maxLength ?? 4000);
      const minLength = Number(field.minLength ?? 0);
      if (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 4000 || !Number.isInteger(minLength) || minLength < 0 || minLength > maxLength) throw new Error('Text input length must be between 0 and 4,000 characters.');
      component = { type: 4, custom_id: fieldId, style: Number(field.style) === 2 ? 2 : 1, min_length: minLength, max_length: maxLength, required: field.required !== false,
        ...(field.placeholder ? { placeholder: String(renderText(String(field.placeholder))).slice(0, 100) } : {}),
        ...(field.value != null && field.value !== '' ? { value: String(renderText(String(field.value))).slice(0, maxLength) } : {}) };
    } else if (type === 'string_select') {
      const options = optionsFor(field, 25);
      const maxValues = Math.max(1, Math.min(options.length, Number(field.maxValues) || 1));
      const requestedMin = Number(field.minValues ?? (field.required === false ? 0 : 1)) || 0;
      component = { type: 3, custom_id: fieldId, options, min_values: Math.min(maxValues, field.required === false ? Math.max(0, requestedMin) : Math.max(1, requestedMin)), max_values: maxValues, required: field.required !== false,
        ...(field.placeholder ? { placeholder: String(renderText(String(field.placeholder))).slice(0, 150) } : {}) };
    } else if (['user_select', 'role_select', 'mentionable_select', 'channel_select'].includes(type)) {
      const componentType = { user_select: 5, role_select: 6, mentionable_select: 7, channel_select: 8 }[type];
      const maxValues = Math.max(1, Math.min(25, Number(field.maxValues) || 1));
      const requestedMin = Number(field.minValues ?? (field.required === false ? 0 : 1)) || 0;
      component = { type: componentType, custom_id: fieldId, min_values: Math.min(maxValues, field.required === false ? Math.max(0, requestedMin) : Math.max(1, requestedMin)), max_values: maxValues, required: field.required !== false,
        ...(field.placeholder ? { placeholder: String(renderText(String(field.placeholder))).slice(0, 150) } : {}),
        ...(type === 'channel_select' && Array.isArray(field.channelTypes) ? { channel_types: field.channelTypes.slice(0, 8).map(Number).filter(Number.isInteger) } : {}) };
    } else if (type === 'checkbox') {
      component = { type: 23, custom_id: fieldId, ...(field.defaultChecked ? { default: true } : {}) };
    } else if (type === 'file_upload') {
      const maxValues = Math.max(1, Math.min(10, Number(field.maxValues) || 1));
      const requestedFileTypes = Array.isArray(field.fileTypes) ? [...new Set(field.fileTypes.map((item) => String(item).trim().toLowerCase()).filter(Boolean))] : [];
      if (requestedFileTypes.length > 10 || requestedFileTypes.some((item) => !/^(image|video|audio|\.[a-z0-9]{1,16})$/.test(item))) throw new Error('File type filters must be image, video, audio, or a file extension such as .pdf (up to 10).');
      const fileTypes = requestedFileTypes;
      const requestedMin = Number(field.minValues ?? (field.required === false ? 0 : 1)) || 0;
      component = { type: 19, custom_id: fieldId, min_values: Math.min(maxValues, field.required === false ? Math.max(0, requestedMin) : Math.max(1, requestedMin)), max_values: maxValues, required: field.required !== false, ...(fileTypes.length ? { file_types: fileTypes } : {}) };
    } else if (type === 'checkbox_group' || type === 'radio_group') {
      const options = optionsFor(field, 10);
      if (type === 'radio_group' && options.length < 2) throw new Error('Radio groups need at least two options.');
      const maxValues = Math.max(1, Math.min(options.length, Number(field.maxValues) || options.length));
      component = { type: type === 'checkbox_group' ? 22 : 21, custom_id: fieldId, options, required: field.required !== false,
        ...(type === 'checkbox_group' ? { min_values: Math.min(maxValues, field.required === false ? Math.max(0, Number(field.minValues) || 0) : Math.max(1, Number(field.minValues) || 0)), max_values: maxValues } : {}) };
    } else throw new Error(`Unsupported modal field type: ${type}`);
    return { type: 18, label, ...(description ? { description } : {}), component };
  });
  return { custom_id: customId, title, components };
}

