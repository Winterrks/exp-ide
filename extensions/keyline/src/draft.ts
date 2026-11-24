/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Keyline contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';

// Saves and Auto Save write only to this private buffer. The real resource is updated on //DONE.
export class DraftStore implements vscode.FileSystemProvider, vscode.Disposable {
	private readonly entries = new Map<string, { bytes: Uint8Array; ctime: number; mtime: number }>();
	private readonly changes = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	readonly onDidChangeFile = this.changes.event;

	create(path: string, text: string) {
		const uri = vscode.Uri.from({ scheme: 'keyline-draft', path: '/' + path, query: randomUUID() });
		const now = Date.now();
		this.entries.set(uri.toString(), { bytes: Buffer.from(text), ctime: now, mtime: now });
		return uri;
	}

	private entry(uri: vscode.Uri) {
		const found = this.entries.get(uri.toString());
		if (!found) { throw vscode.FileSystemError.FileNotFound(uri); }
		return found;
	}

	stat(uri: vscode.Uri) {
		const { bytes, ctime, mtime } = this.entry(uri);
		return { type: vscode.FileType.File, size: bytes.length, ctime, mtime };
	}

	readFile(uri: vscode.Uri) { return this.entry(uri).bytes; }
	writeFile(uri: vscode.Uri, bytes: Uint8Array) {
		const entry = this.entry(uri);
		entry.bytes = bytes;
		entry.mtime = Date.now();
		this.changes.fire([{ type: vscode.FileChangeType.Changed, uri }]);
	}

	release(uri: vscode.Uri) { this.entries.delete(uri.toString()); }
	watch() { return new vscode.Disposable(() => { }); }
	readDirectory() { return []; }
	createDirectory(): never { throw vscode.FileSystemError.NoPermissions(); }
	delete(): never { throw vscode.FileSystemError.NoPermissions(); }
	rename(): never { throw vscode.FileSystemError.NoPermissions(); }
	dispose() { this.entries.clear(); this.changes.dispose(); }
}
