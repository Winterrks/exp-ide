export const guides = {
  counter: {
    title: 'Fix the task counter',
    description: 'Count only completed tasks and verify the result with a test.',
    steps: ['Read the task helpers', 'Update the counter', 'Create a test file', 'Run the tests'],
    start: 12, end: 20, fn: 'countCompleted', line: '  return tasks.filter((task) => task.completed).length;',
    readReason: 'Compare how getOpenTasks filters the list with how countCompleted counts it.',
    editReason: 'The current counter includes unfinished tasks. Filter by the completed flag before counting.',
    testPath: 'tests/counter.test.js',
    test: 'import assert from "node:assert/strict";\nimport { countCompleted } from "../src/tasks.js";\n\nconst tasks = [{ completed: true }, { completed: false }];\nassert.equal(countCompleted(tasks), 1);',
    testReason: 'A mixed list catches the original bug. Only one of these two tasks is complete.',
  },
  titles: {
    title: 'Clean up task titles',
    description: 'Remove extra spaces when creating a task and cover it with a test.',
    steps: ['Read the task factory', 'Trim the title', 'Create a test file', 'Run the tests'],
    start: 3, end: 10, fn: 'createTask', line: '    title: title.trim(),',
    readReason: 'Look at how createTask stores a title so you can normalize it at the point of creation.',
    editReason: 'Trimming the title as it enters the task keeps the stored text consistent.',
    testPath: 'tests/title.test.js',
    test: 'import assert from "node:assert/strict";\nimport { createTask } from "../src/tasks.js";\n\nassert.equal(createTask("  Learn  ").title, "Learn");',
    testReason: 'Surround a title with spaces and check the exact value the factory returns.',
  },
};

export function matchGuide(goal) {
  if (/title|trim|whitespace/i.test(goal)) return 'titles';
  if (/count|complet|finished/i.test(goal)) return 'counter';
  return null;
}

export function nextStarter(key, history, files) {
  const guide = guides[key];
  const source = 'src/tasks.js';
  const read = history.find(item => item.action.stage === 'inspect');
  if (!read) return { stage: 'inspect', index: 0, kind: 'read', path: source, startLine: guide.start, endLine: guide.end, title: guide.steps[0], reason: guide.readReason };

  if (!history.some(item => item.action.stage === 'edit')) {
    const lines = read.result.text.split('\n');
    const fn = lines.findIndex(line => line.includes('function ' + guide.fn + '('));
    const offset = fn === -1 ? -1 : lines.findIndex((line, i) => i > fn && (key === 'counter' ? line.trimStart().startsWith('return ') : /^\s*title\b/.test(line)));
    if (offset === -1) throw new Error('The function has moved outside the starter guide’s read range. Open a new session for this workspace.');
    if (lines[offset] !== guide.line) return {
      stage: 'edit', index: 1, kind: 'edit', path: source, title: guide.steps[1], reason: guide.editReason,
      startLine: read.result.startLine + offset, endLine: read.result.startLine + offset,
      oldText: lines[offset], text: guide.line,
    };
  }
  if (!history.some(item => ['create', 'test-read'].includes(item.action.stage))) {
    if (files.some(file => file.path === guide.testPath)) return {
      stage: 'test-read', index: 2, kind: 'read', path: guide.testPath, startLine: 1, endLine: 8,
      title: 'Read the existing test', reason: 'This test file already exists. Inspect its assertions before running it.',
    };
    return { stage: 'create', index: 2, kind: 'create', path: guide.testPath, title: guide.steps[2], reason: guide.testReason, text: guide.test };
  }
  const last = history.at(-1);
  if (last?.action.kind === 'command' && last.result.exitCode === 0) {
    const verified = last.result.command.trim() === 'node --test' && last.result.cwd === '';
    return { kind: 'done', title: 'Guide complete', reason: verified ? 'The taskboard test suite passed with your changes.' : 'Your command finished successfully. The terminal has the output from the command you chose.' };
  }
  return { stage: 'command', index: 3, kind: 'command', title: guide.steps[3], command: 'node --test', reason: last?.action.kind === 'command'
    ? 'The last command failed. Use its output to adjust your code, save the file, and run the checks again.'
    : 'Run the Node test suite from the workspace root to check the behavior of your saved changes.' };
}

export function starterSession(key) {
  const guide = guides[key];
  return { id: crypto.randomUUID(), source: 'starter', key, goal: guide.title, description: guide.description,
    history: [], action: nextStarter(key, [], []), opened: false, created: false };
}
