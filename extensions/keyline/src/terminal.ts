/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Keyline contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'node:child_process';
import { alignTyped, visibleChar } from './guidance.ts';
import type { Action, CommandResult } from './actions.ts';

const reset = '\x1b[0m';
const red = '\x1b[31m';
const dim = '\x1b[90m';

export function guideTerminal(action: Extract<Action, { kind: 'command' }>, cwd: string, submitted: (result: CommandResult) => void, closed: () => void) {
	const output = new vscode.EventEmitter<string>();
	let input = '';
	let cursor = 0;
	let started = false;
	let child: ChildProcess | undefined;
	let timer: NodeJS.Timeout | undefined;
	let disposed = false;

	function render() {
		const { errors } = alignTyped(input, action.command);
		const { next } = alignTyped(input.slice(0, cursor), action.command);
		const hint = visibleChar(next);
		let line = '';
		for (let i = 0; i <= input.length; i++) {
			if (i === cursor && hint) { line += dim + hint + reset; }
			if (i < input.length) {
				line += errors.some(([a, b]) => a <= i && i < b) ? red + input[i] + reset : input[i];
			}
		}
		const tail = Array.from(input.slice(cursor)).length + Number(Boolean(hint));
		output.fire('\r\x1b[2K$ ' + line + (tail ? '\x1b[' + tail + 'D' : ''));
	}

	function stop() {
		if (!child?.pid) { return; }
		try {
			if (process.platform === 'win32') { child.kill(); }
			else { process.kill(-child.pid, 'SIGKILL'); }
		} catch { /* A process may already have exited. */ }
	}

	function run() {
		if (!input.trim() || !vscode.workspace.isTrusted) { return; }
		started = true;
		output.fire('\r\x1b[2K$ ' + input + '\r\n');
		const env = { ...process.env };
		delete env.KEYLINE_MODEL_API_KEY;
		delete env.OPENAI_API_KEY;
		delete env.OPENROUTER_API_KEY;
		delete env.ANTHROPIC_API_KEY;
		const command = input;
		const shell = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : process.env.SHELL || '/bin/sh';
		const args = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-c', command];
		const running = spawn(shell, args, { cwd, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
		child = running;
		let captured = '';
		function write(data: string) {
			if (disposed) { return; }
			output.fire(data.replace(/\r?\n/g, '\r\n'));
			captured = (captured + data).slice(-16000);
		}
		for (const stream of [running.stdout, running.stderr]) { stream.setEncoding('utf8').on('data', write); }
		running.once('error', error => write(error.message + '\n'));
		timer = setTimeout(() => { write(vscode.l10n.t('Command timed out.') + '\n'); stop(); }, 60000);
		running.once('close', code => {
			clearTimeout(timer);
			child = undefined;
			if (!disposed) {
				output.fire('\r\n' + dim + vscode.l10n.t('Exit code {0}', code ?? 130) + reset + '\r\n');
				submitted({ command, exitCode: code ?? 130, output: captured, cwd: '' });
			}
		});
	}

	const pty: vscode.Pseudoterminal = {
		onDidWrite: output.event,
		open() { output.fire(action.reason.replace(/[\x00-\x1f\x7f]/g, ' ') + '\r\n\r\n'); render(); },
		close() { disposed = true; clearTimeout(timer); stop(); output.dispose(); closed(); },
		handleInput(data) {
			if (started) { if (data === '\x03') { stop(); } return; }
			if (data === '\r') { run(); return; }
			if (data === '\x03') { input = ''; cursor = 0; }
			else if (data === '\x7f' || data === '\b') {
				const previous = Array.from(input.slice(0, cursor)).pop()?.length || 0;
				input = input.slice(0, cursor - previous) + input.slice(cursor);
				cursor -= previous;
			} else if (data === '\x1b[D') { cursor -= Array.from(input.slice(0, cursor)).pop()?.length || 0; }
			else if (data === '\x1b[C') { cursor += Array.from(input.slice(cursor))[0]?.length || 0; }
			else if (data === '\x01' || data === '\x1b[H') { cursor = 0; }
			else if (data === '\x05' || data === '\x1b[F') { cursor = input.length; }
			else if (!/[\x00-\x1f\x7f]/.test(data) && input.length + data.length <= 8192) {
				input = input.slice(0, cursor) + data + input.slice(cursor);
				cursor += data.length;
			}
			render();
		}
	};
	return vscode.window.createTerminal({ name: vscode.l10n.t('Keyline Guide'), pty, iconPath: new vscode.ThemeIcon('terminal') });
}
