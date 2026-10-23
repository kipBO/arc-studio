import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isProjectVariableUpdateForActiveProject,
  resolveVariableReference
} from '../src/core/projectVariables.js';
//
test('project variable updates from a previously active project are ignored', () => {
  assert.equal(isProjectVariableUpdateForActiveProject({ projectId: 'project-old' }, 'project-current'), false);
  assert.equal(isProjectVariableUpdateForActiveProject({ projectId: 'project-current' }, 'project-current'), true);
  assert.equal(isProjectVariableUpdateForActiveProject({}, 'project-current'), true);
});

test('variable references resolve by scope, with a legacy ID-only fallback', () => {
  const graphVariable = { id: 'var-shared', name: 'graph value', scope: 'graph' };
  const projectVariable = { id: 'var-project', name: 'project value', scope: 'project' };
  const variables = [graphVariable, projectVariable];

  assert.equal(resolveVariableReference(variables, 'var-shared', 'graph'), graphVariable);
  assert.equal(resolveVariableReference(variables, 'var-project', 'graph'), projectVariable);
  assert.equal(resolveVariableReference(variables, 'missing', 'graph'), null);
  assert.equal(resolveVariableReference([
    graphVariable,
    { ...graphVariable, scope: 'project', name: 'duplicate ID' }
  ], 'var-shared', 'unknown'), null);
});
