import React, { useMemo } from 'react';
import { applyTemplateTransforms, evaluateTemplateExpression, getTemplateReferences, renderTextTemplate, splitTemplatePipeline } from '../../../../studio-server/src/engine/TemplateExpressions.js';
//
export function TemplateVariableHints({ value, graphVariables = [], inputSlots = [], connectedInputIds = new Set(), templatePreviewValues = {} }) {
  const tokens = useMemo(() => Array.from(new Map(Array.from(
    String(value || '').matchAll(/(?<!\\)\{\{\s*([^{}]+?)\s*\}\}/g), (match) => {
      const expression = match[1];
      const name = getTemplateReferences(expression)[0];
      return name ? [match[0], { name, token: match[0], expression, pipeline: expression.includes('|') ? ` | ${expression.split('|').slice(1).join('|').trim()}` : '' }] : null;
    }
  ).filter(Boolean)).values()).filter(({ name }) => !name.toLowerCase().startsWith('e_') && !/^arg\d+$/i.test(name)), [value]);
  if (!tokens.length && !/(?<!\\)\{\{\s*[^{}]+?\s*\}\}/.test(String(value || ''))) return null;
  const values = new Map(graphVariables.filter((item) => item?.name).map((item) => [item.name.toLowerCase(), item.initialValue]));
  for (const [pinId, previewValue] of Object.entries(templatePreviewValues || {})) {
    const slot = /^slot_(.+)$/.exec(pinId); const arg = /^arg_(\d+)$/.exec(pinId);
    if (slot) values.set(slot[1].toLowerCase(), previewValue);
    if (arg) values.set(`arg${arg[1]}`, previewValue);
  }
  const preview = renderTextTemplate(value, (name) => values.get(name.toLowerCase()));
  const previewText = preview.length > 180 ? `${preview.slice(0, 177)}…` : preview;
  return <div className="template-token-hints" aria-label="Template values">
    {tokens.map(({ name, token, pipeline, expression }) => {
      const variable = graphVariables.find((item) => item.name?.toLowerCase() === name.toLowerCase());
      const inputPin = inputSlots.find((pin) => pin.id === `slot_${name}`);
      const label = <><span>{'{{'}{name}</span>{pipeline && <small>{pipeline}</small>}<span>{'}}'}</span></>;
      if (inputPin && connectedInputIds.has(inputPin.id)) {
        return <span className="template-token-chip" key={token} data-tooltip={`${name} input socket · value supplied by its connected wire`}>{label}</span>;
      }
      if (!variable && /\|\s*default\s*\(/i.test(expression)) {
        const fallback = previewTemplateValue(undefined, pipeline, token, expression, graphVariables);
        return <span className="template-token-chip" key={token} data-tooltip={`Fallback preview · ${fallback}`}>{label}</span>;
      }
      if (!variable && inputPin) {
        return <span className="template-token-chip" key={token} data-tooltip={`${name} input socket · connect a wire to supply this placeholder`}>{label}</span>;
      }
      if (!variable) return <span className="template-token-chip is-unresolved" key={token} data-tooltip="No matching graph variable or input socket exists. This placeholder will stay as written.">{label}</span>;
      const type = variable.valueType || variable.type || 'text';
      const initial = variable.initialValue;
      const valuePreview = previewTemplateValue(initial, pipeline, token, expression, graphVariables, templatePreviewValues);
      const expected = initial === undefined ? 'No default value' : `Initial value: ${valuePreview}`;
      return <span className="template-token-chip" key={token} data-tooltip={`${variable.name} · ${type} · ${expected}${pipeline ? ` · transforms: ${pipeline.replace(/\|/g, '').trim()}` : ''}`}>{label}</span>;
    })}
    <span className="template-live-preview"><strong>Preview</strong><span>{previewText || '(empty)'}</span></span>
  </div>;
}

function previewTemplateValue(value, pipeline, _token, expression, variables, templatePreviewValues) {
  const variablesByName = new Map(variables.map((item) => [item.name?.toLowerCase(), item.initialValue]));
  for (const [pinId, previewValue] of Object.entries(templatePreviewValues || {})) {
    const slot = /^slot_(.+)$/.exec(pinId); const arg = /^arg_(\d+)$/.exec(pinId);
    if (slot) variablesByName.set(slot[1].toLowerCase(), previewValue);
    if (arg) variablesByName.set(`arg${arg[1]}`, previewValue);
  }
  const resolved = evaluateTemplateExpression(splitTemplatePipeline(expression)[0], (name) => variablesByName.get(name.toLowerCase()));
  if (!resolved.found && !pipeline.toLowerCase().includes('default(')) return 'unavailable';
  const result = applyTemplateTransforms(resolved.value, splitTemplatePipeline(expression).slice(1));
  let display;
  try { display = typeof result === 'string' ? result : JSON.stringify(result); } catch { display = String(result); }
  if (display == null || display === '') display = '(empty)';
  return display.length > 120 ? `${display.slice(0, 117)}…` : display;
}
