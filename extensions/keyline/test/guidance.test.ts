/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Keyline contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { alignTyped, completedEdit, lineRegion, visibleChar } from '../src/guidance.ts';
import { nextStarter } from '../src/guides.ts';

test('hints reveal one character, including whitespace and non-BMP characters', () => {
	for (const [typed, target, next] of [['', '  let', ' '], ['f', 'filter', 'i'], ['filter', 'filter', ''], ['a', 'a🎈', '🎈']]) {
		assert.deepEqual(alignTyped(typed, target), { next, errors: [] });
	}
	assert.equal(visibleChar(' '), '␣'); assert.equal(visibleChar('\n'), '↵');
});

test('typing a different character or an extra letter can realign at the next match', () => {
	assert.deepEqual(alignTyped('fx', 'foo'), { next: 'o', errors: [[1, 2]] });
	assert.deepEqual(alignTyped('rXeturn', 'return tasks'), { next: ' ', errors: [[1, 2]] });
	assert.deepEqual(alignTyped('retun ', 'return tasks'), { next: 't', errors: [] });
	assert.deepEqual(alignTyped('foo!', 'foo'), { next: '', errors: [[3, 4]] });
});

test('the marker must occupy its own line and preserves intentional trailing newlines', () => {
	assert.equal(completedEdit('return "//DONE"'), null);
	assert.equal(completedEdit('value //DONE'), null);
	assert.deepEqual(completedEdit('value\n  //DONE'), { text: 'value' });
	assert.deepEqual(completedEdit('value\n\n//DONE'), { text: 'value\n' });
	assert.deepEqual(completedEdit('//DONE'), { text: '' });
});

test('line ranges support replacements, empty lines, and insertions before a line', () => {
	assert.deepEqual(lineRegion('a\n\nb', 2, 3), { from: 2, to: 4, text: '\nb' });
	assert.deepEqual(lineRegion('a\nb', 2, 1), { from: 2, to: 2, text: '' });
	assert.equal(lineRegion('a', 2, 2), null);
});

test('a starter guide locates the actual counter in the range the learner shared', () => {
	const initial = nextStarter('counter', [], []);
	const observed = { action: initial, result: { startLine: 12, text: '/** Comment. */\n\nexport function countCompleted(tasks) {\n  return tasks.length;\n}' } };
	const edit = nextStarter('counter', [observed], []);
	assert.equal(edit.kind, 'edit'); assert.equal(edit.startLine, 15); assert.equal(edit.oldText, '  return tasks.length;');
	assert.equal(edit.text, '  return tasks.filter((task) => task.completed).length;');
	const tabbed = nextStarter('counter', [{ action: initial, result: { ...observed.result, text: observed.result.text.replace('  return', '\treturn') } }], []);
	assert.equal(tabbed.kind, 'edit');
	assert.equal(tabbed.text, '\treturn tasks.filter((task) => task.completed).length;');
	const ownEdit = { action: edit, result: { text: '  return 0;' } };
	const existing = nextStarter('counter', [observed, ownEdit], [{ path: 'tests/counter.test.js' }]);
	assert.equal(existing.kind, 'read'); assert.equal(existing.path, 'tests/counter.test.js');
});
