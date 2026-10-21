import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CollaborationLastSeen } from '../src/storage/CollaborationLastSeen.js';
//
test('collaboration history persists after a debounce and retains the newest projects', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-collaboration-activity-'));
  const filePath = path.join(directory, 'last-seen.json');
  const store = new CollaborationLastSeen(filePath);
  const originalNow = Date.now;
  let timestamp = originalNow();
  try {
    Date.now = () => timestamp++;
    for (let index = 0; index <= 500; index += 1) {
      store.record(`project-${index}`, '', { id: `user-${index}`, username: `User ${index}` });
    }
  } finally {
    Date.now = originalNow;
  }

  assert.equal(fs.existsSync(filePath), false);
  await new Promise((resolve) => setTimeout(resolve, 350));
  await store.persistChain;
  try {
    const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(Object.keys(saved.projects).length, 500);
    assert.equal(Object.hasOwn(saved.projects, 'project-500'), true);
    assert.equal(Object.hasOwn(saved.projects, 'project-0'), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
