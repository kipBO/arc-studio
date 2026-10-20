import React, { useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { Modal } from './Modal.jsx';
//
export function TemplateSyntaxHelp() {
  const [isOpen, setIsOpen] = useState(false);
  return <>
    <button type="button" className="template-syntax-help-button" onClick={() => setIsOpen(true)} aria-label="Template syntax help" title="Template syntax help">
      <CircleHelp size={15} />
    </button>
    <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Template syntax" subtitle="Use templates in text fields, embed content, and message components." maxWidth="lg">
      <div className="template-syntax-help-content">
        <p>Insert a variable with double braces. Variables resolve from the current graph and event data.</p>
        <pre>{'{{username}}'}</pre>
        <h3>Expressions</h3>
        <p>Expressions use a safe, built-in evaluator. Use parentheses to make the order clear, division or remainder by zero returns 0.</p>
        <pre>{'{{1 + 1}}\n{{score + bonus}}\n{{round((score + bonus) / 3, 2)}}\n{{toString(round(toNumber(score), 2))}}'}</pre>
        <p>Supports <code>+</code>, <code>-</code>, <code>*</code>, <code>/</code>, <code>%</code>, <code>^</code>, comparisons, and functions such as <code>abs</code>, <code>sqrt</code>, <code>min</code>, <code>max</code>, <code>clamp</code>, <code>lerp</code>, <code>round</code>, <code>floor</code>, and <code>ceil</code>. Property paths work too, such as <code>{'{{user.name}}'}</code> or <code>{'{{items[0]}}'}</code>.</p>
        <h3>Chaining</h3>
        <p>Use <code>|</code> to pass each result into the next filter. Mix math, conversions, and text filters in one chain.</p>
        <pre>{'{{score + bonus | toNumber | round(2) | toString | upper}}\n{{price * 1.1 | round(2)}}\n{{name | trim | replace("_", " ") | title}}'}</pre>
        <h3>Filters</h3>
        <p>Chain filters with <code>|</code>. Arguments go in parentheses and can be quoted.</p>
        <ul>
          <li><code>lower</code>, <code>upper</code>, <code>title</code>, <code>capitalize</code> - change letter casing.</li>
          <li><code>trim</code>, <code>trimStart</code>, <code>trimEnd</code> - remove surrounding whitespace.</li>
          <li><code>replace("_", " ")</code>, <code>replaceFirst("old", "new")</code> - replace text.</li>
          <li><code>join(", ")</code> - join array items; <code>slice(0, 3)</code> - take a range.</li>
          <li><code>length</code> - get text or array length; <code>json</code> - serialize a value.</li>
          <li><code>default("Guest")</code> - use a fallback for missing, null, or empty values.</li>
          <li><code>toNumber</code>, <code>toString</code>, <code>round(2)</code>, <code>floor</code>, <code>ceil</code> - convert or round values.</li>
        </ul>
        <pre>{'{{name | lower}}\n{{cards | join(", ")}}\n{{name | default("Guest")}}'}</pre>
        <h3>Conditions</h3>
        <p>Choose text with a ternary expression. Conditions support truthy checks, negation, and comparisons: <code>==</code>, <code>!=</code>, <code>&gt;</code>, <code>&gt;=</code>, <code>&lt;</code>, <code>&lt;=</code> (also <code>===</code> and <code>!==</code>).</p>
        <pre>{'{{isAdmin ? "Admin" : "Member"}}\n{{status == "ready" ? "Online" : "Offline"}}\n{{nickname | default("Guest")}}'}</pre>
      </div>
    </Modal>
  </>;
}
