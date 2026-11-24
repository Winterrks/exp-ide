/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Keyline contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import minimatch from 'minimatch';

export const keylineSources = ['extensions/keyline/**/*.{ts,mts}', 'scripts/keyline-web-layout.mts', 'build/lib/keylineHygiene.ts'];
export const keylineSample = 'extensions/keyline/sample/**/*.js';
export const sampleNotice = ' Copyright (c) Keyline contributors. Licensed under the MIT License.';
export const keylineNotice = [
	'---------------------------------------------------------------------------------------------',
	' *  Copyright (c) Keyline contributors. All rights reserved.',
	' *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.',
	' *--------------------------------------------------------------------------------------------'
];

const samplePattern = new minimatch.Minimatch(keylineSample);
const sourcePatterns = keylineSources.map(pattern => new minimatch.Minimatch(pattern));

export function keylineCopyrightLines(file: string): string[] | undefined {
	if (samplePattern.match(file)) { return ['//' + sampleNotice]; }
	if (sourcePatterns.some(pattern => pattern.match(file))) {
		return ('/*' + keylineNotice.join('\n') + '*/').split('\n');
	}
	return undefined;
}
