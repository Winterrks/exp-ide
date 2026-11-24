/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Keyline contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getVersion } from '../build/lib/getVersion.ts';

const root = path.resolve(import.meta.dirname, '..');
const app = path.join(root, '.build/keyline-web');
const json = async name => JSON.parse(await readFile(path.join(root, name), 'utf8'));
async function link(source, target) {
	await mkdir(path.dirname(target), { recursive: true });
	try { await symlink(path.relative(path.dirname(target), source), target, 'dir'); }
	catch (error) { if (error.code !== 'EEXIST') { throw error; } }
}

// The Node extension host needs Node-ABI modules from remote, while the browser also needs web assets.
await mkdir(app, { recursive: true });
for (const folder of ['remote', 'remote/web']) {
	const manifest = await json(folder + '/package.json');
	for (const name of Object.keys(manifest.dependencies)) {
		await link(path.join(root, folder, 'node_modules', name), path.join(app, 'node_modules', name));
	}
}
await link(path.join(root, '.build/extensions'), path.join(app, 'extensions'));
await link(path.join(root, 'resources'), path.join(app, 'resources'));
const { version } = await json('package.json');
const commit = getVersion(root);
await writeFile(path.join(app, 'package.json'), JSON.stringify({ type: 'module', version }));
await writeFile(path.join(app, 'product.json'), JSON.stringify({ ...await json('product.json'), version, commit }));
