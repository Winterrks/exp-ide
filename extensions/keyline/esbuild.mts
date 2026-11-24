/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Keyline contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import path from 'node:path';
import { run } from '../esbuild-extension-common.mts';

const srcDir = path.join(import.meta.dirname, 'src');
await run({
	platform: 'node',
	format: 'esm',
	entryPoints: { extension: path.join(srcDir, 'extension.ts') },
	srcDir,
	outdir: path.join(import.meta.dirname, 'dist'),
}, process.argv);
