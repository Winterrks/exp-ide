// Copyright (c) Keyline contributors. Licensed under the MIT License.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, getOpenTasks } from '../src/tasks.js';

test('new tasks start open', () => {
	const task = createTask('Learn Keyline');
	assert.equal(task.completed, false);
	assert.ok(task.id);
});

test('only unfinished tasks are open', () => {
	const open = createTask('Read the helper');
	assert.deepEqual(getOpenTasks([open, { completed: true }]), [open]);
});
