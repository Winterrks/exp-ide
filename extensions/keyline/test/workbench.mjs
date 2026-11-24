/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Keyline contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const { chromium, expect } = createRequire(path.join(root, 'scripts/package.json'))('@playwright/test');
const shots = process.env.KEYLINE_SCREENSHOTS;

test('complete a manual guide and switch between three model providers in Code - OSS', { timeout: 150000 }, async t => {
	const directory = await mkdtemp(path.join(tmpdir(), 'keyline-workbench-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const folder = path.join(directory, 'taskboard');
	await cp(path.join(root, 'extensions/keyline/sample'), folder, { recursive: true });
	await mkdir(path.join(folder, '.vscode'));
	await writeFile(path.join(folder, '.vscode/settings.json'), JSON.stringify({ 'files.autoSave': 'afterDelay', 'files.autoSaveDelay': 100 }));
	await writeFile(path.join(folder, 'tests/provider-environment.test.js'), [
		`import assert from 'node:assert/strict';`,
		`for (const name of ['KEYLINE_MODEL_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY']) {`,
		'  assert.equal(process.env[name], undefined, name);',
		'}'
	].join('\n'));

	const requests = [];
	const model = createServer(async (req, res) => {
		const chunks = [];
		for await (const chunk of req) { chunks.push(chunk); }
		const request = JSON.parse(Buffer.concat(chunks).toString());
		const turn = JSON.parse(request.messages.at(-1).content);
		const anthropic = req.url === '/anthropic/v1/messages';
		requests.push({ turn, path: req.url, model: request.model, credential: anthropic ? req.headers['x-api-key'] : req.headers.authorization });
		const action = turn.observations.length
			? { kind: 'done', title: 'Finished', reason: 'You shared the task collection header.' }
			: { kind: 'read', path: 'src/tasks.js', startLine: 1, endLine: 1, title: 'Read the header', reason: 'Inspect the description of the task collection.' };
		res.setHeader('Content-Type', 'application/json');
		const text = JSON.stringify(action);
		res.end(JSON.stringify(anthropic
			? { type: 'message', stop_reason: 'end_turn', content: [{ type: 'text', text }] }
			: { choices: [{ finish_reason: 'stop', message: { content: text } }] }));
	});
	model.listen(0, '127.0.0.1');
	await once(model, 'listening');
	t.after(() => { model.closeAllConnections(); model.close(); });
	const modelHost = 'http://127.0.0.1:' + model.address().port;

	const token = randomBytes(24).toString('hex');
	const tokenPath = path.join(directory, 'token');
	await writeFile(tokenPath, token, { mode: 0o600 });
	const server = spawn(process.execPath, [path.join(root, '.build/keyline-web/out/server-main.js'),
		'--host', '127.0.0.1', '--port', '0', '--server-data-dir', path.join(directory, 'server'),
		'--connection-token-file', tokenPath, '--default-folder', folder], {
		cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
			KEYLINE_MODEL_PROVIDER: 'openai', KEYLINE_MODEL_API_KEY: 'openai-test', KEYLINE_MODEL: 'fixture-openai', KEYLINE_MODEL_BASE_URL: modelHost + '/v1',
			OPENAI_API_KEY: 'openai-alias-test', OPENROUTER_API_KEY: 'router-test', OPENROUTER_BASE_URL: modelHost + '/router/v1',
			ANTHROPIC_API_KEY: '', ANTHROPIC_BASE_URL: modelHost + '/anthropic' }
	});
	t.after(async () => {
		if (server.exitCode === null && !server.signalCode) { const exit = once(server, 'exit'); server.kill(); await exit; }
	});
	server.stderr.resume();
	let log = '';
	server.stdout.setEncoding('utf8').on('data', chunk => { log = (log + chunk).slice(-12000); });
	const address = /Extension host agent listening on (\d+)/;
	await expect.poll(() => { assert.equal(server.exitCode, null); return address.test(log); }, { timeout: 30000 }).toBe(true);
	const url = new URL('http://127.0.0.1:' + log.match(address)[1]);
	url.searchParams.set('tkn', token);
	url.searchParams.set('folder', folder);

	const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
	t.after(() => browser.close());
	const page = await browser.newPage({ viewport: { width: 1512, height: 936 }, colorScheme: 'dark' });
	page.setDefaultTimeout(15000);
	const text = (name, exact = true) => page.getByText(name, { exact }).first();
	const quickInput = page.locator('.quick-input-widget input:visible').first();
	const command = async name => {
		await page.keyboard.press('F1');
		await quickInput.fill('>' + name);
		await page.locator('.quick-input-widget:visible .monaco-list-row:visible').filter({ hasText: name }).first().click();
	};
	const fileRow = name => page.locator('.explorer-folders-view .monaco-list-row').filter({ has: page.getByText(name, { exact: true }) }).first();
	const shot = async name => {
		if (shots) { await mkdir(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, name + '.png') }); }
	};

	await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
	await page.locator('.monaco-workbench').waitFor();
	const trust = page.getByRole('button', { name: /Yes, I trust/ });
	await trust.or(text('Manage')).or(text('Start a Practice Guide')).first().waitFor({ timeout: 45000 });
	if (await trust.count()) { await trust.first().click(); }
	else if (await text('Manage').count()) {
		await text('Manage').click();
		await page.getByRole('button', { name: 'Trust', exact: true }).click();
		const modal = page.locator('.monaco-modal-editor-block:visible');
		if (await modal.count()) { await modal.locator('.codicon-close:visible').last().click(); }
	}
	await text('Start a Practice Guide').click();
	await text('Fix the task counter').click();
	await text('Open src/tasks.js in Explorer', false).waitFor();
	await expect(page.locator('.monaco-workbench')).toHaveClass(/\bvs-dark\b/);

	// A normal Quick Open must not count as the learner opening the requested Explorer item.
	await page.keyboard.press('Control+p');
	await quickInput.fill('src/tasks.js');
	await page.locator('.quick-input-widget:visible .monaco-list-row:visible').filter({ hasText: 'tasks.js' }).first().click();
	await text('Open src/tasks.js in Explorer', false).waitFor();
	assert.equal(await text('Share Selected Lines').count(), 0);
	await fileRow('tasks.js').click();
	await text('Review the green lines', false).waitFor();
	await shot('01-guided-read');
	await text('Share Selected Lines').click();
	await text('On a new line, type //DONE', false).waitFor();
	await page.locator('.tabs-container .tab.active[aria-label*="tasks.js"]').first().waitFor();
	await shot('02-proposed-deletion');

	const source = path.join(folder, 'src/tasks.js');
	const before = await readFile(source, 'utf8');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('  return tasks.filter', { delay: 20 });
	const editedLine = page.locator('.monaco-editor.focused .view-line').filter({ hasText: 'return tasks.filter' }).last();
	// Monaco renders decoration hints with a CSS pseudo-element. Check the actual next glyph.
	await expect.poll(() => editedLine.evaluate(el => [...el.querySelectorAll('span')].map(s => getComputedStyle(s, '::after').content).includes('"("'))).toBe(true);
	await shot('02-guided-edit');
	await page.keyboard.type('(item', { delay: 20 });
	await shot('02-alternative');
	await page.keyboard.type(' => item.completed).length;');
	await page.keyboard.press('Enter');
	await page.keyboard.type('//DON');
	await delay(350);
	assert.equal(await readFile(source, 'utf8'), before);
	await page.keyboard.type('E');
	await text('Use New File in Explorer', false).waitFor();
	assert.equal(await readFile(source, 'utf8'), before.replace('return tasks.length;', 'return tasks.filter(item => item.completed).length;'));

	await fileRow('tests').click({ button: 'right' });
	await text('New File...').waitFor();
	await page.keyboard.press('Home');
	await page.keyboard.press('Enter');
	const filename = page.locator('.explorer-folders-view input:visible').first();
	await filename.fill('counter.test.js');
	await filename.press('Enter');
	await text('On a new line, type //DONE', false).waitFor();
	const created = path.join(folder, 'tests/counter.test.js');
	assert.equal(await readFile(created, 'utf8'), '');
	const content = 'import assert from "node:assert/strict";\nimport { countCompleted } from "../src/tasks.js";\n\nassert.equal(countCompleted([{completed: true}]), 1);';
	for (const [i, line] of content.split('\n').entries()) {
		if (i) { await page.keyboard.press('Enter'); }
		await page.keyboard.type(line, { delay: 3 });
	}
	await page.keyboard.press('Enter');
	await page.keyboard.type('//DONE');
	await text('Type the command in the terminal', false).waitFor();
	assert.equal(await readFile(created, 'utf8'), content);
	await page.locator('.terminal-wrapper.active .xterm.focus:visible').first().waitFor();
	await page.keyboard.type('node --te', { delay: 35 });
	await shot('03-guided-terminal');
	await page.keyboard.type('st');
	await page.keyboard.press('Enter');
	await text('The taskboard test suite passed', false).waitFor();
	await shot('04-test-result');

	// New Terminal opens the standard, interactive VS Code shell, alongside the guided terminal.
	await command('Terminal: Create New Terminal');
	await page.locator('.terminal-wrapper.active .xterm.focus:visible').first().waitFor();
	await page.keyboard.type('printf keyline-pty > native-shell.result', { delay: 10 });
	await page.keyboard.press('Enter');
	await expect.poll(() => readFile(path.join(folder, 'native-shell.result'), 'utf8').catch(() => ''), { timeout: 15000 }).toBe('keyline-pty');

	const providers = [
		{ label: 'OpenAI', model: 'fixture-openai', path: '/v1/chat/completions', credential: 'Bearer openai-test' },
		{ label: 'OpenRouter', model: 'example/fixture-router', path: '/router/v1/chat/completions', credential: 'Bearer router-test' },
		{ label: 'Anthropic', model: 'fixture-claude', path: '/anthropic/v1/messages', credential: 'claude-test-key' }
	];
	async function choose(next) {
		await command('Keyline: Choose Model');
		await page.locator('.quick-input-widget:visible').getByText(next.label, { exact: true }).click();
		await text(next.label + ' Model ID').waitFor();
		await quickInput.fill(next.model);
		await quickInput.press('Enter');
		if (next.label === 'Anthropic') {
			const key = page.locator('.quick-input-widget:visible input[type=password]');
			await key.fill(next.credential);
			await key.press('Enter');
		}
		await page.locator('.quick-input-widget:visible').waitFor({ state: 'hidden' });
	}
	for (const [index, provider] of providers.entries()) {
		await text('Describe Another Change').click();
		await quickInput.fill('Explain the task collection header');
		await quickInput.press('Enter');
		await text('Inspect the description of the task collection.', false).waitFor();
		await fileRow('tasks.js').click();
		await text('Review the green lines', false).waitFor();
		if (providers[index + 1]) { await choose(providers[index + 1]); }
		// Switching providers mid-read must keep this guide's contents with the original provider.
		assert.equal(requests.length, index * 2 + 1);
		const first = requests.at(-1).turn;
		assert.deepEqual(Object.keys(first).sort(), ['files', 'goal', 'observations']);
		assert.deepEqual(first.observations, []);
		assert.ok(first.files.includes('src/tasks.js'));
		await text('Share Selected Lines').click();
		await text('You shared the task collection header.', false).waitFor();
		assert.equal(requests.length, index * 2 + 2);
		assert.equal(requests.at(-1).turn.observations[0].result.text, before.split('\n')[0]);
		for (const request of requests.slice(-2)) {
			assert.equal(request.path, provider.path);
			assert.equal(request.model, provider.model);
			assert.equal(request.credential, provider.credential);
		}
	}
});
