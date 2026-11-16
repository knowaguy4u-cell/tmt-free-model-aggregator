import assert from 'node:assert/strict';
import { anthropicToOpenAI, openAIToAnthropic, openAIStreamWithModel, anthropicEventsFromOpenAI } from '../lib/wire.ts';
import { writeFileSync } from 'node:fs';
const model = 'openrouter/test/model:free';
const req = anthropicToOpenAI({ max_tokens: 73, system: [{ type: 'text', text: 'System instruction' }], temperature: .3, top_p: .9, stop_sequences: ['END'], tools: [{ name: 'lookup', input_schema: { type: 'object' } }], tool_choice: { type: 'tool', name: 'lookup' }, messages: [
  { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA==' } }, { type: 'text', text: 'Read this' }] },
  { role: 'assistant', content: [{ type: 'tool_use', id: 'call1', name: 'lookup', input: { id: 7 } }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call1', content: [{ type: 'text', text: 'value' }] }] },
], stream: true }, model);
assert.equal(req.messages[0].content, 'System instruction');
assert.equal(req.messages[1].content[0].image_url.url, 'data:image/png;base64,AA==');
assert.equal(req.messages[2].tool_calls[0].function.arguments, '{"id":7}');
assert.deepEqual(req.messages[3], { role: 'tool', tool_call_id: 'call1', content: 'value' });
assert.equal(req.max_tokens, 73);
assert.deepEqual(req.stop, ['END']);
assert.equal(req.tool_choice.function.name, 'lookup');
assert.equal(req.temperature, .3); assert.equal(req.top_p, .9);
assert.equal(req.stream_options.include_usage, true);
const answer = openAIToAnthropic({ id: 'fixture', choices: [{ message: { tool_calls: [{ id: 'call1', function: { name: 'lookup', arguments: '{"id":7}' } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 5, completion_tokens: 6 } }, model);
assert.equal(answer.stop_reason, 'tool_use');
assert.deepEqual(answer.content[0].input, { id: 7 });
assert.deepEqual(answer.usage, { input_tokens: 5, output_tokens: 6 });
const chunk = (delta, finish_reason = null) => ({ id: 'fixture', model: 'test/model:free', choices: [{ index: 0, delta, finish_reason }] });
const frames = [chunk({ role: 'assistant' }), chunk({ content: 'café 🛰' }), chunk({ tool_calls: [{ index: 0, id: 'call1', function: { name: 'lookup', arguments: '{"id":' } }] }), chunk({ tool_calls: [{ index: 0, function: { arguments: '7}' } }] }), chunk({}, 'tool_calls'), { choices: [], usage: { prompt_tokens: 5, completion_tokens: 6 } }];
const raw = frames.map(x => `data: ${JSON.stringify(x)}\r\n\r\n`).join('') + 'data: [DONE]\r\n\r\n';
function stream() { const bytes = Buffer.from(raw); return new ReadableStream({ start(c) { for (const b of bytes) c.enqueue(Uint8Array.of(b)); c.close(); } }); }
let oa = ''; for await (const event of openAIStreamWithModel(stream(), model)) oa += event;
assert.ok(oa.includes('café 🛰')); assert.ok(oa.endsWith('data: [DONE]\n\n'));
for (const frame of oa.split('\n\n')) { if (!frame.startsWith('data: {')) continue; assert.equal(JSON.parse(frame.slice(6)).model, model); }
let ant = ''; for await (const event of anthropicEventsFromOpenAI(stream(), model)) ant += event;
const events = ant.trim().split('\n\n').map(f => JSON.parse(f.split('\ndata: ')[1]));
assert.equal(events[0].type, 'message_start'); assert.equal(events.at(-1).type, 'message_stop');
assert.equal(events.at(-2).delta.stop_reason, 'tool_use'); assert.deepEqual(events.at(-2).usage, { input_tokens: 5, output_tokens: 6 });
assert.equal(events.filter(e => e.type === 'content_block_start').length, 2);
assert.equal(events.filter(e => e.delta?.type === 'input_json_delta').map(e => e.delta.partial_json).join(''), '{"id":7}');
writeFileSync(new URL('../artifacts/wire-report.json', import.meta.url), JSON.stringify({ passed: true, cases: ['system, image, tools and tool results', 'output caps, sampling, stop sequences', 'tool JSON answer and usage', 'single-byte UTF-8 and CRLF fragmentation', 'OpenAI model rewrite and DONE', 'Anthropic text/tool event order and usage'] }, null, 2));
console.log('Wire checks passed (including one-byte UTF-8 and CRLF chunks).');
