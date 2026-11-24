// Copyright (c) Keyline contributors. Licensed under the MIT License.
// Helpers for working with the task collection.
/** Create a new task with its initial state. */
export function createTask(title) {
	return {
		id: crypto.randomUUID(),
		title,
		completed: false,
	};
}

/** Find tasks that still need attention. */
export function getOpenTasks(tasks) {
	return tasks.filter((task) => !task.completed);
}

/** Count the tasks marked as complete. */
export function countCompleted(tasks) {
	return tasks.length;
}
