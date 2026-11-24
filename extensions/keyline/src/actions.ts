/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Keyline contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
interface Step {
	title: string;
	reason: string;
	stage?: 'inspect' | 'edit' | 'test-read' | 'create' | 'command';
	index?: number;
}

interface Lines {
	startLine: number;
	endLine: number;
}

export type Action = Step & (
	| ({ kind: 'read'; path: string } & Lines)
	| ({ kind: 'edit'; path: string; oldText: string; text: string } & Lines)
	| { kind: 'create'; path: string; text: string }
	| { kind: 'command'; command: string }
	| { kind: 'done' }
);

export interface CommandResult {
	command: string;
	cwd: string;
	exitCode: number;
	output: string;
}

type FileResult = { path?: string; text: string; startLine?: number; endLine?: number };
type ReadResult = FileResult & Lines;
export type Result = FileResult | CommandResult;

export interface Observation {
	action: Action;
	result: Result;
}

export interface WorkspaceFile {
	path: string;
	directory?: boolean;
}

export function isFileResult(result: Result): result is FileResult {
	return Object.hasOwn(result, 'text');
}

export function isReadResult(result: Result): result is ReadResult {
	return isFileResult(result) && typeof result.startLine === 'number' && typeof result.endLine === 'number';
}
