export function isProjectVariableUpdateForActiveProject(payload, activeProjectId) {
  return !payload || typeof payload.projectId !== 'string' || payload.projectId === activeProjectId;
}

export function resolveVariableReference(variables, variableId, scope) {
  if (!Array.isArray(variables) || !variableId) return null;
  const matches = variables.filter((variable) => variable?.id === variableId);
  const scopedMatch = matches.find((variable) => (variable.scope || 'graph') === (scope || 'graph'));
  if (scopedMatch) return scopedMatch;
  return matches.length === 1 ? matches[0] : null;
}
