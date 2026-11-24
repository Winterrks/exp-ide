/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Keyline contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { isFileResult, type Action } from '../src/actions.ts';
import { modelConfig, modelEndpoint, propose, type ModelRequest, type Provider, type Turn } from '../src/planner.ts';

test('the model receives file names first and then the actual human result', async () => {
	const ws = { tree: async () => [{ path: 'one.js' }, { path: 'two.js' }], read: () => assert.fail('Planner read a file') };
	const config = { apiKey: 'test', baseUrl: 'https://model.invalid/v1', model: 'test-model' };
	const read: Action = { kind: 'read', title: 'Inspect return', reason: 'Inspect the value.', path: 'one.js', startLine: 1, endLine: 1 };
	const edit: Action = { ...read, kind: 'edit', oldText: 'return 1;', text: 'return 2;' };
	const calls: Turn[] = [];
	const fake = (next: Action): ModelRequest => async (_url, options) => {
		calls.push(JSON.parse(JSON.parse(options.body).messages[1].content));
		return Response.json({ choices: [{ message: { content: JSON.stringify(next) } }] });
	};
	assert.deepEqual(await propose({ goal: 'Adjust the value' }, ws, config, fake(read)), read);
	assert.deepEqual(calls[0].observations, []); assert.deepEqual(calls[0].files, ['one.js', 'two.js']);
	const history = [{ action: read, result: { startLine: 1, endLine: 1, text: 'return 1;' } }];
	assert.deepEqual(await propose({ goal: 'Adjust', history }, ws, config, fake(edit)), edit);
	await assert.rejects(propose({ goal: 'Adjust', history: [] }, ws, config, fake(edit)), /invalid action/);
	const actual = { action: edit, result: { text: 'return 3;', matchedSuggestion: false } };
	const done: Action = { kind: 'done', title: 'Finished', reason: 'The learner chose three.' };
	await propose({ goal: 'Adjust', history: [...history, actual] }, ws, config, fake(done));
	const actualResult = calls.at(-1)?.observations.at(-1)?.result;
	assert.ok(actualResult && isFileResult(actualResult));
	assert.equal(actualResult.text, 'return 3;');
});

test('the environment default retains its own endpoint, model and credentials when switching providers', () => {
	const env = {
		KEYLINE_MODEL_API_KEY: 'legacy', KEYLINE_MODEL_BASE_URL: 'https://proxy.invalid/v1', KEYLINE_MODEL: 'legacy-model',
		OPENAI_API_KEY: 'openai', OPENROUTER_API_KEY: 'router', ANTHROPIC_API_KEY: 'anthropic', ANTHROPIC_MODEL: 'claude-local'
	};
	assert.deepEqual(modelConfig(env), { provider: 'openai', apiKey: 'legacy', baseUrl: env.KEYLINE_MODEL_BASE_URL, model: 'legacy-model' });
	assert.deepEqual(modelConfig(env, { provider: 'anthropic' }), {
		provider: 'anthropic', apiKey: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-local'
	});
	assert.equal(modelConfig({ KEYLINE_MODEL_PROVIDER: 'OpenRouter', ...env }).provider, 'openrouter');
	assert.equal(modelConfig({ KEYLINE_MODEL_PROVIDER: 'OpenRouter', ...env }, { provider: 'openai' }).apiKey, 'openai');
	assert.equal(modelConfig({ ANTHROPIC_API_KEY: 'a' }).provider, 'anthropic');
	assert.equal(modelConfig({ OPENROUTER_API_KEY: 'r' }, { provider: 'anthropic' }).apiKey, undefined);
	assert.equal(modelConfig({ OPENROUTER_API_KEY: 'r' }, { provider: 'openrouter', model: 'vendor/custom' }).model, 'vendor/custom');
	assert.throws(() => modelConfig({ KEYLINE_MODEL_PROVIDER: 'unknown' }), /Choose OpenAI/);
});

test('endpoint resolution supports base URLs, API paths and explicit operations', () => {
	for (const [provider, baseUrl, expected] of [
		['openai', undefined, 'https://api.openai.com/v1/chat/completions'],
		['openrouter', undefined, 'https://openrouter.ai/api/v1/chat/completions'],
		['anthropic', undefined, 'https://api.anthropic.com/v1/messages'],
		['anthropic', 'https://proxy.invalid/tenant/v1/', 'https://proxy.invalid/tenant/v1/messages'],
		['anthropic', 'https://proxy.invalid/v1/messages', 'https://proxy.invalid/v1/messages'],
		['openai', 'https://proxy.invalid/v1/responses/', 'https://proxy.invalid/v1/responses'],
		['openrouter', 'http://localhost:8000/chat/completions?version=1', 'http://localhost:8000/chat/completions?version=1']
	] as const) {
		assert.equal(modelEndpoint({ provider, baseUrl }).href, expected);
	}
	assert.throws(() => modelEndpoint({ provider: 'openai', baseUrl: 'file:///example' }), /HTTP/);
	assert.throws(() => modelEndpoint({ provider: 'anthropic', baseUrl: 'https://username:password@proxy.invalid' }), /HTTP/);
});

const goal = 'Explain the counter';
const ws = { tree: async () => [{ path: 'counter.js' }, { path: 'src', directory: true }] };
const read: Action = { kind: 'read', path: 'counter.js', startLine: 1, endLine: 1, title: 'Read counter', reason: 'Find its initial value.' };
const edit: Action = { ...read, kind: 'edit', oldText: 'return 1;', text: 'return 2;' };
const history = [{ action: read, result: { startLine: 1, endLine: 1, text: 'return 1;' } }];
const chat = (content: string) => ({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }] });
const wireFormats: { provider: Provider; path: string; reply: (text: string) => object }[] = [
	{ provider: 'openai', path: '/v1/chat/completions', reply: chat },
	{ provider: 'openrouter', path: '/v1/chat/completions', reply: text => chat(['```json', text, '```'].join('\n')) },
	{
		provider: 'anthropic', path: '/v1/messages', reply: text => ({
			type: 'message', role: 'assistant', stop_reason: 'end_turn',
			content: [{ type: 'thinking', thinking: 'internal' }, { type: 'text', text: text.slice(0, 12) }, { type: 'text', text: text.slice(12) }]
		})
	},
	{
		provider: 'openai', path: '/v1/responses', reply: text => ({
			status: 'completed', output: [{ type: 'reasoning' }, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }]
		})
	}
];

for (const { provider, path, reply } of wireFormats) {
	test(provider + ' ' + path + ' sends the learner turn and validates proposals', async () => {
		const responses = path.endsWith('/responses');
		const baseUrl = 'https://fixture.invalid' + (responses ? path : '/v1');
		const config = { provider, baseUrl, model: 'custom-model', apiKey: 'provider-test-key' };
		const received: Turn[] = [];
		const request = (action: Action): ModelRequest => async (url, options) => {
			assert.equal(url, 'https://fixture.invalid' + path);
			assert.equal(options.method, 'POST');
			assert.equal(options.redirect, 'error');
			const headers = new Headers(options.headers);
			const body = JSON.parse(options.body);
			assert.equal(body.model, 'custom-model');
			assert.equal(body.tools, undefined);
			assert.equal(headers.get('content-type'), 'application/json');
			if (provider === 'anthropic') {
				assert.equal(headers.get('x-api-key'), config.apiKey);
				assert.equal(headers.get('authorization'), null);
				assert.equal(headers.get('anthropic-version'), '2023-06-01');
				assert.ok(body.max_tokens > 0);
				assert.match(body.system, /learner performs manually/);
				assert.deepEqual(body.messages.map((m: { role: string }) => m.role), ['user']);
			} else {
				assert.equal(headers.get('authorization'), 'Bearer ' + config.apiKey);
				assert.equal(headers.get('x-api-key'), null);
				if (responses) {
					assert.match(body.instructions, /learner performs manually/);
					assert.equal(body.store, false);
				} else {
					assert.deepEqual(body.messages.map((m: { role: string }) => m.role), ['system', 'user']);
					assert.match(body.messages[0].content, /learner performs manually/);
					assert.deepEqual(body.response_format, provider === 'openai' ? { type: 'json_object' } : undefined);
				}
			}
			received.push(JSON.parse(responses ? body.input : body.messages.at(-1).content));
			return Response.json(reply(JSON.stringify(action)));
		};
		assert.deepEqual(await propose({ goal }, ws, config, request(read)), read);
		assert.deepEqual(received[0], { goal, files: ['counter.js'], observations: [] });
		await assert.rejects(propose({ goal }, ws, config, request(edit)), /invalid action/);
		assert.deepEqual(await propose({ goal, history }, ws, config, request(edit)), edit);
		assert.deepEqual(received.at(-1)?.observations, history);
	});
}

test('provider errors, refusals and incomplete responses produce no step', async () => {
	const complete = JSON.stringify(read);
	for (const [provider, baseUrl, response] of [
		['anthropic', '/v1', { stop_reason: 'max_tokens', content: [{ type: 'text', text: complete }] }],
		['openrouter', '/v1', { error: { message: 'unexpected failure' } }],
		['openrouter', '/v1', chat('Some explanation\n' + complete)],
		['openai', '/v1', { choices: [{ finish_reason: 'length', message: { content: complete } }] }],
		['openai', '/v1', { choices: [{ finish_reason: 'stop', message: { refusal: 'Declined', content: complete } }] }],
		['openai', '/v1/responses', { status: 'incomplete', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: complete }] }] }]
	] as const) {
		let calls = 0;
		const config = { provider, baseUrl: 'https://fixture.invalid' + baseUrl, apiKey: 'test', model: 'test' };
		await assert.rejects(propose({ goal }, ws, config, async () => { calls++; return Response.json(response); }), /unreadable|could not complete/);
		assert.equal(calls, 1);
	}
	await assert.rejects(propose({ goal }, ws, { provider: 'anthropic', apiKey: 'test', model: 'test' },
		async () => new Response('private error detail', { status: 401 })), error => {
			assert.ok(error instanceof Error);
		assert.match(error.message, /Anthropic returned HTTP 401/);
			assert.doesNotMatch(error.message, /private error detail/);
			return true;
		});
	await assert.rejects(propose({ goal }, { tree: assert.fail }, { provider: 'openai', model: 'test' }, assert.fail), /Choose Model/);
});
