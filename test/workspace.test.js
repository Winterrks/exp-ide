import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { workspace } from '../server/workspace.js';
import { propose } from '../server/planner.js';

async function temporary(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'keyline-unit-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('initialization keeps learner work across restarts and file creation is exclusive', async t => {
  const dir = await temporary(t);
  const ws = await workspace(undefined, dir);
  const doc = await ws.read('src/tasks.js');
  await ws.save(doc.path, 'my version', doc.revision);
  const again = await workspace(undefined, dir);
  assert.equal((await again.read(doc.path)).text, 'my version');
  await again.create('notes', true);
  await again.create('notes/hello.md');
  await assert.rejects(again.create('notes/hello.md'), { code: 'EEXIST' });
  assert.ok((await again.tree()).some(f => f.path === 'notes/hello.md'));
});

test('concurrent saves with the same revision keep a single winning edit', async t => {
  const ws = await workspace(await temporary(t));
  const newFile = await ws.create('hello.txt');
  const writes = await Promise.allSettled(['a', 'b'].map(text => ws.save(newFile.path, text, newFile.revision)));
  assert.equal(writes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(writes.find(r => r.status === 'rejected').reason.status, 409);
  assert.equal((await ws.read(newFile.path)).text, 'a');
});

test('the file API confines paths and omits symbolic links', async t => {
  const dir = await temporary(t);
  const ws = await workspace(dir);
  await fs.symlink(os.tmpdir(), path.join(dir, 'linked'));
  assert.deepEqual(await ws.tree(), []);
  await assert.rejects(ws.locate('linked/file'), /Symbolic/);
  await assert.rejects(ws.locate('../file'), /inside the workspace/);
});

test('the model receives file names first and then the actual human result', async () => {
  const ws = { tree: async () => [{ path: 'one.js' }, { path: 'two.js' }], read: () => assert.fail('Planner read a file') };
  const config = { apiKey: 'test', baseUrl: 'https://model.invalid/v1', model: 'test-model' };
  const read = { kind: 'read', title: 'Inspect return', reason: 'Inspect the value.', path: 'one.js', startLine: 1, endLine: 1 };
  const edit = { ...read, kind: 'edit', oldText: 'return 1;', text: 'return 2;' };
  const calls = [];
  const fake = next => async (_url, options) => {
    calls.push(JSON.parse(JSON.parse(options.body).messages[1].content));
    return Response.json({ choices: [{ message: { content: JSON.stringify(next) } }] });
  };
  assert.deepEqual(await propose({ goal: 'Adjust the value' }, ws, config, fake(read)), read);
  assert.deepEqual(calls[0].observations, []); assert.deepEqual(calls[0].files, ['one.js', 'two.js']);
  const history = [{ action: read, result: { startLine: 1, endLine: 1, text: 'return 1;' } }];
  assert.deepEqual(await propose({ goal: 'Adjust', history }, ws, config, fake(edit)), edit);
  await assert.rejects(propose({ goal: 'Adjust', history: [] }, ws, config, fake(edit)), /invalid action/);
  const actual = { action: edit, result: { text: 'return 3;', matchedSuggestion: false } };
  const done = { kind: 'done', title: 'Finished', reason: 'The learner chose three.' };
  await propose({ goal: 'Adjust', history: [...history, actual] }, ws, config, fake(done));
  assert.equal(calls.at(-1).observations.at(-1).result.text, 'return 3;');
});
