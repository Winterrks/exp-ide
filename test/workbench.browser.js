import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

async function typeLines(page, value) {
  for (const [i, line] of value.split('\n').entries()) {
    if (i) await page.keyboard.press('Enter');
    if (line) await page.keyboard.type(line);
  }
}

async function launchWorkspace(t, provider) {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'keyline-browser-'));
  t.after(() => fs.rm(data, { recursive: true, force: true }));
  process.env.KEYLINE_DATA_DIR = data;
  process.env.KEYLINE_WORKSPACE = '';
  process.env.OPENAI_API_KEY = '';
  process.env.KEYLINE_MODEL_API_KEY = provider ? 'test' : '';
  if (provider) process.env.OPENAI_BASE_URL = provider;
  const server = await preview({ logLevel: 'error', preview: { port: 0, host: '127.0.0.1' } });
  t.after(() => server.close());
  const executablePath = process.env.KEYLINE_CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({ executablePath });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1350, height: 820 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const url = 'http://127.0.0.1:' + server.httpServer.address().port;
  await page.goto(url);
  await page.getByRole('heading', { name: 'Fix the task counter' }).waitFor();
  await page.locator('.cm-content').waitFor();
  return { data, page, errors };
}

test('learner reads, diverges, creates a file by hand, and runs the real suite', { timeout: 90000 }, async t => {
  const { data, page, errors } = await launchWorkspace(t);
  const source = path.join(data, 'taskboard/src/tasks.js');
  const testFile = path.join(data, 'taskboard/tests/counter.test.js');
  const original = await fs.readFile(source, 'utf8');
  assert.equal(await page.getByRole('button', { name: 'Continue', exact: true }).count(), 0);
  await page.getByRole('tab', { name: 'README.md' }).click();
  await page.getByRole('tab', { name: 'tasks.js', exact: true }).click();
  assert.equal(await page.locator('.guide-read-line').count(), 0);

  await page.getByRole('button', { name: 'Open src/tasks.js', exact: true }).click();
  await page.locator('.guide-read-line').first().waitFor();
  assert.equal(await page.locator('.guide-read-line').count(), 9);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('.delete-text').waitFor();
  assert.equal(await fs.readFile(source, 'utf8'), original);
  await page.keyboard.press('Backspace');
  assert.equal(await page.locator('.cm-editor .char-hint').textContent(), '␣');
  await page.keyboard.type('  ret');
  assert.equal(await page.locator('.cm-editor .char-hint').getAttribute('data-char'), 'u');
  await page.reload();
  await page.locator('.cm-editor .char-hint[data-char="u"]').waitFor();
  const own = '  return tasks.filter(item => item.completed).length;';
  await page.keyboard.type(own.slice(5));
  assert.ok(await page.locator('.cm-editor .typed-difference').count() > 0);
  assert.equal(await fs.readFile(source, 'utf8'), original);
  await typeLines(page, '\n//DONE');
  await page.getByText('Select the green folder in Explorer', { exact: false }).waitFor();
  assert.equal(await fs.readFile(source, 'utf8'), original.replace('  return tasks.length;', own));
  assert.equal(existsSync(testFile), false);

  await page.getByRole('button', { name: 'Folder src', exact: true }).click();
  await page.getByRole('button', { name: 'New file', exact: true }).click();
  await page.getByLabel('New file in src').waitFor();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Folder tests', exact: true }).click();
  await page.getByRole('button', { name: 'New file', exact: true }).click();
  await page.getByLabel('New file in tests').fill('counter.test.js');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.locator('.cm-editor .char-hint[data-char="i"]').waitFor();
  assert.equal(await fs.readFile(testFile, 'utf8'), '');
  const contents = 'import assert from "node:assert/strict";\nimport { countCompleted } from "../src/tasks.js";\n\nassert.equal(countCompleted([{ completed: false }]), 0);';
  await typeLines(page, contents + '\n//DONE');
  await page.locator('.command-control .char-hint[data-char="n"]').waitFor();
  assert.equal(await fs.readFile(testFile, 'utf8'), contents);
  const command = page.getByRole('textbox', { name: 'Terminal command' });
  await command.pressSequentially('n');
  assert.equal(await page.locator('.command-control .char-hint').textContent(), 'o');
  await command.pressSequentially('x');
  assert.equal(await page.locator('.command-control .typed-difference').textContent(), 'x');
  await command.press('Backspace');
  await command.pressSequentially('ode --test');
  assert.equal(await page.locator('.terminal-entry').count(), 0);
  await command.press('Enter');
  await page.getByText('The taskboard test suite passed with your changes.').waitFor();
  assert.match(await page.locator('.terminal-entry pre').innerText(), /pass 3/);

  await page.getByRole('button', { name: 'Session activity' }).click();
  await page.getByText('Update the counter', { exact: true }).last().click();
  assert.equal(await page.getByRole('dialog').locator('details[open] pre').textContent(), own);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await command.fill('cd src'); await command.press('Enter');
  await page.waitForFunction(() => document.querySelector('.shell-prompt .shell-dir')?.textContent.endsWith('/src'));
  await command.fill('pwd'); await command.press('Enter');
  await page.waitForFunction(() => document.querySelector('.terminal-entry:last-of-type pre')?.textContent.includes('/taskboard/src') || [...document.querySelectorAll('.terminal-entry pre')].some(p => p.textContent.trim().endsWith('/taskboard/src')));
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Search files by name' }).fill('README');
  await page.getByRole('textbox', { name: 'Search files by name' }).press('Enter');
  await page.getByRole('textbox', { name: 'Code editor for README.md' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('button', { name: 'Toggle Explorer' }).click();
  const sourceFolder = page.getByRole('button', { name: 'Folder src', exact: true });
  if (await sourceFolder.getAttribute('aria-expanded') === 'false') await sourceFolder.click();
  await page.getByRole('button', { name: 'Open src/tasks.js', exact: true }).click();
  await page.getByRole('textbox', { name: 'Code editor for src/tasks.js' }).waitFor();
  await page.getByTitle('Toggle agent panel').click();
  await page.getByRole('button', { name: 'Start another guide' }).click();
  await page.getByRole('button', { name: /Clean up task titles/ }).click();
  await page.getByTitle('Toggle agent panel').click();
  await page.getByRole('button', { name: 'Show in Explorer' }).click();
  await page.getByRole('button', { name: 'Open src/tasks.js', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('.delete-text').waitFor();
  assert.match(await page.getByLabel('Current guide instruction').innerText(), /Trimming the title/);
  assert.deepEqual(errors, []);
});

test('an open-ended request gives the model only manually shared lines and the actual edits', { timeout: 60000 }, async t => {
  const calls = [];
  const file = 'src/tasks.js';
  const read = { kind: 'read', title: 'Inspect the counter', reason: 'Inspect the existing return value.', path: file, startLine: 17, endLine: 20 };
  const proposals = [
    read,
    { ...read, kind: 'edit', title: 'Try a value', startLine: 19, endLine: 19, oldText: '  return tasks.length;', text: '  return 2;' },
    { ...read, kind: 'edit', title: 'Remove the description', startLine: 17, endLine: 17, oldText: '/** Count the tasks marked as complete. */', text: '' },
    { kind: 'done', title: 'Finished', reason: 'Reviewed the two saved changes.' },
  ];
  const model = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks));
    const proposal = proposals[calls.length];
    calls.push(JSON.parse(body.messages[1].content));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(proposal) } }] }));
  });
  await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => model.close(resolve)));
  const { page, data, errors } = await launchWorkspace(t, 'http://127.0.0.1:' + model.address().port + '/v1');
  await page.getByRole('textbox', { name: 'Ask the agent for a change' }).fill('Experiment with the counter');
  await page.getByRole('button', { name: 'Send request' }).click();
  await page.getByText('Inspect the counter', { exact: true }).waitFor();
  assert.deepEqual(calls[0].observations, []);
  assert.ok(calls[0].files.includes(file));
  await page.getByRole('button', { name: 'Open src/tasks.js' }).click();
  assert.equal(calls.length, 1);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('.delete-text').waitFor();
  assert.equal(calls[1].observations[0].result.text.split('\n').length, 4);
  await page.keyboard.press('Backspace');
  await typeLines(page, '  return 7;\n//DONE');
  await page.getByText('Remove the description', { exact: true }).waitFor();
  assert.equal(calls[2].observations.at(-1).result.text, '  return 7;');
  await page.locator('.delete-text').waitFor();
  await page.keyboard.press('Backspace');
  await typeLines(page, '//DONE');
  await page.getByText('Reviewed the two saved changes.').waitFor();
  assert.equal(calls[3].observations.at(-1).result.text, '');
  const saved = await fs.readFile(path.join(data, 'taskboard', file), 'utf8');
  assert.match(saved, /\}\n\nexport function countCompleted\(tasks\) \{\n  return 7;/);
  assert.equal(saved.includes('//DONE'), false);
  assert.deepEqual(errors, []);
});
