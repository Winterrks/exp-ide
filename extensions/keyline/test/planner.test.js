import test from 'node:test';
import assert from 'node:assert/strict';
import { propose } from '../planner.js';
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
