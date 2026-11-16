// Offline protocol fixtures only. These are NOT models or evidence of live quality.
import { createServer, launch } from './virtual.mjs';

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { readBrief, freeModels, meetsRequirements, capabilitiesOf, buildCatalog } from '../lib/providers.ts';
const kit = resolve(process.argv[2] || '/home/hatch/workspace/goals/wealth-pipeline/hidden_files/makefun/free-model-aggregator-02-kit/unpacked/free-model-aggregator-02-kit');
const root = resolve(import.meta.dirname, '..');
const report = [];
async function run(trial, scenario, pass) {
  const dir = join(root, 'artifacts', `trial-${trial}-${scenario}-${pass}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const practice = join(kit, 'practice', `trial-${trial}`);
  const brief = readBrief(join(practice, 'input/prompt.txt'));
  const workload = JSON.parse(readFileSync(join(practice, 'input/env/workload.json')));
  const calls = [];

  const gateway = createServer(async (req, res) => {
    try {
      assert.equal(req.url, '/v1/chat/completions');
      let raw = ''; for await (const c of req) raw += c;
      const body = JSON.parse(raw);
      const token = JSON.stringify(body.messages).match(/[A-Z]+-\d{4}/)?.[0];
      const row = workload.manifest.find(p => p.token === token);
      assert.ok(row);
      const m = freeModels(brief).find(m => m.id === body.model);
      assert.ok(m && meetsRequirements(row.requires, capabilitiesOf(m)));
      const original = workload.bodies[row.id];
      assert.equal(body.max_tokens, original.max_tokens);
      assert.equal(body.temperature, original.temperature);
      if (original.system) assert.equal(body.messages[0].content, original.system);
      if (original.response_format) assert.deepEqual(body.response_format, original.response_format);
      if (original.tools) assert.equal(body.tools[0].function.name, original.tools[0].name);
      calls.push(body);
      if (scenario === 'refusal' && (calls.length <= 2 || calls.length === 4)) {
        res.writeHead(calls.length === 4 ? 503 : 429, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: { code: 'rate_limit', message: 'offline injected refusal' } }));
      }
      const content = body.response_format ? JSON.stringify({ token }) : token;
      const bare = body.model.replace(/^openrouter\//, '');
      const usage = { prompt_tokens: 31, completion_tokens: 9, total_tokens: 40 };
      if (!body.stream) {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ id: 'fixture', object: 'chat.completion', created: 0, model: bare, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage }));
      }
      assert.equal(body.stream_options.include_usage, true);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const chunk = (delta, finish_reason = null) => ({ id: 'fixture', object: 'chat.completion.chunk', created: 0, model: bare, choices: [{ index: 0, delta, finish_reason }] });
      const frames = [chunk({ role: 'assistant' }), chunk({ content: content.slice(0, 3) }), chunk({ content: content.slice(3) }), chunk({}, 'stop'), { ...chunk({}), choices: [], usage }];
      const bytes = frames.map(c => `data: ${JSON.stringify(c)}\r\n\r\n`).join('') + 'data: [DONE]\r\n\r\n';
      // Split UTF-8 and CRLF framing across writes, as real transport may do.
      for (let i = 0; i < bytes.length; i += 17) res.write(bytes.slice(i, i + 17));
      res.end();
    } catch (e) { res.writeHead(500); res.end(String(e)); report.push({ fixtureError: String(e) }); }
  });
  await new Promise(r => gateway.listen(0, '127.0.0.1', r));
  const env = await launch(join(kit, 'program/env/server.mjs'), { ...process.env, MAKEFUN_ENV_DATA_DIR: join(practice, 'input/env'), MAKEFUN_STATE_DIR: dir, MAKEFUN_ENV_PORT: '0' });
  let envLog = ''; env.stdout.on('data', b => envLog += b); env.stderr.on('data', b => envLog += b);
  let bot;
  try {
    for (let i = 0; !existsSync(join(dir, 'ready')); i++) { assert.ok(i < 100, envLog); await delay(30); }
    const ready = JSON.parse(readFileSync(join(dir, 'ready')));
    const variables = { ...process.env, MAKEFUN_PROMPT_FILE: join(practice, 'input/prompt.txt'), MAKEFUN_ENV_URL: `http://127.0.0.1:${ready.port}`, OPENAI_BASE_URL: `http://127.0.0.1:${gateway.address().port}/v1`, OPENAI_API_KEY: 'offline-dummy' };
    const listBot = await launch(join(root, 'main.ts'), variables, ['--list']);
    const listing = { stdout: '' };
    listBot.stdout.on('data', b => listing.stdout += b);
    await listBot.ready;
    assert.equal(listing.stdout, JSON.stringify(buildCatalog(brief)) + '\n');
    writeFileSync(join(dir, 'catalog.json'), listing.stdout);
    bot = await launch(join(root, 'main.ts'), variables);
    let botLog = ''; bot.stderr.on('data', b => botLog += b);
    const status = await Promise.race([new Promise(r => bot.on('exit', r)), delay(20000).then(() => 'timeout')]);
    assert.equal(status, 0, botLog);
    const envExit = new Promise(r => env.on('exit', r)); env.kill('SIGTERM'); await envExit;
    const state = JSON.parse(readFileSync(join(dir, 'export/state.json')));
    assert.equal(state.totals.valid, 6, JSON.stringify(state.prompts));
    assert.deepEqual(state.catalog, JSON.parse(listing.stdout));
    if (scenario === 'refusal') {
      assert.equal(calls.length, 9);
      assert.equal(state.totals.failed_prompts, 2);
      assert.equal(state.totals.failover_handled, 2);
      assert.equal(state.prompts[0].failures[0].status, 429);
      assert.equal(state.prompts[1].failures[0].status, 503);
    }
    if (scenario === 'normal') {
      assert.equal(calls.length, 6);
      for (let i = 0; i < 6; i++) {
        const best = freeModels(brief).filter(m => meetsRequirements(workload.manifest[i].requires, capabilitiesOf(m))).sort((a,b) => b.rating_milli-a.rating_milli)[0];
        assert.equal(calls[i].model, best.id);
      }
    }
    writeFileSync(join(dir, 'requests.json'), JSON.stringify(calls, null, 2));
    writeFileSync(join(dir, 'bot.log'), botLog);
    const scorer = await launch(join(kit, 'program/scorer/score.mjs'), { ...process.env, MAKEFUN_OUTPUT_DIR: join(dir, 'export'), MAKEFUN_REFERENCE_DIR: join(practice, 'reference'), MAKEFUN_CASSETTE_DIR: join(dir, 'no-live-cassette'), MAKEFUN_SCORES_DIR: join(dir, 'scores') });
    let scoreText = ''; scorer.stdout.on('data', b => scoreText += b); scorer.stderr.on('data', b => scoreText += b);
    await scorer.ready;
    writeFileSync(join(dir, 'scorer.log'), scoreText);
    report.push({ trial, scenario, pass, valid: state.totals.valid, calls: calls.length, scorer: scoreText.trim() });
    return { state: readFileSync(join(dir, 'export/state.json'), 'utf8'), calls };
  } finally { bot?.kill(); env.kill(); gateway.closeAllConnections(); await new Promise(r => gateway.close(r)); }
}
for (let trial = 0; trial < 3; trial++) {
  for (const scenario of ['normal', 'refusal']) {
    const a = await run(trial, scenario, 1);
    const b = await run(trial, scenario, 2);
    assert.equal(a.state, b.state, 'State must match byte for byte');
    assert.deepEqual(a.calls, b.calls, 'Routing must reproduce');
  }
}
writeFileSync(join(root, 'artifacts/offline-report.json'), JSON.stringify({ kind: 'OFFLINE FIXTURE; NOT LIVE MODEL EVIDENCE', report, deterministic: true }, null, 2));
console.log(JSON.stringify(report, null, 2));
