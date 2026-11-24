/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Keyline contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { cp, mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { guides, matchGuide, nextStarter } from './guides.js';
import { alignTyped, completedEdit, visibleChar } from './guidance.js';
import { modelConfig, modelEndpoint, propose, providers } from './planner.js';
import { DraftStore } from './draft.js';
import { guideTerminal } from './terminal.js';

const { commands, window, workspace, l10n } = vscode;
const t = l10n.t;
const lf = text => text.replace(/\r\n/g, '\n');
const same = (a, b) => a?.toString() === b?.toString();
const resource = (s, relative = s.action.path) => vscode.Uri.joinPath(s.root, ...relative.split('/'));
const contextKey = (key, value) => commands.executeCommand('setContext', 'keyline.' + key, value);

function lines(document, first, last) {
	if (first > document.lineCount || first < 1) { throw new Error(t('The requested lines have moved. Start a new guide to read the current version.')); }
	const start = new vscode.Position(first - 1, 0);
	return new vscode.Range(start, last < first ? start : document.lineAt(Math.min(last, document.lineCount) - 1).range.end);
}

function at(text, index) {
	const parts = text.slice(0, index).split('\n');
	return new vscode.Position(parts.length - 1, parts.at(-1).length);
}

async function verifyLocation(root, file) {
	const relative = path.relative(await realpath(root.fsPath), await realpath(file.fsPath));
	if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
		throw new Error(t('This file resolves outside the guided workspace.'));
	}
}

function row(label, icon, command, description) {
	const item = new vscode.TreeItem(label);
	item.iconPath = new vscode.ThemeIcon(icon);
	item.description = description;
	if (command) { item.command = { command, title: label }; }
	return item;
}

const modelPreference = 'modelSelection';

function secretName(config) {
	const url = modelEndpoint(config);
	return 'apiKey/' + config.provider + '/' + url.origin + url.pathname;
}

function selectedModel(context) {
	return modelConfig(process.env, context.globalState.get(modelPreference));
}

async function apiKeyForModel(context, config) {
	return config.apiKey || await context.secrets.get(secretName(config));
}

async function chooseModel(context) {
	const previous = context.globalState.get(modelPreference);
	const items = Object.entries(providers).map(([provider, { label }]) => ({
		provider, label, description: modelConfig(process.env, previous?.provider === provider ? previous : { provider }).model
	}));
	if (previous) { items.push({ label: t('Use Environment Defaults') }); }
	const choice = await window.showQuickPick(items, {
		title: t('Choose Model'), placeHolder: t('Choose the provider for new guides')
	});
	if (!choice) { return; }
	if (!choice.provider) {
		const config = modelConfig(process.env);
		await context.globalState.update(modelPreference, undefined);
		return config;
	}
	const model = await window.showInputBox({
		title: t('{0} Model ID', choice.label), value: choice.description,
		prompt: choice.provider === 'openrouter' ? t('Enter the model ID from OpenRouter, including its provider prefix.') : t('Enter a model ID available to your API account.'),
		validateInput: value => value.trim() ? undefined : t('Enter a model ID.')
	});
	if (!model?.trim()) { return; }
	const selection = { provider: choice.provider, model: model.trim() };
	const config = modelConfig(process.env, selection);
	const endpoint = modelEndpoint(config);
	if (!config.apiKey) {
		const name = secretName(config);
		const saved = await context.secrets.get(name);
		const key = await window.showInputBox({
			title: t('{0} API Key', choice.label), password: true, ignoreFocusOut: true,
			prompt: t('Keyline will send this key to {0}.', endpoint.origin),
			placeHolder: saved ? t('Press Enter to keep your saved key, or enter a replacement') : t('Enter your API key'),
			validateInput: value => saved || value.trim() ? undefined : t('Enter an API key.')
		});
		if (key === undefined) { return; }
		if (key.trim()) { await context.secrets.store(name, key.trim()); }
	}
	await context.globalState.update(modelPreference, selection);
	return config;
}

export function activate(context) {
	const own = item => { context.subscriptions.push(item); return item; };
	const changed = own(new vscode.EventEmitter());
	const filesChanged = own(new vscode.EventEmitter());
	const drafts = own(new DraftStore());
	own(workspace.registerFileSystemProvider('keyline-draft', drafts, { isCaseSensitive: true }));
	const decoration = options => own(window.createTextEditorDecorationType(options));
	const green = decoration({ isWholeLine: true, backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground') });
	const red = decoration({ isWholeLine: true, backgroundColor: new vscode.ThemeColor('diffEditor.removedLineBackground') });
	const difference = decoration({ backgroundColor: new vscode.ThemeColor('diffEditor.removedTextBackground'),
		textDecoration: 'underline wavy', color: new vscode.ThemeColor('editorError.foreground') });
	const hint = decoration({ after: { color: new vscode.ThemeColor('editorGhostText.foreground'),
		fontStyle: 'italic' }, rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed });
	let session;
	let changing = false;

	const view = own(window.createTreeView('keyline.guide', { treeDataProvider: {
		onDidChangeTreeData: changed.event, getTreeItem: item => item,
		getChildren() {
			const s = session;
			if (!s) { return []; }
			const items = [];
			if (s.problem) {
				items.push(row(t('Retry Step'), 'refresh', 'keyline.resume'));
				if (!s.action && !s.key) { items.push(row(t('Start a Practice Guide'), 'book', 'keyline.practice')); }
			}
			else if (s.action?.kind === 'done') { items.push(row(t('Describe Another Change'), 'add', 'keyline.start')); }
			else if (s.action?.kind === 'read' && s.observation) { items.push(row(t('Share Selected Lines'), 'arrow-right', 'keyline.continue')); }
			else if (s.action && !s.busy) { items.push(row(t('Return to Current Step'), 'go-to-file', 'keyline.resume')); }
			if (s.key && s.action) {
				const current = s.action.index ?? guides[s.key].steps.length;
				guides[s.key].steps.forEach((label, i) => items.push(row(label, i < current ? 'check' : i === current ? 'circle-filled' : 'circle-outline')));
			} else if (s.history.length) {
				for (const entry of s.history.slice(-5)) { items.push(row(entry.action.title, 'check')); }
			}
			return items;
		}
	} }));

	const instruction = s => {
		const a = s.action;
		if (a.kind === 'read') {
			return s.observation ? t('Review the green lines, then share them to continue.') : t('Open {0} in Explorer to inspect lines {1}–{2}.', a.path, a.startLine, a.endLine);
		}
		if (a.kind === 'create' && !s.draft) { return t('Use New File in Explorer to create {0}.', a.path); }
		if (s.draft) { return t('Type the change in the editor. On a new line, type //DONE to finish.'); }
		if (a.kind === 'command') { return t('Type the command in the terminal. Press Enter to run what you typed.'); }
		return '';
	};

	function update() {
		const s = session;
		view.description = s?.key ? t('Practice') : s?.model ? providers[s.model.provider].label + ' · ' + s.model.model : undefined;
		if (s) {
			const message = new vscode.MarkdownString();
			message.appendMarkdown('**').appendText(s.goal).appendMarkdown('**\n\n');
			if (s.problem) { message.appendText(s.problem); }
			else if (s.busy) { message.appendText(t('Planning the next step…')); }
			else if (s.action) {
				message.appendText(s.action.reason);
				const help = instruction(s);
				if (help) { message.appendMarkdown('\n\n').appendText(help); }
			}
			// appendText escapes untrusted content but encodes every space as nonbreaking.
			message.value = message.value.replaceAll('&nbsp;', ' ');
			view.message = message;
		} else { view.message = undefined; }
		void contextKey('active', Boolean(s && s.action?.kind !== 'done'));
		void contextKey('awaitingRead', Boolean(s?.action?.kind === 'read' && !s.busy));
		void contextKey('canContinue', Boolean(s?.observation && !s.busy));
		changed.fire(); filesChanged.fire(undefined);
	}

	own(window.registerFileDecorationProvider({
		onDidChangeFileDecorations: filesChanged.event,
		provideFileDecoration(uri) {
			const s = session;
			if (!s?.action || !['read', 'create'].includes(s.action.kind) || s.draft || s.busy) { return; }
			const target = resource(s);
			if (target.scheme !== uri.scheme || target.authority !== uri.authority || !uri.path.startsWith(s.root.path)) { return; }
			if (same(target, uri) || target.path.startsWith(uri.path + '/')) {
				return { badge: '›', tooltip: s.action.reason, color: new vscode.ThemeColor('gitDecoration.addedResourceForeground') };
			}
		}
	}));

	function report(s, error) {
		if (s && session === s) { s.busy = false; s.problem = error.message; update(); }
		else { void window.showErrorMessage(error.message); }
	}
	const guard = callback => async (...args) => {
		const s = session;
		try { return await callback(...args); } catch (error) { report(s, error); }
	};
	const register = (id, callback) => own(commands.registerCommand('keyline.' + id, guard(callback)));

	async function names(s) {
		const uris = await workspace.findFiles(new vscode.RelativePattern(s.root, '**/*'), '**/{.git,.keyline,node_modules,dist,out}/**', 4000);
		return uris.map(uri => ({ path: path.relative(s.root.fsPath, uri.fsPath).split(path.sep).join('/') }));
	}

	async function plan(s) {
		s.action = undefined; s.created = false; s.observation = undefined; s.problem = undefined; s.busy = true; update();
		try {
			const action = s.key ? nextStarter(s.key, s.history, await names(s))
				: await propose(s, { tree: () => names(s) }, { ...s.model, apiKey: await apiKeyForModel(context, s.model) });
			if (session !== s) { return; }
			s.action = action; s.busy = false; update();
			await present(s);
		} catch (error) { if (session === s) { report(s, error); } }
	}

	async function advance(s, result) {
		if (session !== s || s.busy) { return; }
		s.history.push({ action: s.action, result });
		for (const editor of window.visibleTextEditors) { editor.setDecorations(green, []); }
		await plan(s);
	}

	async function revealExplorer(s) {
		await commands.executeCommand('workbench.view.explorer');
		let focus = resource(s);
		if (s.action.kind === 'create') { focus = vscode.Uri.joinPath(focus, '..'); }
		try { await workspace.fs.stat(focus); await commands.executeCommand('revealInExplorer', focus); }
		catch { /* A proposed parent directory may still need to be created. */ }
	}

	async function observe(uri) {
		const s = session;
		if (s?.action?.kind !== 'read' || s.busy || !same(resource(s), uri)) { return; }
		await verifyLocation(s.root, uri);
		const doc = await workspace.openTextDocument(uri);
		if (session !== s || s.action?.kind !== 'read') { return; }
		const editor = await window.showTextDocument(doc, { preserveFocus: true });
		const range = lines(doc, s.action.startLine, s.action.endLine);
		editor.setDecorations(green, [range]);
		editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
		s.observation = { doc, range, version: doc.version }; s.problem = undefined; update();
	}

	function draw(editor) {
		const d = session?.draft;
		if (!editor || !d || !same(editor.document.uri, d.uri)) { return; }
		const text = lf(editor.document.getText());
		const valid = text.startsWith(d.before) && text.endsWith(d.after) && text.length >= d.before.length + d.after.length;
		const end = text.length - d.after.length;
		const value = valid ? text.slice(d.before.length, end) : '';
		const startAt = index => at(text, d.before.length + index);
		editor.setDecorations(red, valid && !d.touched && d.old ? [new vscode.Range(startAt(0), startAt(value.length))] : []);
		if (!valid) { editor.setDecorations(hint, []); editor.setDecorations(difference, []); return; }
		const typing = d.touched ? value : '';
		const caret = editor.selection.active;
		const offset = lf(editor.document.getText(new vscode.Range(new vscode.Position(0, 0), caret))).length - d.before.length;
		const position = !d.touched ? startAt(0) : caret;
		const pendingMarker = /(?:^|\n)[\t ]*\/\/?(?:D(?:O(?:N(?:E)?)?)?)?$/.test(typing);
		const next = !pendingMarker && offset >= 0 && offset <= value.length ? alignTyped(typing.slice(0, Math.max(0, offset)), d.proposed).next : '';
		const display = visibleChar(next);
		editor.setDecorations(hint, display ? [{ range: new vscode.Range(position, position), renderOptions: { after: { contentText: display } } }] : []);
		editor.setDecorations(difference, alignTyped(typing, d.proposed).errors.map(([a, b]) => new vscode.Range(startAt(a), startAt(b))));
	}

	async function openDraft(s) {
		s.opening ??= prepareDraft(s);
		try { await s.opening; } finally { s.opening = undefined; }
	}

	async function prepareDraft(s) {
		const target = resource(s);
		await verifyLocation(s.root, target);
		const original = await workspace.openTextDocument(target);
		if (session !== s) { return; }
		const a = s.action;
		const range = a.kind === 'create' ? lines(original, 1, original.lineCount) : lines(original, a.startLine, a.endLine);
		const expected = a.kind === 'create' ? '' : a.oldText;
		const old = lf(original.getText(range));
		if (old !== expected) { throw new Error(t('The file has changed since this step was proposed. Your file was preserved. Read it again in a new guide.')); }
		const text = lf(original.getText());
		const before = lf(original.getText(new vscode.Range(new vscode.Position(0, 0), range.start)));
		const after = text.slice(before.length + old.length);
		const uri = drafts.create(a.path, text);
		const d = { original, uri, range, before, after, old, baseline: text, proposed: a.text, touched: false };
		s.draft = d;
		const doc = await workspace.openTextDocument(uri);
		if (original.languageId !== doc.languageId) { await vscode.languages.setTextDocumentLanguage(doc, original.languageId); }
		if (session !== s) { return; }
		const editor = await window.showTextDocument(doc, { preview: false, selection: range });
		editor.selection = new vscode.Selection(range.end, range.start);
		editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
		draw(editor); update();
	}

	async function closeDraft(s) {
		const d = s.draft;
		if (!d) { return; }
		s.draft = undefined;
		const doc = workspace.textDocuments.find(doc => same(doc.uri, d.uri));
		if (doc?.isDirty) { await doc.save(); }
		const tabs = window.tabGroups.all.flatMap(group => group.tabs).filter(tab => same(tab.input?.uri, d.uri));
		if (tabs.length) { await window.tabGroups.close(tabs, true); }
		drafts.release(d.uri);
	}

	async function commit(s, typed) {
		const d = s.draft;
		if (!d || d.saving || session !== s) { return; }
		d.saving = true;
		try {
			const doc = await workspace.openTextDocument(resource(s));
			await verifyLocation(s.root, doc.uri);
			if (session !== s || s.draft !== d) { return; }
			const expected = d.appliedText === undefined ? d.baseline : d.before + d.appliedText + d.after;
			if (lf(doc.getText()) !== expected) { throw new Error(t('The source changed while you typed. Your draft is open and the source was preserved.')); }
			if (typed !== d.appliedText) {
				const end = d.appliedText === undefined ? d.range.end : at(expected, d.before.length + d.appliedText.length);
				const edit = new vscode.WorkspaceEdit();
				edit.replace(doc.uri, new vscode.Range(d.range.start, end), typed);
				if (!await workspace.applyEdit(edit)) { throw new Error(t('The editor could not apply your change. Retry the step.')); }
				d.appliedText = typed;
			}
			if (!await doc.save()) { throw new Error(t('The file could not be saved. Resolve the save conflict, then retry the step.')); }
			const result = lf(doc.getText());
			const actual = result.startsWith(d.before) && result.endsWith(d.after) ? result.slice(d.before.length, result.length - d.after.length) : typed;
			await closeDraft(s);
			await window.showTextDocument(doc, { preserveFocus: true, preview: false });
			await advance(s, { path: s.action.path, text: actual });
		} finally { d.saving = false; }
	}

	function draftChanged(event) {
		const s = session;
		if (!s || !event.contentChanges.length) { return; }
		if (s.observation && same(s.observation.doc.uri, event.document.uri)) {
			s.observation = undefined;
			for (const editor of window.visibleTextEditors) { editor.setDecorations(green, []); }
			update();
		}
		const d = s.draft;
		if (!d || !same(event.document.uri, d.uri) || d.saving) { return; }
		d.touched = true;
		const text = lf(event.document.getText());
		const valid = text.length >= d.before.length + d.after.length && text.startsWith(d.before) && text.endsWith(d.after);
		const marker = valid && completedEdit(text.slice(d.before.length, text.length - d.after.length));
		if (marker) { void commit(s, marker.text).catch(error => report(s, error)); }
		else {
			const problem = valid ? undefined : t('This step edits the selected range. Undo changes outside it to continue.');
			if (s.problem !== problem) { s.problem = problem; update(); }
			draw(window.activeTextEditor);
		}
	}
	own(workspace.onDidChangeTextDocument(draftChanged));
	own(window.onDidChangeTextEditorSelection(event => draw(event.textEditor)));
	own(window.onDidChangeActiveTextEditor(draw));

	own(workspace.onDidCreateFiles(guard(async event => {
		const s = session;
		if (s?.action?.kind !== 'create' || s.busy || s.draft) { return; }
		if (event.files.some(uri => same(uri, resource(s)))) { s.created = true; await openDraft(s); }
	})));

	async function present(s) {
		if (s.busy || session !== s) { return; }
		if (!s.action) { await plan(s); return; }
		if (s.draft) {
			const editor = await window.showTextDocument(s.draft.uri, { preview: false });
			const text = lf(editor.document.getText());
			const marker = s.draft.touched && text.startsWith(s.draft.before) && text.endsWith(s.draft.after) && completedEdit(text.slice(s.draft.before.length, text.length - s.draft.after.length));
			if (marker) { await commit(s, marker.text); }
			else { draw(editor); }
		} else if (s.action.kind === 'edit' || (s.action.kind === 'create' && s.created)) { await openDraft(s); }
		else if (s.action.kind === 'read' || s.action.kind === 'create') { await revealExplorer(s); }
		else if (s.action.kind === 'command') {
			if (!s.terminal) {
				const terminal = guideTerminal(s.action, s.root.fsPath, result => {
					s.terminal = undefined;
					if (session === s) { void advance(s, result).catch(error => report(s, error)); }
				}, () => { if (s.terminal === terminal) { s.terminal = undefined; } });
				s.terminal = terminal;
			}
			s.terminal.show();
		}
	}
	async function end() {
		const s = session;
		if (!s) { return; }
		session = undefined;
		s.terminal?.dispose();
		await closeDraft(s);
		for (const editor of window.visibleTextEditors) { editor.setDecorations(green, []); }
		update();
	}

	async function sample() {
		const root = await mkdtemp(path.join(tmpdir(), 'keyline-taskboard-'));
		await cp(context.asAbsolutePath('sample'), root, { recursive: true });
		await commands.executeCommand('vscode.openFolder', vscode.Uri.file(root), { forceNewWindow: true });
	}

	async function start(practice) {
		if (changing) { return; }
		changing = true;
		try {
			const folders = workspace.workspaceFolders || [];
			const folder = folders.length > 1 ? await window.showWorkspaceFolderPick() : folders[0];
			if (!folder) {
				if (practice && !folders.length) { await sample(); }
				else if (!folders.length) { await commands.executeCommand('workbench.action.files.openFolder'); }
				return;
			}
			let key;
			let goal;
			let model;
			if (practice) {
				try { await workspace.fs.stat(vscode.Uri.joinPath(folder.uri, 'src', 'tasks.js')); }
				catch {
					const open = t('Open Practice Workspace');
					if (await window.showInformationMessage(t('Practice guides use a fresh copy of Taskboard.'), open) === open) { await sample(); }
					return;
				}
				const pick = await window.showQuickPick(Object.entries(guides).map(([key, g]) => ({ key, label: g.title, detail: g.description })), { title: t('Choose a Practice Guide') });
				if (!pick) { return; }
				key = pick.key; goal = pick.label;
			} else {
				goal = await window.showInputBox({ title: t('Describe a Change'), prompt: t('What would you like to change in this workspace?'), validateInput: value => value.trim().length > 4000 ? t('Use up to 4000 characters.') : undefined });
				if (!goal?.trim()) { return; }
				goal = goal.trim();
				model = selectedModel(context);
				if (!await apiKeyForModel(context, model)) {
					const practiceKey = matchGuide(goal);
					if (practiceKey) {
						try {
							await workspace.fs.stat(vscode.Uri.joinPath(folder.uri, 'src', 'tasks.js'));
							key = practiceKey;
						} catch { /* A custom workspace uses the configured model. */ }
					}
					if (!key) {
						model = await chooseModel(context);
						if (!model) { return; }
					}
				}
			}
			if (session?.draft?.touched) {
				const replace = t('Start New Guide');
				if (await window.showWarningMessage(t('Starting a new guide closes your current typing draft.'), { modal: true }, replace) !== replace) { return; }
			}
			await end();
			const s = { root: folder.uri, key, goal, model, history: [] };
			session = s;
			await commands.executeCommand('keyline.guide.focus');
			await plan(s);
		} finally { changing = false; }
	}

	register('start', () => start(false));
	register('practice', () => start(true));
	register('chooseModel', async () => {
		const model = await chooseModel(context);
		if (model) { window.setStatusBarMessage(t('New Keyline guides will use {0} · {1}', providers[model.provider].label, model.model), 5000); }
	});
	register('open', () => commands.executeCommand('keyline.guide.focus'));
	register('stop', async () => {
		if (session?.draft?.touched) {
			const discard = t('Discard Draft');
			if (await window.showWarningMessage(t('End the guide and discard your unfinished edit?'), { modal: true }, discard) !== discard) { return; }
		}
		await end();
	});
	register('explorerOpened', observe);
	register('resume', async () => {
		if (session) { session.problem = undefined; update(); await present(session); }
	});
	register('continue', async () => {
		const s = session;
		const read = s?.observation;
		if (!read || read.version !== read.doc.version || s.busy) { return; }
		await advance(s, { path: s.action.path, startLine: read.range.start.line + 1, endLine: read.range.end.line + 1, text: lf(read.doc.getText(read.range)) });
	});
	own(new vscode.Disposable(() => session?.terminal?.dispose()));
	update();
	if (!context.workspaceState.get('agentOpened')) {
		void commands.executeCommand('keyline.guide.focus').then(() => context.workspaceState.update('agentOpened', true));
	}
}
