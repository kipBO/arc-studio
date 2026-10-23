export function evaluateLogicNode(type, inputs = {}) {
  if (type === 'logic_xor_many') {
    return Object.entries(inputs).filter(([id, value]) => /^input_\d+$/.test(id) && value).length % 2 === 1;
  }
  if (type === 'logic_and') return inputs.a && inputs.b;
  if (type === 'logic_or') return inputs.a || inputs.b;
  if (type === 'logic_xor') return inputs.a !== inputs.b;
  return !inputs.value;
}
